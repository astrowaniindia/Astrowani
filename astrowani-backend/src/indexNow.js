/**
 * IndexNow: tell Bing (and through it Copilot), Yandex, Seznam and Naver the
 * moment a page is published or changed, instead of waiting to be crawled.
 * Google does not take part; it reads the sitemap.
 *
 * THE KEY IS NOT A SECRET. IndexNow proves ownership with a key file the site
 * itself serves: astrowani-website/<KEY>.txt, whose content is the key. Anyone
 * can read it; that is the design. scripts/testIndexNow.js checks the file
 * exists and matches.
 *
 * keyLocation sits under SITE_BASE, so while the site lives at
 * shop.astrowani.com/test-site/ only URLs under that path can be submitted —
 * IndexNow scopes a key to the folder its file is in. Moving the site moves the
 * key file with it; nothing here changes except SITE_BASE.
 *
 * NEVER THROWS, NEVER AWAITED ON A USER PATH. A failed ping costs nothing but a
 * slower crawl; it must not fail a publish or a save. It also skips itself
 * outside production so tests and local runs never announce anything:
 * "production" is ENABLE_SESSION_MANAGER=true, the flag this codebase already
 * uses to mean "this is the real production process" (CLAUDE.md ER) — the VPS
 * .env sets it, and the blog agent reads the same .env. NODE_ENV is NOT set in
 * production, so it cannot be the test. INDEXNOW_DISABLED=1 turns it off;
 * INDEXNOW_FORCE=1 turns it on (the deploy workflow's runner uses this).
 */
const { SITE_BASE } = require('./blogAgent/seo');

const KEY = '53203360707eac73a6d4bf8d93e7db94';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000; // the protocol's per-request cap

function enabled() {
  if (process.env.INDEXNOW_DISABLED === '1') return false;
  return process.env.ENABLE_SESSION_MANAGER === 'true' || process.env.INDEXNOW_FORCE === '1';
}

/** The request body for a set of URLs, or null if none belong to this site. */
function payload(urls, base = SITE_BASE) {
  const host = new URL(base).host;
  const list = [...new Set((urls || []).filter((u) => {
    try { return new URL(u).host === host && u.startsWith(`${base}/`); } catch (_) { return false; }
  }))].slice(0, MAX_URLS);
  if (!list.length) return null;
  return { host, key: KEY, keyLocation: `${base}/${KEY}.txt`, urlList: list };
}

/**
 * Submit URLs. Resolves to { ok, status, count } or { skipped }; never rejects.
 * 200 and 202 both mean accepted (202 = key not yet verified, which is normal on
 * the first submission).
 */
async function submit(urls, { base = SITE_BASE, fetchImpl = globalThis.fetch } = {}) {
  try {
    if (!enabled()) return { skipped: 'not production' };
    const body = payload(urls, base);
    if (!body) return { skipped: 'no urls for this site' };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body), signal: ctl.signal,
    }).finally(() => clearTimeout(t));
    const ok = res.status === 200 || res.status === 202;
    if (!ok) console.warn(`[indexnow] ${res.status} for ${body.urlList.length} url(s)`);
    return { ok, status: res.status, count: body.urlList.length };
  } catch (err) {
    console.warn('[indexnow]', err.message);
    return { ok: false, error: err.message };
  }
}

/** Fire-and-forget form for publish paths. */
function notify(urls) {
  submit(urls).catch(() => {});
}

module.exports = { KEY, ENDPOINT, payload, submit, notify, enabled };
