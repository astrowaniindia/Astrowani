// ─────────────────────────────────────────────────────────────────────────────
// The text generator: Gemini, free tier, via the key pool this project already
// runs for the free chat AI.
//
// WHY A SEPARATE FILE AND NOT `require('../freeChatAi')`. freeChatAi.js is a
// long-lived module owned by the Express process: it holds per-day stats, a
// per-customer counter and model blocks in module state, reads its config out of
// `app_settings`, and is shaped around answering one customer turn fast. The blog
// agent is a short-lived cron process that wants the opposite trade: few calls,
// each large and slow, and a hard failure if none of the keys work. Sharing that
// module would mean a cron run mutating the server's counters and inheriting its
// 60s config cache for no benefit. The ONLY thing worth sharing is the key order,
// and that is read from env here exactly as it is there.
//
// COST: zero, and it must stay that way. Three articles a day is ~6 calls a day
// (one per article, plus retries), which sits far inside the free tier's daily
// request allowance on a single key — and there are six keys behind it.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Models in preference order: best prose first, most RELIABLE last.
 *
 * MEASURED AGAINST THE LIVE API 2026-10-13, which is the only reason this list
 * is what it is. The first version named gemini-2.5-flash and gemini-2.0-flash
 * and every single call 404'd — both are retired, and the API's own error text
 * said to move to the 3.x line. Guessing model names from memory does not work;
 * `GET /v1beta/models` is the authority.
 *
 * What that probe actually found, on a free-tier key:
 *   gemini-3.8-flash        timed out at 45s (succeeds with the 120s this file allows)
 *   gemini-3.7/3.6/3.5-flash  503 "currently experiencing high demand"
 *   gemini-3.5-flash-lite   answered immediately
 *   gemini-3.1-flash-lite   answered immediately
 *
 * So the full flash tier is routinely saturated on the free tier while the lite
 * tier is not. Flash still leads because an article's prose is noticeably better
 * for it, but the chain has to fall through to lite rather than treating a 503 as
 * a failure — which is why worthRetryingOnAnotherKey() includes 503.
 *
 * THE LAST ENTRY IS AN ALIAS ON PURPOSE. `gemini-flash-lite-latest` cannot 404
 * when a numbered version retires, so the agent can never end up in the state
 * this list started in: every model gone, nothing published, and the reason
 * invisible until somebody reads a log.
 */
const DEFAULT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
];

/**
 * The key chain, in the same order and under the same names as freeChatAi.js, so
 * a VPS .env written for that module needs no new variables. A key that is not
 * set is simply absent from the chain.
 */
function geminiKeys() {
  const e = process.env;
  const chain = [
    ['free', e.GEMINI_API_KEY],
    ['consult', e.GEMINI_API_KEY_CONSULT || e.GEMINI_API_KEY_PAID],
    ['product', e.GEMINI_API_KEY_PRODUCT || e.GEMINI_API_KEY_3],
    ['startup', e.GEMINI_API_KEY_STARTUP],
    ['wasteee006', e.GEMINI_API_KEY_WASTEEE006],
    ['priya', e.GEMINI_API_KEY_PRIYA],
    // "rajiv" (the owner's name for it, 2026-10-13), added for the blog agent.
    // Last in the chain, so it is only reached when the six before it refuse —
    // which also means adding it cannot change the behaviour of anything that
    // was already working.
    ['rajiv', e.GEMINI_API_KEY_RAJIV],
  ];
  return chain.filter(([, k]) => !!k).map(([tier, key]) => ({ tier, key }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Is this worth trying the NEXT key for, or is the request itself bad?
 *
 * The distinction matters: 429 (quota) and 5xx (provider trouble) are about the
 * key or the moment, so another key may well succeed. A 400 is our prompt being
 * malformed and will fail identically on all six keys — walking the chain there
 * just burns six requests to arrive at the same error, which is the shape of
 * self-sustaining failure autoTranslate.js records getting itself rate-limited
 * with.
 */
function worthRetryingOnAnotherKey(status) {
  return status === 429 || status === 403 || status === 500 || status === 503 || status === 504 || status == null;
}

/**
 * One generation call.
 *
 * Walks model x key until something answers, and throws only when EVERY
 * combination has refused — with all the statuses in the message, because
 * "generation failed" without them is an unactionable log line at 3am.
 *
 * `json: true` asks Gemini for `application/json` directly. That is materially
 * more reliable than asking for JSON in the prompt and hoping, which is how a
 * generator ends up with a fenced ```json block, a trailing comma or a
 * conversational preamble to strip. parseJson below still tolerates all three,
 * because "more reliable" is not "guaranteed".
 */
async function generate({
  prompt,
  system,
  models = DEFAULT_MODELS,
  json = false,
  temperature = 0.85,
  maxOutputTokens = 8192,
  timeoutMs = 120000,
  log = () => {},
}) {
  const keys = geminiKeys();
  if (!keys.length) {
    throw new Error('No Gemini key configured — set GEMINI_API_KEY (see src/freeChatAi.js for the full chain)');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
    // The blog is published without a human reading it first, so the safety
    // settings are left at Gemini's defaults deliberately. An article the
    // provider declines to write is an article that should not auto-publish.
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const failures = [];
  for (const model of models) {
    for (const { tier, key } of keys) {
      try {
        const { data } = await axios.post(
          `${BASE}/${encodeURIComponent(model)}:generateContent`,
          body,
          { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, timeout: timeoutMs },
        );

        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();

        // A MAX_TOKENS finish means the JSON is truncated and unparseable. Treat
        // it as a failure of this model rather than returning a half article —
        // silently publishing a piece that stops mid-sentence is worse than
        // skipping the slot.
        if (!text) {
          failures.push(`${model}/${tier}: empty (finish=${cand?.finishReason || 'none'})`);
          continue;
        }
        if (cand?.finishReason === 'MAX_TOKENS' && json) {
          failures.push(`${model}/${tier}: truncated at MAX_TOKENS`);
          continue;
        }

        log(`gemini ok via ${model} (${tier} key), ${text.length} chars`);
        return { text, model, tier };
      } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data?.error?.message || err.message;
        failures.push(`${model}/${tier}: ${status || 'net'} ${String(detail).slice(0, 140)}`);
        if (!worthRetryingOnAnotherKey(status)) break; // our prompt is bad — next model, not next key
        await sleep(400);
      }
    }
  }
  throw new Error(`Gemini refused every model/key combination:\n  - ${failures.join('\n  - ')}`);
}

/**
 * Parse a model's JSON reply.
 *
 * Tolerant on purpose: a ```json fence, a preamble before the object, and a
 * trailing comma are the three things a model does even when asked for raw JSON,
 * and each would otherwise throw away a perfectly good article.
 */
function parseJson(text) {
  let s = String(text || '').trim();

  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(s);
  if (fence) s = fence[1].trim();

  // Take from the first brace to the last — drops any chat around the object.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    if (first !== -1 && last > first) s = s.slice(first, last + 1);
  }

  try {
    return JSON.parse(s);
  } catch (_) {
    // One repair pass: trailing commas before } or ].
    try {
      return JSON.parse(s.replace(/,\s*([}\]])/g, '$1'));
    } catch (err) {
      throw new Error(`Model did not return parseable JSON: ${err.message}`);
    }
  }
}

module.exports = { generate, parseJson, geminiKeys, DEFAULT_MODELS };
