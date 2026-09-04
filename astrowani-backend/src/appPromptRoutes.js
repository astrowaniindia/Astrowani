// ─────────────────────────────────────────────────────────────────────────────
// App-update prompt + Play Store review prompt.
//
// Two public, unauthenticated GETs the apps call at launch, and one admin POST
// that pushes either prompt out to everybody on demand.
//
// WHY THE APPS DO NOT READ app_settings DIRECTLY HERE
// Most config in this codebase is read straight from Supabase by the app
// (useRemedyOrderingGate, applySessionReplaySetting, useSessionIntroBanner). That
// works when the app only has to render what it finds. The update check is
// different: it is a COMPARISON between the installed build and the published one,
// and the comparison rules (build number beats version name, min-supported forces,
// an unparseable version never forces) belong in one place that can be corrected
// without shipping a new build — which is exactly the thing a broken update prompt
// would prevent. So the server answers "should this specific installed version see
// a prompt, and is it forced", and the app renders that answer.
//
// FAIL-CLOSED, ALWAYS. Every failure path here — config missing, unparseable,
// disabled, table not migrated — returns `updateAvailable: false` / `enabled:
// false` with HTTP 200, never an error. A false negative means a user misses an
// update nudge. A false positive means a non-dismissible "please update" wall in
// front of an app that is already current, which the user cannot get out of. The
// two are not equally bad.
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { sendPush, isPushReady } = require('./push');
const { TtlCache } = require('./ttlCache');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'
);

const UPDATE_KEY = 'app_update_config';
const REVIEW_KEY = 'app_review_prompt_config';

const PLAY_STORE_URLS = {
  customer: 'https://play.google.com/store/apps/details?id=com.astrowanicustomer',
  vendor: 'https://play.google.com/store/apps/details?id=com.astrowaniVendor',
};

// No iOS build exists in the field yet (neither app has a Podfile.lock), so these
// stay null rather than pointing at a listing that would 404. An iOS client with no
// store URL simply gets no prompt — see resolveStoreUrl().
const APP_STORE_URLS = {
  customer: null,
  vendor: null,
};

// 60s is short enough that an admin flipping "Enabled" is live almost immediately,
// long enough that a launch spike doesn't turn into one app_settings read per user.
const configCache = new TtlCache({ ttlMs: 60000, maxEntries: 8 });

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[app-prompts] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

