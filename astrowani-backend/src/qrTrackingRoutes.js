// astrowani-backend/src/qrTrackingRoutes.js
//
// The two PUBLIC halves of the QR poster funnel (the admin reads live in qrRoutes.js):
//
//   GET  /q/:source                    what a poster's QR now encodes. Logs the scan, then
//                                      redirects to the Play Store with the referrer.
//   POST /api/acquisition/first-open   the app reporting "an install from poster X just
//                                      opened", before any login.
//
// See sql/qr_funnel_events.sql for the tables and why both are service-role only.
//
// THE RULE FOR BOTH: nothing here may ever get in the way of the person. The redirect
// happens no matter what — a logging failure, a missing table, a malformed source all
// still send the phone to the Play Store — and first-open always answers 200. A funnel
// number is worth having; a poster that stops installing the app is not a trade anyone
// would make.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { QR_PREFIX, MAX_SOURCE_LEN, normalizeSource, isQrSource, resolveFromRequest } = require('./acquisition');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Must match applicationId in astrowani_customer-main/android/app/build.gradle.
const PLAY_PACKAGE = 'com.astrowanicustomer';
const PLAY_BASE = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

/**
 * The Play Store URL for a poster.
 *
 * utm_source ONLY — the backend reads nothing else. The whole referrer is encoded as a
 * single parameter value: leaving the inner `&` unescaped would make Play treat later
 * pieces as separate top-level parameters and drop them from the referrer.
 */
function playUrl(source) {
  if (!source) return PLAY_BASE;
  return `${PLAY_BASE}&referrer=${encodeURIComponent(`utm_source=${source}`)}`;
}

// Link-preview fetchers and search bots also request URLs that are pasted into chats.
// They are not people scanning a poster, and counting them would inflate every number.
const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|slurp|whatsapp|telegram|skype|curl|wget|python-requests|headless/i;

// A hash so "unique scanners" can be counted without storing an address. Keyed by a
// server secret, so it cannot be recomputed from a guessed IP by anyone without it.
function visitorHash(req) {
  const secret = process.env.JWT_SECRET || 'qr';
  const ua = String(req.headers['user-agent'] || '');
  return crypto.createHash('sha256').update(`${req.ip || ''}|${ua}|${secret}`).digest('hex').slice(0, 32);
}

// Small per-IP ceiling. Only the LOGGING is limited — the redirect never is.
const WINDOW_MS = 60 * 1000;
const hits = new Map();
function allowLog(key, max) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.start > WINDOW_MS) { hits.set(key, { start: now, n: 1 }); return true; }
  rec.n += 1;
  return rec.n <= max;
}
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
}, WINDOW_MS).unref();

let warnedMissing = false;
function isMissingTable(error) {
  return !!error && (error.code === 'PGRST205' || error.code === '42P01'
    || /could not find the table|does not exist/i.test(error.message || ''));
}
function warnOnce(where, error) {
  if (isMissingTable(error)) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`[qr-track] ${where}: run sql/qr_funnel_events.sql — funnel events are not being recorded.`);
    }
    return;
  }
  console.warn(`[qr-track] ${where} failed:`, error && error.message);
}

module.exports = function registerQrTrackingRoutes(app) {
  // ── A scan ─────────────────────────────────────────────────────────────────
  app.get('/q/:source', (req, res) => {
    // Length is checked on the RAW parameter: normalizeSource() truncates to the limit, so
    // testing its output would wave an absurdly long name through as a bogus 80-char poster.
    const tooLong = String(req.params.source || '').length > MAX_SOURCE_LEN;
    const source = tooLong ? null : normalizeSource(req.params.source);
    // Not one of ours (wrong prefix, empty, absurd length): still send them to the app,
    // just without a referrer, and log nothing.
    const valid = !!source && isQrSource(source);
    const target = playUrl(valid ? source : null);

    // Redirect FIRST and unconditionally; the log is best-effort afterwards.
    res.set('Cache-Control', 'no-store');
    res.redirect(302, target);

    if (!valid) return;
    const ua = String(req.headers['user-agent'] || '');
    if (BOT_UA.test(ua)) return;
    if (!allowLog(`scan:${req.ip}`, 30)) return;

    db.from('qr_scan_events')
      .insert({ source, visitor_hash: visitorHash(req), is_android: /android/i.test(ua) })
      .then(({ error }) => { if (error) warnOnce('scan insert', error); })
      .catch((e) => warnOnce('scan insert', e));
  });

  // ── An install that opened the app ─────────────────────────────────────────
  app.post('/api/acquisition/first-open', async (req, res) => {
    // Always 200: the app fires this in the background and has nothing useful to do with
    // an error, and a failure here must never look like a problem to the person.
    try {
      const body = req.body || {};
      const installId = String(body.installId || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(installId)) return res.json({ success: true, recorded: false });
      if (!allowLog(`open:${req.ip}`, 20)) return res.json({ success: true, recorded: false });

      // Same rule as at signup: the source is re-derived from the raw referrer here, not
      // taken from the client, and only our own QR posters are recorded. Organic and Ads
      // installs have their own reporting and would only add noise to this table.
      const { source, raw } = resolveFromRequest({
        acquisitionSource: body.acquisitionSource,
        acquisitionRaw: body.acquisitionRaw,
      });
      if (!source || !isQrSource(source)) return res.json({ success: true, recorded: false });

      // ignoreDuplicates: a retry of the same install (same installId) is a no-op, so the
      // count is installs, not launches.
      // The id the app sends is derived from a device identifier, so it is hashed with a
      // server secret before storage — good enough to dedupe a retry, useless as an ID.
      const stored = crypto.createHash('sha256').update(`${installId}|${process.env.JWT_SECRET || 'qr'}`).digest('hex').slice(0, 40);
      const { error } = await db.from('qr_install_events')
        .upsert({ install_id: stored, source, raw }, { onConflict: 'install_id', ignoreDuplicates: true });
      if (error) { warnOnce('first-open upsert', error); return res.json({ success: true, recorded: false }); }
      return res.json({ success: true, recorded: true });
    } catch (e) {
      warnOnce('first-open', e);
      return res.json({ success: true, recorded: false });
    }
  });
};

module.exports.playUrl = playUrl;
module.exports.QR_PREFIX = QR_PREFIX;
