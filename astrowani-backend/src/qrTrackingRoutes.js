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

/**
 * The Android "open in the Play Store APP" targets for a poster.
 *
 * WHY THE SHORT LINK CANNOT JUST 302 TO play.google.com: a QR that encodes a Play URL
 * directly is resolved by the camera/Lens, which opens the Play app. Ours opens in
 * Chrome first, and Chrome only hands a play.google.com URL to the app after a real tap
 * on a link — not when a redirect delivers it. The person landed on Google's WEB listing
 * in the browser (seen 2026-09-25 on a real phone), which is exactly the wrong place to
 * start an install. So on Android we serve a small page whose button is a genuine tap
 * that launches the Play app, with the referrer attached.
 *
 *   intent://  — opens the Play app; if it is missing, Chrome follows the https fallback.
 *   The referrer is a single-encoded value inside the intent data; Play decodes it.
 */
function playIntentUrl(source) {
  const referrer = encodeURIComponent(`utm_source=${source}`);
  const fallback = encodeURIComponent(playUrl(source));
  return `intent://details?id=${PLAY_PACKAGE}&referrer=${referrer}`
    + `#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${fallback};end`;
}

function androidLandingHtml(source) {
  const intent = playIntentUrl(source);
  const web = playUrl(source);
  // Values here are built only from a source already restricted to [a-z0-9_.-] and from
  // fixed strings, so nothing user-controlled reaches the markup unescaped.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Astrowani</title>
<style>
  html,body{margin:0;height:100%;background:#592a19;color:#fff;font-family:system-ui,-apple-system,Roboto,sans-serif}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;box-sizing:border-box}
  h1{font-size:26px;margin:0 0 6px;color:#ffd700}
  p{margin:0 0 26px;opacity:.9;font-size:15px}
  a.btn{display:block;width:100%;max-width:340px;background:#ffd700;color:#3d1c11;text-decoration:none;font-weight:700;font-size:18px;padding:16px 20px;border-radius:14px}
  a.alt{margin-top:22px;color:#f1d9c4;font-size:14px}
</style></head>
<body><div class="wrap">
  <h1>Astrowani</h1>
  <p>Opening Google Play&hellip;<br>Google Play खुल रहा है&hellip;</p>
  <a class="btn" id="go" href="${intent}">Open in Google Play<br><span style="font-weight:500;font-size:14px">Google Play में खोलें</span></a>
  <a class="alt" href="${web}">Open in browser instead</a>
</div>
<script>
  var go = document.getElementById('go').href;
  var web = ${JSON.stringify(web)};
  // Try once on load; some browsers block this without a tap, which is why the button exists.
  setTimeout(function () { window.location.href = go; }, 250);
  // A real computer has no Play app to open, so after a moment send it to the web listing.
  // Deliberately NOT done on a touch device: a phone whose browser blocked the auto-open
  // (or reports itself as a desktop, e.g. Chrome's "Desktop site" mode) must keep the
  // button in front of the person, or we are back to stranding them on the web page.
  setTimeout(function () {
    if (!document.hidden && !(navigator.maxTouchPoints > 0)) window.location.href = web;
  }, 2200);
</script>
</body></html>`;
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

    // Respond FIRST and unconditionally; the log is best-effort afterwards.
    res.set('Cache-Control', 'no-store');
    const uaHeader = String(req.headers['user-agent'] || '');
    // NOT gated on the user-agent saying "Android": a phone in Chrome's "Desktop site" mode
    // sends a desktop user-agent (seen 2026-09-25 — both real scans were logged as
    // non-Android), and gating on it sent that phone to the web listing again. Everyone
    // except iPhones (no Play Store) and link-preview robots gets the page; the page itself
    // decides what a non-touch computer should do.
    if (valid && !/iPhone|iPad|iPod/i.test(uaHeader) && !BOT_UA.test(uaHeader)) {
      res.status(200).type('html').send(androidLandingHtml(source));
    } else {
      // iPhones, link-preview robots, a bad source: the plain redirect to the Play listing.
      res.redirect(302, target);
    }

    if (!valid) return;
    const ua = String(req.headers['user-agent'] || '');
    if (BOT_UA.test(ua)) return;
    if (!allowLog(`scan:${req.ip}`, 30)) return;

    const row = {
      source,
      visitor_hash: visitorHash(req),
      is_android: /android/i.test(ua) || /android/i.test(String(req.headers['sec-ch-ua-platform'] || '')),
      // Kept so a scan that behaves oddly can be diagnosed from the row itself (2026-09-25:
      // a real phone's scans were logged as non-Android and nothing said why). A browser
      // signature is not personal data.
      user_agent: ua.slice(0, 200),
      platform_hint: String(req.headers['sec-ch-ua-platform'] || '').slice(0, 40),
    };
    db.from('qr_scan_events')
      .insert(row)
      .then(({ error }) => {
        if (!error) return;
        // The two diagnostic columns come from sql/qr_scan_events_user_agent.sql; if it has not
        // been applied yet, still count the scan rather than losing it.
        if (/user_agent|platform_hint/.test(error.message || '')) {
          const { user_agent, platform_hint, ...plain } = row;
          return db.from('qr_scan_events').insert(plain).then((r) => { if (r.error) warnOnce('scan insert', r.error); });
        }
        warnOnce('scan insert', error);
      })
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
module.exports.playIntentUrl = playIntentUrl;
module.exports.QR_PREFIX = QR_PREFIX;
