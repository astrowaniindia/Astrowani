/**
 * geminiChat.js — the Gemini transport, as a reusable module.
 *
 * Walks the key chain, then the model list on each key, with per-model timeouts,
 * a whole-request budget and a short-lived block on a model that is out of quota,
 * retired or overloaded. Resolves { reply } or { fallback, reason } and NEVER
 * throws: a caller in front of a customer must always have something to say.
 *
 * WHY THIS EXISTS RATHER THAN A CALL INTO freeChatAi.js. That module has the same
 * plumbing and does not export it. It is also the live free-chat path, delicate,
 * and carrying a year of measured decisions in its comments (which models answer
 * in 1-3s, which are retired, which need thinkingLevel 'minimal', that Gemma
 * refuses systemInstruction). Exporting its internals would mean refactoring the
 * module every new chat feature runs through, and a regression there is a customer
 * watching "typing..." forever. So this is a second implementation of the same
 * rules, deliberately, and freeChatAi.js is untouched.
 *
 * The rules themselves were not re-derived — they are the ones measured in
 * freeChatAi.js's header and comments, carried across:
 *   - Keys are tried STRICTLY IN ORDER, each only after the one before is used up.
 *     Several models of one key is ordinary use; rotating accounts to multiply one
 *     model's free quota is what Google's terms forbid, and that is not what the
 *     chain does.
 *   - Gemma on the Gemini API does not accept systemInstruction, so for Gemma the
 *     system text leads the first user turn.
 *   - Gemini 3.x/Gemma 4 think by default and must be asked for minimal thinking,
 *     or they spend the whole token cap producing nothing.
 *   - A 400 naming "thinking" means that model does not know the field: retry once
 *     without it and never send it there again.
 *   - 429 per-day clears at midnight Pacific, per-minute in a minute.
 */

const axios = require('axios');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULTS = {
  // The whole reply, across every key and model tried. Callers in an app should
  // use a client timeout LONGER than this, so the app always hears "fall back"
  // from the server rather than giving up on its own.
  requestBudgetMs: 15000,
  // One model's turn. A healthy model answers in 1-3s; waiting longer is better
  // spent on the next model.
  perModelTimeoutMs: 6500,
  // Below this much budget left, starting another model cannot finish in time.
  minAttemptMs: 2500,
  maxModels: 8,
  temperature: 0.8,
  maxOutputTokens: 1024,
  maxReplyChars: 1200,
};

const MODEL_NAME_RE = /^[a-z0-9.\-]+$/i;

/* ------------------------------------------------------------------ */
/* The key chain                                                      */
/* ------------------------------------------------------------------ */

/**
 * The keys to try, in order. Same names and same order as freeChatAi.js and
 * src/blogAgent/gemini.js, so one VPS .env serves all three and a key added for
 * any of them is available to the others. A key that is not set is simply absent.
 */
function geminiKeys(env = process.env) {
  return [
    ['free', env.GEMINI_API_KEY],
    ['consult', env.GEMINI_API_KEY_CONSULT || env.GEMINI_API_KEY_PAID],
    ['product', env.GEMINI_API_KEY_PRODUCT || env.GEMINI_API_KEY_3],
    ['startup', env.GEMINI_API_KEY_STARTUP],
    ['wasteee006', env.GEMINI_API_KEY_WASTEEE006],
    ['priya', env.GEMINI_API_KEY_PRIYA],
    ['rajiv', env.GEMINI_API_KEY_RAJIV],
    ['krish', env.GEMINI_API_KEY_KRISH],
  ]
    .filter(([, k]) => !!k)
    .map(([tier, key]) => ({ tier, key }));
}

/* ------------------------------------------------------------------ */
/* Block state                                                        */
/* ------------------------------------------------------------------ */

// Per-process, lost on restart, which is fine: the worst case is one extra call
// that hits the same limit and re-arms the block. Keyed by model AND key tier —
// the same model can be out of quota on one key and healthy on the next, so a
// single key would silently take a working model out of the chain.
const blocks = new Map();

const slotKey = (model, tier) => `${model}@${tier}`;

function isBlocked(model, tier) {
  const b = blocks.get(slotKey(model, tier));
  if (!b) return false;
  if (Date.now() >= b.until) { blocks.delete(slotKey(model, tier)); return false; }
  return true;
}

function block(model, tier, ms, reason) {
  blocks.set(slotKey(model, tier), { until: Date.now() + ms, reason });
}

function blockState() {
  const out = [];
  for (const [k, v] of blocks.entries()) {
    if (Date.now() < v.until) out.push({ slot: k, reason: v.reason, secondsLeft: Math.round((v.until - Date.now()) / 1000) });
  }
  return out;
}

