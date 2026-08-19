// astrowani-backend/src/autoTranslate.js
//
// Free English -> Hindi machine translation for admin-authored blog content.
//
// WHY THIS EXISTS (2026-08-19). Blogs are written in English only, but the
// customer app has a Hindi toggle. Everything needed to SHOW Hindi already
// existed — `blogs.title_hi`/`excerpt_hi`/`meta_description_hi`/`content_hi`
// columns, `/api/blogs` returning them under `hindi`, and BlogList.js already
// preferring `item.hindi.title` with an English fallback. The columns were
// simply never populated, so the Hindi toggle left blog cards in English.
// This fills them; nothing downstream had to change.
//
// COST: zero, and it must stay that way. MyMemory's public endpoint needs no
// API key. The daily character allowance is small (~5k anonymous, ~50k when a
// contact address is supplied via MYMEMORY_EMAIL), which is workable ONLY
// because results are persisted to the blog row and reused forever — a given
// blog is translated once, not once per reader. Never call this on a hot path
// per-request without writing the result back.
//
// FAIL-SOFT BY DESIGN: every failure path returns null. The caller then leaves
// the Hindi column empty and the app falls back to English, which is exactly
// the pre-existing behaviour. A translation outage must never break blogs.

const axios = require('axios');

const ENDPOINT = 'https://api.mymemory.translated.net/get';
// MyMemory rejects/truncates long queries; keep each request comfortably under
// its ~500 character limit and split on sentence boundaries so the translator
// still sees whole sentences (it produces markedly worse Hindi mid-sentence).
const MAX_CHUNK = 450;
const REQUEST_TIMEOUT_MS = 12000;
// Courtesy spacing between calls. The free tier throttles aggressively on
// bursts, and a blog is translated once ever, so there is no reason to rush.
const INTER_REQUEST_DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Circuit breaker ──────────────────────────────────────────────────────────
//
// ADDED 2026-08-19 after this module rate-limited itself into a permanent
// outage on the VPS. The first version had no failure handling at all: a blog
// whose translation failed kept its column empty, so the next /api/blogs
// request re-queued it, which failed again, forever. Every app launch that
// loaded blogs fired more requests at a provider that was already refusing us.
// Production logs were a solid wall of "Request failed with status code 429" —
// the limit was real, but OUR RETRY LOOP is what made it permanent, because a
// rate limit only clears if you stop knocking.
//
// So: on repeated failure, stop calling entirely for a cooling-off period. Any
// backoff would do; what matters is that the failure path can no longer sustain
// itself. Successful calls reset the counter, so a transient blip costs one
// pause rather than latching off.
const FAILURES_BEFORE_TRIP = 3;
const COOLDOWN_MS = 60 * 60 * 1000; // an hour — these are daily quotas
let consecutiveFailures = 0;
let cooldownUntil = 0;

function breakerOpen() {
  if (Date.now() < cooldownUntil) return true;
  if (cooldownUntil && Date.now() >= cooldownUntil) {
    // Cooldown elapsed — allow exactly one probe rather than a fresh stampede.
    cooldownUntil = 0;
    consecutiveFailures = FAILURES_BEFORE_TRIP - 1;
  }
  return false;
}

function noteFailure(err) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURES_BEFORE_TRIP && !cooldownUntil) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    console.log(`[autoTranslate] ${consecutiveFailures} consecutive failures (${err}) — pausing translation for ${COOLDOWN_MS / 60000}min`);
  }
}

function noteSuccess() {
  consecutiveFailures = 0;
  cooldownUntil = 0;
}

/** Split text into <= MAX_CHUNK pieces, preferring sentence then word boundaries. */
function chunk(text) {
  const out = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf('. ', MAX_CHUNK);
    if (cut < MAX_CHUNK * 0.5) cut = rest.lastIndexOf(' ', MAX_CHUNK);
    if (cut <= 0) cut = MAX_CHUNK;
    else cut += 1; // keep the delimiter with the left-hand piece
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest);
  return out;
}

async function translateChunk(piece) {
  if (breakerOpen()) throw new Error('circuit breaker open (cooling off after repeated failures)');
  const params = { q: piece, langpair: 'en|hi' };
  // Supplying a contact address raises the daily allowance roughly 10x. It is
  // sent to a third party, so it is opt-in via env rather than hardcoded.
  if (process.env.MYMEMORY_EMAIL) params.de = process.env.MYMEMORY_EMAIL;

  const { data } = await axios.get(ENDPOINT, { params, timeout: REQUEST_TIMEOUT_MS });

  // MyMemory signals quota/errors in the BODY with HTTP 200, so status alone is
  // not a success check — the same trap EnableX's SMS API sets (see index.js).
  const status = data?.responseStatus;
  if (status !== 200 && status !== '200') {
    throw new Error(`MyMemory responseStatus=${status}: ${String(data?.responseDetails || '').slice(0, 120)}`);
  }
  const translated = data?.responseData?.translatedText;
  if (!translated || typeof translated !== 'string') throw new Error('no translatedText in response');
  // A quota-exhausted response can come back as the literal warning text.
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) {
    throw new Error(`quota/limit hit: ${translated.slice(0, 120)}`);
  }
  noteSuccess();
  return translated;
}

/**
 * Translate plain text. Returns null on any failure (caller falls back to English).
 */
async function translateText(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  try {
    const pieces = chunk(source);
    const out = [];
    for (let i = 0; i < pieces.length; i++) {
      if (i > 0) await sleep(INTER_REQUEST_DELAY_MS);
      out.push(await translateChunk(pieces[i]));
    }
    return out.join('');
  } catch (err) {
    noteFailure(err.message);
    console.log(`[autoTranslate] text failed: ${err.message}`);
    return null;
  }
}