// ── Version comparison ───────────────────────────────────────────────────────
// versionName in this repo is a plain dotted number ("24.1", "6.6"), not semver, so
// segments are compared numerically with missing segments treated as 0 ("24" equals
// "24.0"). Anything non-numeric makes the comparison unusable and returns null,
// which every caller treats as "cannot tell -> do not prompt".
function parseVersion(v) {
  if (v === null || v === undefined) return null;
  const parts = String(v).trim().split('.');
  if (!parts.length || parts.some((p) => p === '' || !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

/** -1 / 0 / 1, or null if either side is not a plain dotted number. */
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const left = pa[i] || 0;
    const right = pb[i] || 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function toPositiveInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampNumber(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ── Config loading ───────────────────────────────────────────────────────────
// app_settings values are TEXT (the generic admin PATCH String()s everything), so
// the blob arrives as a JSON string. A blob an admin has hand-edited into invalid
// JSON must not take the feature down — it degrades to "off".
async function readJsonSetting(key) {
  return configCache.get(key, async () => {
    try {
      const { data, error } = await db
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error || !data || !data.value) return null;
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      console.error(`[app-prompts] could not read ${key}:`, err.message);
      return null;
    }
  });
}

function invalidateAppPromptCache(key) {
  if (key) configCache.store.delete(key);
  else configCache.store.clear();
}

function normalizeApp(which) {
  return which === 'vendor' || which === 'astrologer' ? 'vendor' : 'customer';
}

function resolveStoreUrl(configured, which, platform) {
  if (configured && /^https?:\/\//i.test(String(configured))) return String(configured);
  if (platform === 'ios') return APP_STORE_URLS[which] || null;
  return PLAY_STORE_URLS[which];
}

module.exports = function registerAppPromptRoutes(app) {
  // ── Update check (public) ──────────────────────────────────────────────────
  // GET /api/app/update-check?app=customer&platform=android&version=24.1&build=33
  app.get('/api/app/update-check', h(async (req, res) => {
    const which = normalizeApp(String(req.query.app || '').toLowerCase());
    const platform = String(req.query.platform || 'android').toLowerCase();
    const installedVersion = req.query.version ? String(req.query.version) : null;
    const installedBuild = toPositiveInt(req.query.build);

    const off = { success: true, updateAvailable: false, force: false };

    const cfg = await readJsonSetting(UPDATE_KEY);
    if (!cfg || cfg.enabled !== true) return res.json(off);

    const appCfg = (cfg.apps && cfg.apps[which]) || null;
    if (!appCfg) return res.json(off);

    const storeUrl = resolveStoreUrl(appCfg.storeUrl, which, platform);
    // No listing to send them to means nothing actionable to show. This is what
    // keeps an iOS build (no App Store listing yet) off a dead-end prompt.
    if (!storeUrl) return res.json(off);

    // Build number first when BOTH sides have one: versionCode is monotonic and
    // unambiguous, while a version NAME can legitimately be re-used or restyled.
    // Version name is the fallback for a client that did not send a build.
    const latestBuild = toPositiveInt(appCfg.latestBuild);
    const minBuild = toPositiveInt(appCfg.minSupportedBuild);

    let behindLatest;
    let belowMinimum;

    if (latestBuild && installedBuild) {
      behindLatest = installedBuild < latestBuild;
    } else {
      const cmp = compareVersions(installedVersion, appCfg.latestVersion);
      behindLatest = cmp === null ? null : cmp < 0;
    }

    if (minBuild && installedBuild) {
      belowMinimum = installedBuild < minBuild;
    } else {
      const cmp = compareVersions(installedVersion, appCfg.minSupportedVersion);
      belowMinimum = cmp === null ? null : cmp < 0;
    }

    // `null` means we could not compare (unparseable version, missing config) and is
    // treated as "not behind" — and, critically, never as "force".
    if (behindLatest !== true && belowMinimum !== true) return res.json(off);

    return res.json({
      success: true,
      updateAvailable: true,
      force: belowMinimum === true,
      latestVersion: appCfg.latestVersion || null,
      storeUrl,
      title: appCfg.title || 'A new version is available',
      message: appCfg.message || 'Update to get the latest features and fixes.',
      titleHi: appCfg.titleHi || null,
      messageHi: appCfg.messageHi || null,
      // Soft prompts snooze; a forced one must not, so the app is told the window
      // rather than choosing it.
      remindAfterHours: clampNumber(cfg.remindAfterHours, 1, 24 * 30, 24),
    });
  }));

  // ── Review prompt config (public) ─────────────────────────────────────────
  // GET /api/app/review-prompt?app=customer&platform=android
  app.get('/api/app/review-prompt', h(async (req, res) => {
    const which = normalizeApp(String(req.query.app || '').toLowerCase());
    const platform = String(req.query.platform || 'android').toLowerCase();

    const cfg = await readJsonSetting(REVIEW_KEY);
    if (!cfg || cfg.enabled === false) {
      return res.json({ success: true, enabled: false });
    }

    const storeUrl = resolveStoreUrl(cfg.storeUrls && cfg.storeUrls[which], which, platform);
    if (!storeUrl) return res.json({ success: true, enabled: false });

    return res.json({
      success: true,
      enabled: true,
      storeUrl,
      title: cfg.title || 'Enjoying Astrowani?',
      message: cfg.message || 'A quick rating on the Play Store helps other people find us.',
      titleHi: cfg.titleHi || null,
      messageHi: cfg.messageHi || null,
      // All three are admin free-text, so all three are clamped on read — an
      // accidental 0 would ask a brand-new install to review on its first launch.
      minAppOpens: clampNumber(cfg.minAppOpens, 1, 100, 4),
      minDaysSinceInstall: clampNumber(cfg.minDaysSinceInstall, 0, 365, 2),
      remindAfterDays: clampNumber(cfg.remindAfterDays, 1, 365, 30),
      askAfterGoodRating: cfg.askAfterGoodRating !== false,
    });
  }));

  // ── Admin: push either prompt to everyone ─────────────────────────────────
  // Same three-part delivery as notificationRoutes.js: an in-app `notifications`
  // row (so it stays in the bell list afterwards), a socket event for anyone
  // foregrounded right now, and an FCM push for everyone else.
  app.post('/api/admin/app-prompts/notify', requireAdmin, h(async (req, res) => {
    const { kind, audience, title, body } = req.body || {};
    if (kind !== 'app_update' && kind !== 'app_review') {
      return res.status(400).json({ success: false, message: "kind must be 'app_update' or 'app_review'" });
    }
    if (!['all_customers', 'all_astrologers'].includes(audience)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'title and body are required' });
    }

    const recipientType = audience === 'all_astrologers' ? 'astrologer' : 'customer';
    const table = recipientType === 'astrologer' ? 'astrologers' : 'customers';

    const { data, error } = await db.from(table).select('id, fcm_token');
    if (error) throw error;
    const recipients = data || [];
    if (!recipients.length) {
      return res.status(404).json({ success: false, message: 'No matching recipients found' });
    }

    // 1. In-app notification rows — the bell list is the durable record.
    const rows = recipients.map((r) => ({
      astrologer_id: recipientType === 'astrologer' ? r.id : null,
      customer_id: recipientType === 'customer' ? r.id : null,
      title,
      body,
      type: kind,
    }));
    const { error: insertErr } = await db.from('notifications').insert(rows);
    if (insertErr) throw insertErr;

    // 2. Instant popup for anyone foregrounded (personal room per id), plus the
    // bell-badge event the apps already listen for.
    const io = app.locals.io;
    const socketEvent = kind === 'app_update' ? 'show_update_popup' : 'show_review_popup';
    if (io) {
      recipients.forEach((r) => {
        io.to(r.id).emit(socketEvent, { title, body, recipient_type: recipientType });
        io.to(r.id).emit('new_notification', { title, body, type: kind, recipient_type: recipientType });
      });
    }

    // 3. FCM fallback. Data-only, for the reason spelled out in notificationRoutes.js:
    // a notification-block message is drawn by the OS and never reaches our handler,
    // so tapping it could not open the right prompt.
    const CHUNK = 500;
    const tokens = recipients.map((r) => r.fcm_token).filter(Boolean);
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const chunk = tokens.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      const result = await sendPush(chunk, { data: { type: kind, title, body } });
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }

    // Reuses the existing admin history log rather than adding a fourth broadcast
    // table — the audience/title/body/counts shape is identical.
    await db.from('notification_broadcasts').insert([{
      audience,
      target_id: null,
      target_name: kind === 'app_update' ? 'App update prompt' : 'Play Store review prompt',
      title,
      body,
      recipient_count: recipients.length,
      push_success: successCount,
      push_failure: failureCount,
    }]);

    return res.json({
      success: true,
      kind,
      audience,
      recipientCount: recipients.length,
      pushSuccess: successCount,
      pushFailure: failureCount,
      pushReady: isPushReady(),
    });
  }));
};

module.exports.invalidateAppPromptCache = invalidateAppPromptCache;
module.exports.compareVersions = compareVersions;
module.exports.UPDATE_KEY = UPDATE_KEY;
module.exports.REVIEW_KEY = REVIEW_KEY;