/** Google's free daily quotas reset at midnight Pacific, not local midnight. */
function msUntilPacificMidnight() {
  const now = new Date();
  // Pacific is UTC-8 or UTC-7; -8 is the safe assumption (it blocks for slightly
  // longer than needed rather than retrying into a wall).
  const pacificNow = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  const next = new Date(pacificNow);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(60 * 1000, next.getTime() - pacificNow.getTime());
}

/* ------------------------------------------------------------------ */
/* Request shaping                                                    */
/* ------------------------------------------------------------------ */

const isGemma = (model) => /^gemma/i.test(model);

function thinkingConfigFor(model) {
  if (/^gemini-[3-9]/i.test(model) || /^gemma-[4-9]/i.test(model)) return { thinkingLevel: 'minimal' };
  if (/^gemini-2\.5/i.test(model)) return { thinkingBudget: 0 };
  return null;
}
const noThinkingConfigModels = new Set();

/**
 * Build the request body for one model.
 *
 * Gemma does not accept systemInstruction and answers 400, so for Gemma the
 * system text is prepended to the first user turn instead. Getting this wrong
 * fails only on the Gemma models in the list, i.e. intermittently.
 */
function buildBody(model, system, contents, opts) {
  const body = {
    contents,
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.withThinkingConfig ? { thinkingConfig: thinkingConfigFor(model) } : {}),
    },
  };
  if (isGemma(model)) {
    const [first, ...rest] = contents;
    body.contents = [
      { role: 'user', parts: [{ text: `${system}\n\n---\nThe conversation starts now.\n\n${first.parts[0].text}` }] },
      ...rest,
    ];
  } else {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  return body;
}

/**
 * App messages -> Gemini contents.
 *
 * Gemini requires the first turn to be the user's, but a chat that opens with the
 * astrologer greeting starts with a model turn. Dropping that greeting (the
 * obvious fix) means the model never sees that it already said Namaste and greets
 * again on the first real message — observed in production on 2026-09-13. So the
 * greeting is kept, behind a synthetic opening user turn.
 */
function toContents(history, { openingTurn, historyLimit = 24, maxMessageChars = 600, userRole = 'user' } = {}) {
  const cleaned = (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.message === 'string' && m.message.trim())
    .slice(-historyLimit)
    .map((m) => ({
      role: m.sender === userRole || m.sender === 'me' || m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.message.slice(0, maxMessageChars) }],
    }));

  if (!cleaned.length || !cleaned.some((c) => c.role === 'user')) {
    return [{ role: 'user', parts: [{ text: openingTurn || 'Begin.' }] }];
  }
  if (cleaned[0].role !== 'user') {
    cleaned.unshift({ role: 'user', parts: [{ text: openingTurn || 'Begin.' }] });
  }
  // Two consecutive same-role turns (the customer sent twice while a reply was
  // typing) are merged, which every model accepts.
  const merged = [];
  for (const c of cleaned) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === c.role) prev.parts[0].text += `\n${c.parts[0].text}`;
    else merged.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
  }
  return merged;
}

/* ------------------------------------------------------------------ */
/* One attempt                                                        */
/* ------------------------------------------------------------------ */

/**
 * One model, one attempt. Resolves { reply } or { fail, reason, detail, final }.
 * `final` means another model would not help — the prompt itself was refused.
 * Never throws. Updates that slot's block state.
 */