/**
 * Translate HTML while preserving markup.
 *
 * Only the text BETWEEN tags is sent for translation; tags, attributes, URLs and
 * entities are passed through untouched. Handing raw HTML to a translator
 * reliably mangles it — attributes get "translated", tags get reordered — and a
 * broken article body is worse than an English one.
 */
async function translateHtml(html) {
  const source = String(html || '').trim();
  if (!source) return null;
  try {
    // Split into tags (kept verbatim) and the text between them.
    const parts = source.split(/(<[^>]+>)/g);
    const out = [];
    let calls = 0;
    for (const part of parts) {
      // A tag, or whitespace/punctuation-only text: nothing to translate.
      if (!part || part.startsWith('<') || !/[A-Za-z]{2}/.test(part)) {
        out.push(part);
        continue;
      }
      if (calls > 0) await sleep(INTER_REQUEST_DELAY_MS);
      calls += 1;
      const leading = part.match(/^\s*/)[0];
      const trailing = part.match(/\s*$/)[0];
      const pieces = chunk(part.trim());
      const done = [];
      for (let i = 0; i < pieces.length; i++) {
        if (i > 0) await sleep(INTER_REQUEST_DELAY_MS);
        done.push(await translateChunk(pieces[i]));
      }
      out.push(leading + done.join('') + trailing);
    }
    return out.join('');
  } catch (err) {
    // Partial HTML translation would be worse than none — abandon the whole body.
    noteFailure(err.message);
    console.log(`[autoTranslate] html failed: ${err.message}`);
    return null;
  }
}

/**
 * Fill in whichever Hindi fields a blog row is missing, and persist them.
 *
 * Only ever WRITES columns that are currently empty, so an admin who hand-writes
 * or corrects a Hindi field will never have it overwritten by the machine.
 * Returns true if anything was written.
 */
async function backfillBlogHindi(supabase, blog) {
  // Only target columns this table actually HAS. `blog` is a `select('*')` row,
  // so its own keys are the schema.
  //
  // This guard is not theoretical (2026-08-19): the first version wrote
  // excerpt_hi and meta_description_hi because /api/blogs *reads* them — but
  // only title_hi and content_hi exist on the table. PostgREST rejects the
  // WHOLE update on one unknown column ("Could not find the 'excerpt_hi'
  // column"), so every translation was computed, paid for against the free
  // daily allowance, and then thrown away at the write. Silently: the queue
  // logged a persist failure nobody was reading, and blogs simply stayed
  // English. Skipping absent columns means the fields that DO exist still get
  // filled, and if excerpt_hi/meta_description_hi are added later this starts
  // populating them with no code change.
  const exists = (column) => Object.prototype.hasOwnProperty.call(blog, column);
  const jobs = [];
  const want = (column, current, source, translate) => {
    if (!exists(column) || current || !source) return;
    jobs.push([column, translate(source)]);
  };

  want('title_hi', blog.title_hi, blog.title, translateText);
  want('excerpt_hi', blog.excerpt_hi, blog.excerpt, translateText);
  want('meta_description_hi', blog.meta_description_hi, blog.meta_description, translateText);
  want('content_hi', blog.content_hi, blog.content_en, translateHtml);
  if (!jobs.length) return false;

  const update = {};
  for (const [column, promise] of jobs) {
    const value = await promise;
    if (value) update[column] = value;
  }
  if (!Object.keys(update).length) return false;

  const { error } = await supabase.from('blogs').update(update).eq('id', blog.id);
  if (error) {
    console.log(`[autoTranslate] persist failed for blog ${blog.id}: ${error.message}`);
    return false;
  }
  console.log(`[autoTranslate] filled ${Object.keys(update).join(', ')} for blog ${blog.id}`);
  return true;
}

// ── Write-path queue ─────────────────────────────────────────────────────────
//
// Translation is triggered when an admin SAVES a blog, not when a reader loads
// the list. The first design hung it off GET /api/blogs, which was wrong twice
// over: a read path should not be making third-party calls and writing rows at
// all, and it scaled with traffic rather than with content — every app launch
// that showed blogs was another opportunity to hammer the provider. Volume now
// scales with how often you publish, which is a handful of calls per post and
// sits comfortably inside any free tier.
//
// Still serialised through one worker: an admin editing several posts quickly
// should not fire overlapping translation runs at a rate-limited API.
const pending = [];
const queued = new Set();
let working = false;

async function drain(supabase) {
  if (working) return;
  working = true;
  try {
    while (pending.length) {
      const blog = pending.shift();
      try {
        await backfillBlogHindi(supabase, blog);
      } catch (err) {
        console.log(`[autoTranslate] blog ${blog.id} skipped: ${err.message}`);
      } finally {
        queued.delete(blog.id);
      }
    }
  } finally {
    working = false;
  }
}

/**
 * Queue a just-saved blog for Hindi backfill. Fire-and-forget: the admin's save
 * response must not wait on a slow third-party call, and a translation failure
 * must never make a save look like it failed.
 */
function queueBlogTranslation(supabase, blog) {
  if (!blog || !blog.id || queued.has(blog.id)) return;
  queued.add(blog.id);
  pending.push(blog);
  drain(supabase).catch((err) => console.log(`[autoTranslate] queue error: ${err.message}`));
}

module.exports = { translateText, translateHtml, backfillBlogHindi, queueBlogTranslation };