async function tryModel({ key, tier, model, system, contents, timeoutMs, temperature, maxOutputTokens, maxReplyChars, post }) {
  const http = post || ((url, body, cfg) => axios.post(url, body, cfg));
  const request = (withThinkingConfig) => http(
    `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
    buildBody(model, system, contents, { temperature, maxOutputTokens, withThinkingConfig }),
    { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout: timeoutMs },
  );

  try {
    let data;
    const useThinkingConfig = !noThinkingConfigModels.has(model) && !!thinkingConfigFor(model);
    try {
      ({ data } = await request(useThinkingConfig));
    } catch (err) {
      const msg = err.response?.data?.error?.message || '';
      if (useThinkingConfig && err.response?.status === 400 && /thinking/i.test(msg)) {
        noThinkingConfigModels.add(model);
        ({ data } = await request(false));
      } else {
        throw err;
      }
    }

    if (data?.promptFeedback?.blockReason) {
      return { fail: true, reason: 'blocked', detail: data.promptFeedback.blockReason, final: true };
    }
    const candidate = data?.candidates?.[0];
    const raw = (candidate?.content?.parts || [])
      .map((p) => (typeof p.text === 'string' && !p.thought ? p.text : ''))
      .join('')
      .trim();
    if (!raw) return { fail: true, reason: 'empty', detail: candidate?.finishReason || 'no text' };

    // Markdown the model slipped in anyway renders as literal asterisks in the app.
    const reply = raw
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[*•]\s+/gm, '')
      .slice(0, maxReplyChars);
    return { reply, model, tier };
  } catch (err) {
    const status = err.response?.status;
    const apiError = err.response?.data?.error;
    const detail = apiError?.message || err.message;
    if (status === 429) {
      const quotaIds = JSON.stringify(apiError?.details || []);
      const perDay = /PerDay/i.test(quotaIds) || /per day|daily/i.test(detail || '');
      block(model, tier, perDay ? msUntilPacificMidnight() : 60 * 1000, perDay ? 'daily limit' : 'per-minute limit');
      return { fail: true, reason: 'quota', detail };
    }
    if (status === 404 || (status === 400 && /not (found|supported)|no longer available/i.test(detail || ''))) {
      block(model, tier, 60 * 60 * 1000, 'unavailable');
      return { fail: true, reason: `http_${status}`, detail };
    }
    if (status === 500 || status === 503) {
      block(model, tier, 2 * 60 * 1000, 'overloaded');
      return { fail: true, reason: `http_${status}`, detail };
    }
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message)) {
      return { fail: true, reason: 'timeout', detail };
    }
    return { fail: true, reason: status ? `http_${status}` : 'network', detail };
  }
}

/* ------------------------------------------------------------------ */
/* The walk                                                           */
/* ------------------------------------------------------------------ */

function cleanModels(list, fallback) {
  const out = (Array.isArray(list) ? list : [])
    .map((m) => String(m || '').trim())
    .filter((m) => m && MODEL_NAME_RE.test(m))
    .slice(0, DEFAULTS.maxModels);
  return out.length ? out : fallback;
}

/**
 * Ask Gemini. Resolves { reply, model, tier, attempts } or
 * { fallback: true, reason, detail, attempts }. Never throws.
 *
 * Deliberately returns a fallback rather than rejecting: the caller is talking to
 * a person, and "the request failed" is not a thing a person can be told.
 */
async function ask({
  system,
  contents,
  models,
  env,
  keys: keysIn,
  requestBudgetMs = DEFAULTS.requestBudgetMs,
  perModelTimeoutMs = DEFAULTS.perModelTimeoutMs,
  minAttemptMs = DEFAULTS.minAttemptMs,
  temperature = DEFAULTS.temperature,
  maxOutputTokens = DEFAULTS.maxOutputTokens,
  maxReplyChars = DEFAULTS.maxReplyChars,
  ignoreBlocks = false,
  onlyTier = null,
  post,
  log = () => {},
}) {
  const keys = (keysIn || geminiKeys(env)).filter((k) => !onlyTier || k.tier === onlyTier);
  if (!keys.length) return { fallback: true, reason: onlyTier ? `no_${onlyTier}_key` : 'no_api_key', attempts: [] };

  const modelList = cleanModels(models, []);
  if (!modelList.length) return { fallback: true, reason: 'no_models', attempts: [] };

  const startedAt = Date.now();
  const left = () => requestBudgetMs - (Date.now() - startedAt);
  const attempts = [];

  for (const { tier, key } of keys) {
    for (const model of modelList) {
      if (!ignoreBlocks && isBlocked(model, tier)) {
        attempts.push({ model, tier, reason: 'blocked_locally' });
        continue;
      }
      const remaining = left();
      if (remaining < minAttemptMs) {
        attempts.push({ model, tier, reason: 'out_of_budget' });
        // Out of time is out of time — no later key can help.
        return { fallback: true, reason: 'budget_exhausted', attempts };
      }
      const r = await tryModel({
        key,
        tier,
        model,
        system,
        contents,
        timeoutMs: Math.min(perModelTimeoutMs, remaining),
        temperature,
        maxOutputTokens,
        maxReplyChars,
        post,
      });
      if (r.reply) {
        attempts.push({ model, tier, ok: true });
        return { reply: r.reply, model, tier, attempts };
      }
      attempts.push({ model, tier, reason: r.reason, detail: String(r.detail || '').slice(0, 200) });
      log(`[geminiChat] ${model}@${tier} ${r.reason}`);
      if (r.final) {
        // The prompt itself was refused; every other model will refuse it too.
        return { fallback: true, reason: r.reason, detail: r.detail, attempts };
      }
    }
  }
  return { fallback: true, reason: 'all_models_failed', attempts };
}

module.exports = {
  ask,
  geminiKeys,
  toContents,
  cleanModels,
  blockState,
  DEFAULTS,
  // exported for the harness
  _internal: { tryModel, buildBody, thinkingConfigFor, isBlocked, block, blocks, msUntilPacificMidnight, isGemma },
};
