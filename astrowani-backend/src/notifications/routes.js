// astrowani-backend/src/notifications/routes.js
//
// Admin endpoints under /api/admin/notifications/*, app endpoints under
// /api/notifications/*.
//
// The pre-existing /api/admin/notifications/{preview,send,history} in
// src/notificationRoutes.js are LEFT IN PLACE and still work. They are the only
// thing the live admin page calls, and taking them away would break the one
// notification path the business currently uses while this one is being adopted.
// This file adds; it does not replace.

const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { requireAdmin } = require('../adminRoutes');
const { findCustomerByPhone } = require('../customerLookup');
const devices = require('./devices');
const targeting = require('./targeting');
const sender = require('./sender');
const automations = require('./automations');
const vendorDevices = require('../vendorDevices');

const JWT_SECRET = process.env.JWT_SECRET;

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[notifications] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

/**
 * The customer behind a request, or null. REFUSES AN ASTROLOGER TOKEN before any
 * lookup: one phone number can be both (9999999999 is), the lookup works by phone,
 * and an astrologer's token would otherwise let them change that customer's
 * notification preferences or claim their opens. Same trap and same fix as
 * /api/notifications/read and /api/requests/:kind/:id/status.
 */
async function customerFromReq(req) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return null;
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
  if (!decoded) return null;
  if (decoded.role === 'astrologer' || decoded.astroId || decoded.vendorId) return null;
  if (decoded.phone) {
    try {
      const row = await findCustomerByPhone(db(), decoded.phone, 'id');
      if (row?.id) return String(row.id);
    } catch (_) { /* fall through */ }
  }
  const id = decoded.userId || decoded.id;
  return id && String(id).includes('-') ? String(id) : null;
}

/**
 * The astrologer behind a request, or null.
 *
 * Requires the astrologer-shaped claim rather than accepting any id: a CUSTOMER
 * token carries an id too, and treating one as an astrologer would let a customer
 * register a device against — or claim an open belonging to — whichever astrologer
 * shares their uuid-shaped claim. Mirrors moderationRoutes.vendorFromReq.
 */
function vendorFromReq(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const id = decoded.astroId || decoded.vendorId || (decoded.role === 'astrologer' ? decoded.id : null);
    if (!id || !String(id).includes('-')) return null;
    return String(id);
  } catch (_) {
    return null;
  }
}

/** Only the fields a client may set on a campaign, so a stray key cannot reach the
 *  table and a status cannot be forced by hand. */
const CAMPAIGN_FIELDS = [
  'name', 'category', 'audience', 'target_ids', 'filters', 'segments',
  'title', 'body', 'title_hi', 'body_hi', 'image_url', 'deep_link', 'data',
  'variants', 'scheduled_at', 'timezone', 'respect_quiet_hours',
  'respect_frequency_cap', 'expires_at', 'template_id',
];
const AUTOMATION_FIELDS = [
  'name', 'description', 'enabled', 'schedule_time', 'schedule_days', 'delay_minutes',
  'filters', 'category', 'title', 'body', 'title_hi', 'body_hi', 'image_url',
  'deep_link', 'data', 'cooldown_days', 'max_per_run', 'respect_quiet_hours',
];
const TEMPLATE_FIELDS = ['name', 'category', 'title', 'body', 'title_hi', 'body_hi', 'image_url', 'deep_link', 'data'];

function pick(body, allowed) {
  const out = {};
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

module.exports = function registerNotificationPlatformRoutes(app) {
  const client = () => db();

  // ══════════════════════════════════════════════════════════════════ ADMIN ══

  // ── Reachability: the question nobody could answer ────────────────────────
  app.get('/api/admin/notifications/reach', requireAdmin, h(async (req, res) => {
    const summary = await devices.reachSummary();
    return res.json({ success: true, reach: summary });
  }));

  // ── Astrologer reachability ───────────────────────────────────────────────
  // A separate endpoint from the customer one because the question is different.
  // For customers, reach is a marketing ceiling. For astrologers it is an EARNINGS
  // problem: somebody with chat and call switched on whose app cannot receive a
  // push misses every request that arrives while they are backgrounded, and until
  // now neither they nor anybody here could see it.
  app.get('/api/admin/notifications/astrologer-reach', requireAdmin, h(async (req, res) => {
    const [reach, unreachable] = await Promise.all([
      devices.astrologerReachSummary(),
      devices.unreachableAstrologers(Math.min(200, Number(req.query.limit) || 50)),
    ]);
    return res.json({ success: true, reach, unreachable });
  }));

  // ── Preview ───────────────────────────────────────────────────────────────
  // `audience-preview`, NOT `preview`: src/notificationRoutes.js already owns
  // POST /api/admin/notifications/preview and is registered first, so Express
  // would hand every request to the old handler — which answers with
  // `recipientCount` / `withPushToken` and no suppression breakdown. The new page
  // would then have read `wouldReach` as undefined and displayed a reach of zero
  // for every audience, with nothing erroring anywhere.
  // A DRY RUN OF THE REAL GOVERNOR, not a count. It resolves the audience, looks
  // up live devices and runs the same govern() the send uses, so the admin sees
  // both who would be reached and — itemised — who would be held back and why.
  // A preview computed differently from the send is worse than none; that is why
  // recipients.js exists at all.
  app.post('/api/admin/notifications/audience-preview', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    const resolved = await targeting.resolveAudience({
      audience: b.audience || 'all_customers',
      targetIds: b.targetIds,
      filters: b.filters || {},
      segments: b.segments,
    });
    const ids = resolved.recipients.map((r) => r.id);
    const deviceMap = resolved.recipientType === 'customer'
      ? await devices.liveDevicesFor(ids)
      : await devices.liveAstrologerDevicesFor(ids);
    const { send, suppressed } = await targeting.govern({
      recipients: resolved.recipients,
      recipientType: resolved.recipientType,
      category: b.category || 'promotional',
      respectQuietHours: b.respectQuietHours !== false,
      respectFrequencyCap: b.respectFrequencyCap !== false,
      timezone: b.timezone || 'Asia/Kolkata',
      devices: deviceMap,
    });
    const breakdown = suppressed.reduce((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {});
    return res.json({
      success: true,
      recipientType: resolved.recipientType,
      matched: resolved.recipients.length,
      wouldReach: send.length,
      suppressed: suppressed.length,
      breakdown,
      skippedSegment: resolved.skippedSegment,
      byLocale: send.reduce((acc, r) => { const k = r.locale || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
      byPlatform: send.reduce((acc, r) => { const k = r.platform || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
      sample: send.slice(0, 5).map((r) => ({ name: r.name, locale: r.locale, platform: r.platform })),
    });
  }));

  // ── Campaigns ─────────────────────────────────────────────────────────────
  app.get('/api/admin/notifications/campaigns', requireAdmin, h(async (req, res) => {
    let q = client().from('notification_campaigns')
      .select('id, name, status, category, audience, title, body, image_url, deep_link, scheduled_at, automation_id, created_by, recipient_count, sent_count, failed_count, suppressed_count, delivered_count, opened_count, clicked_count, created_at, started_at, finished_at, error')
      .order('created_at', { ascending: false })
      .limit(Math.min(200, Number(req.query.limit) || 50));
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const { data, error } = await q;
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.get('/api/admin/notifications/campaigns/:id', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_campaigns').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Campaign not found' });

    // Suppression reasons and per-variant results, counted from the send log —
    // which is the only place that has ever known.
    const { data: sends, error: sErr } = await client()
      .from('notification_sends')
      .select('status, suppress_reason, variant, opened_at, clicked_at, delivered_at')
      .eq('campaign_id', req.params.id)
      .limit(20000);
    if (sErr) throw sErr;

    const breakdown = {};
    const byVariant = {};
    let delivered = 0; let opened = 0; let clicked = 0;
    for (const s of sends || []) {
      if (s.status === 'suppressed') breakdown[s.suppress_reason || 'unknown'] = (breakdown[s.suppress_reason || 'unknown'] || 0) + 1;
      if (s.delivered_at) delivered += 1;
      if (s.opened_at) opened += 1;
      if (s.clicked_at) clicked += 1;
      const k = s.variant || 'default';
      byVariant[k] = byVariant[k] || { sent: 0, opened: 0, clicked: 0 };
      if (s.status === 'sent') byVariant[k].sent += 1;
      if (s.opened_at) byVariant[k].opened += 1;
      if (s.clicked_at) byVariant[k].clicked += 1;
    }
    return res.json({ success: true, campaign: data, breakdown, byVariant, measured: { delivered, opened, clicked }, sendRows: (sends || []).length });
  }));

  // Create. `mode` decides what happens next, and the default is the safe one.
  //   'draft'    saved, nothing sent (the default — a missing mode must never send)
  //   'schedule' needs scheduled_at; the worker picks it up
  //   'now'      delivered in this request
  app.post('/api/admin/notifications/campaigns', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    if (!b.title || !b.body) return res.status(400).json({ success: false, message: 'title and body are required' });
    const mode = ['draft', 'schedule', 'now'].includes(b.mode) ? b.mode : 'draft';
    if (mode === 'schedule' && !b.scheduled_at) {
      return res.status(400).json({ success: false, message: 'scheduled_at is required to schedule a campaign' });
    }
    if (mode === 'schedule' && new Date(b.scheduled_at) <= new Date()) {
      return res.status(400).json({ success: false, message: 'scheduled_at is in the past' });
    }

    const row = {
      ...pick(b, CAMPAIGN_FIELDS),
      audience: b.audience || 'all_customers',
      status: mode === 'schedule' ? 'scheduled' : 'draft',
      created_by: req.admin?.email || req.admin?.username || 'admin',
    };
    const { data, error } = await client().from('notification_campaigns').insert([row]).select('*');
    if (error) throw error;
    const campaign = data[0];

    if (mode === 'now') {
      const result = await sender.deliverCampaign(campaign.id, app.locals.io);
      return res.json({ success: true, campaign, sent: true, ...result });
    }
    return res.json({ success: true, campaign, sent: false });
  }));

  app.patch('/api/admin/notifications/campaigns/:id', requireAdmin, h(async (req, res) => {
    // Only a campaign that has not gone out may be edited. Editing a sent one
    // would rewrite the copy under numbers that were measured against the old
    // words, which makes every report about it a lie.
    const { data, error } = await client().from('notification_campaigns')
      .update({ ...pick(req.body || {}, CAMPAIGN_FIELDS), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .in('status', ['draft', 'scheduled', 'paused'])
      .select('*');
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ success: false, message: 'Only a draft, scheduled or paused campaign can be edited' });
    return res.json({ success: true, campaign: data[0] });
  }));

  app.post('/api/admin/notifications/campaigns/:id/send', requireAdmin, h(async (req, res) => {
    const result = await sender.deliverCampaign(req.params.id, app.locals.io);
    if (!result.ok && result.skipped) return res.status(409).json({ success: false, message: result.skipped });
    if (!result.ok) return res.status(500).json({ success: false, message: result.error || 'Send failed' });
    return res.json({ success: true, ...result });
  }));

  app.post('/api/admin/notifications/campaigns/:id/cancel', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_campaigns')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .in('status', ['draft', 'scheduled', 'paused'])
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ success: false, message: 'Nothing to cancel — it has already been sent' });
    return res.json({ success: true });
  }));

  app.delete('/api/admin/notifications/campaigns/:id', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_campaigns')
      .delete().eq('id', req.params.id).eq('status', 'draft').select('id');
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ success: false, message: 'Only a draft can be deleted — cancel it instead' });
    return res.json({ success: true });
  }));

  // ── Templates ─────────────────────────────────────────────────────────────
  app.get('/api/admin/notifications/templates', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_templates').select('*').order('name');
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.post('/api/admin/notifications/templates', requireAdmin, h(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.title || !b.body) return res.status(400).json({ success: false, message: 'name, title and body are required' });
    const { data, error } = await client().from('notification_templates')
      .insert([{ ...pick(b, TEMPLATE_FIELDS), created_by: req.admin?.email || 'admin' }]).select('*');
    if (error) {
      if (error.code === '23505' || /duplicate/i.test(error.message)) {
        return res.status(409).json({ success: false, message: 'A template with that name already exists' });
      }
      throw error;
    }
    return res.json({ success: true, template: data[0] });
  }));

  app.patch('/api/admin/notifications/templates/:id', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_templates')
      .update({ ...pick(req.body || {}, TEMPLATE_FIELDS), updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.json({ success: true, template: data[0] });
  }));

  app.delete('/api/admin/notifications/templates/:id', requireAdmin, h(async (req, res) => {
    const { error } = await client().from('notification_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  }));

  // ── Automations ───────────────────────────────────────────────────────────
  app.get('/api/admin/notifications/automations', requireAdmin, h(async (req, res) => {
    const { data, error } = await client().from('notification_automations').select('*').order('key');
    if (error) throw error;

    // How many people each one WOULD reach right now, so the admin is not asked to
    // switch on a blast whose size nobody has stated. Computed per automation, and
    // tolerant: one bad filter must not blank the page.
    const withCounts = await Promise.all((data || []).map(async (a) => {
      try {
        if (a.trigger_type === 'event') return { ...a, audienceNow: null };
        const resolved = await targeting.resolveAudience({ audience: a.audience, filters: a.filters || {} });
        return { ...a, audienceNow: resolved.recipients.length };
      } catch (err) {
        return { ...a, audienceNow: null, audienceError: err.message };
      }
    }));
    return res.json({ success: true, data: withCounts });
  }));

  app.patch('/api/admin/notifications/automations/:id', requireAdmin, h(async (req, res) => {
    const patch = pick(req.body || {}, AUTOMATION_FIELDS);
    // Re-arm the schedule whenever the clock changes, or an edit made at 3pm would
    // keep the next_run_at computed from the old time.
    if (patch.schedule_time !== undefined || patch.schedule_days !== undefined || patch.enabled === false) {
      patch.next_run_at = null;
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await client().from('notification_automations')
      .update(patch).eq('id', req.params.id).select('*');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ success: false, message: 'Automation not found' });
    return res.json({ success: true, automation: data[0] });
  }));

  // Manual run. REQUIRES `confirm: true` in the body: this sends to real people
  // immediately, and a GET-shaped mistake or a double-clicked button must not.
  app.post('/api/admin/notifications/automations/:id/run', requireAdmin, h(async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, message: 'Pass confirm: true — this sends to real customers now' });
    }
    const { data, error } = await client().from('notification_automations').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Automation not found' });
    const result = await automations.runAutomation(data, app.locals.io);
    return res.json({ success: true, ...result });
  }));

  // ── Global limits ─────────────────────────────────────────────────────────
  app.get('/api/admin/notifications/limits', requireAdmin, h(async (req, res) => {
    return res.json({ success: true, limits: await targeting.loadLimits(), defaults: targeting.DEFAULTS });
  }));

  app.patch('/api/admin/notifications/limits', requireAdmin, h(async (req, res) => {
    const next = {};
    for (const k of Object.keys(targeting.DEFAULTS)) {
      const v = Number(req.body?.[k]);
      if (Number.isFinite(v) && v >= 0) next[k] = Math.round(v);
    }
    if (!Object.keys(next).length) return res.status(400).json({ success: false, message: 'Nothing valid to set' });
    const merged = { ...(await targeting.loadLimits()), ...next };
    // Written as a JSON STRING, matching how every other app_settings row in this
    // database is stored — the generic settings PATCH does String(value), and a row
    // written as a bare object here would read back as "[object Object]" there.
    const { error } = await client().from('app_settings')
      .upsert([{ key: 'notification_limits', value: JSON.stringify(merged) }], { onConflict: 'key' });
    if (error) throw error;
    targeting.invalidateLimitsCache();
    return res.json({ success: true, limits: merged });
  }));

  // ── Analytics ─────────────────────────────────────────────────────────────
  app.get('/api/admin/notifications/analytics', requireAdmin, h(async (req, res) => {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await client().from('notification_campaigns')
      .select('id, name, title, category, status, automation_id, recipient_count, sent_count, failed_count, suppressed_count, delivered_count, opened_count, clicked_count, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows = data || [];
    const totals = rows.reduce((acc, c) => {
      acc.campaigns += 1;
      acc.sent += c.sent_count || 0;
      acc.failed += c.failed_count || 0;
      acc.suppressed += c.suppressed_count || 0;
      acc.delivered += c.delivered_count || 0;
      acc.opened += c.opened_count || 0;
      acc.clicked += c.clicked_count || 0;
      return acc;
    }, { campaigns: 0, sent: 0, failed: 0, suppressed: 0, delivered: 0, opened: 0, clicked: 0 });

    // Rates against SENT, not against recipient_count. "Sent" is what left the
    // building; dividing by the matched audience would mix a reachability problem
    // into a copy problem and make both unreadable.
    totals.openRate = totals.sent ? +(100 * totals.opened / totals.sent).toFixed(2) : null;
    totals.clickRate = totals.sent ? +(100 * totals.clicked / totals.sent).toFixed(2) : null;
    totals.deliveryRate = totals.sent ? +(100 * totals.delivered / totals.sent).toFixed(2) : null;

    return res.json({ success: true, days, totals, campaigns: rows, reach: await devices.reachSummary() });
  }));

  app.get('/api/admin/customers/:id/devices', requireAdmin, h(async (req, res) => {
    return res.json({ success: true, data: await devices.devicesFor(req.params.id) });
  }));

  // ════════════════════════════════════════════════════════════════════ APP ══

  // ── Device + permission registration ──────────────────────────────────────
  // The app posts here on login, on token refresh and on every foreground. It is
  // the ONLY way the three states in `permission_status` ever get recorded, which
  // is why the apps must adopt it before the reachability numbers mean anything.
  app.post('/api/notifications/device', h(async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const b = req.body || {};
    if (!b.deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });
    const result = await devices.registerDevice({
      customerId,
      deviceId: b.deviceId,
      fcmToken: b.fcmToken,
      platform: b.platform,
      appVersion: b.appVersion,
      locale: b.locale,
      permissionStatus: b.permissionStatus,
      permissionAsked: b.permissionAsked === true,
    });
    return res.json({ success: true, ...result });
  }));

  // ── Astrologer device + permission registration ───────────────────────────
  // A SEPARATE endpoint from /api/vendor/fcm-token, which the app already calls on
  // login, on token refresh and on every foreground — and which REQUIRES a token.
  // That is the whole problem: when the permission is denied there IS no token, so
  // `getFCMToken` fails, the existing sync never runs, and the refusal goes
  // unrecorded. Exactly the hole the customer side had.
  app.post('/api/vendor/notification-device', h(async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const b = req.body || {};
    if (!b.deviceId) return res.status(400).json({ success: false, message: 'deviceId is required' });

    const wrote = await vendorDevices.registerDevice(astrologerId, {
      deviceId: b.deviceId,
      fcmToken: b.fcmToken || null,
      platform: b.platform,
      appVersion: b.appVersion,
      locale: b.locale,
      permissionStatus: b.permissionStatus,
      permissionAsked: b.permissionAsked === true,
    });

    // Whether a push could actually arrive right now, answered from the device rows
    // rather than from what was just posted — so the app is told the truth about
    // ALL of its devices and can warn the astrologer that they will miss requests.
    let reachable = false;
    try {
      const live = await devices.liveAstrologerDevicesFor([astrologerId]);
      reachable = (live.get(astrologerId)?.tokens?.length || 0) > 0;
    } catch (_) { /* the write is what matters */ }

    return res.json({ success: true, recorded: wrote, reachable });
  }));

  // ── Tracking ──────────────────────────────────────────────────────────────
  // 'delivered' | 'opened' | 'clicked'.
  //
  // THERE IS NO SEND ID IN THE PUSH PAYLOAD, deliberately. The send row is found
  // by (campaign_id, customer_id) from the authenticated caller, which means a
  // campaign's push payload is identical for everyone in the same language — and
  // that is what lets sender.js batch into multicasts of 500 instead of sending
  // one message per person. It also means a client cannot claim somebody else's
  // open, because the customer comes from the JWT and never from the body.
  app.post('/api/notifications/track', h(async (req, res) => {
    // Either side may report. The astrologer check comes FIRST because
    // customerFromReq refuses an astrologer token outright, and one phone number
    // can be both — the store-reviewer account is.
    const astrologerId = vendorFromReq(req);
    const customerId = astrologerId ? null : await customerFromReq(req);
    if (!astrologerId && !customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const ownerColumn = astrologerId ? 'astrologer_id' : 'customer_id';
    const ownerId = astrologerId || customerId;
    const { campaignId, event } = req.body || {};
    if (!campaignId || !['delivered', 'opened', 'clicked'].includes(event)) {
      return res.status(400).json({ success: false, message: 'campaignId and a valid event are required' });
    }

    const now = new Date().toISOString();
    const { data: rows, error } = await client().from('notification_sends')
      .select('id, delivered_at, opened_at, clicked_at, open_count')
      .eq('campaign_id', campaignId)
      .eq(ownerColumn, ownerId)
      .limit(1);
    if (error) {
      if (error.code === '22P02') return res.status(400).json({ success: false, message: 'Invalid campaign id' });
      throw error;
    }
    // Not an error: a notification sent before this table existed, or one an
    // older build is reporting. Answering 200 stops the app retrying forever.
    if (!rows?.length) return res.json({ success: true, matched: false });

    const row = rows[0];
    const patch = {};
    // FIRST timestamp wins for each stage — "when did they see it" is the useful
    // question; a refreshed timestamp would answer "when did they last look".
    // `open_count` carries the repeats.
    if (event === 'delivered' && !row.delivered_at) patch.delivered_at = now;
    if (event === 'opened') {
      if (!row.opened_at) patch.opened_at = now;
      patch.open_count = (row.open_count || 0) + 1;
      // An open implies delivery. Without this an app that only ever reports the
      // tap would show a 0% delivery rate against a real open rate.
      if (!row.delivered_at) patch.delivered_at = now;
    }
    if (event === 'clicked') {
      if (!row.clicked_at) patch.clicked_at = now;
      if (!row.opened_at) patch.opened_at = now;
      if (!row.delivered_at) patch.delivered_at = now;
    }
    if (Object.keys(patch).length) {
      await client().from('notification_sends').update(patch).eq('id', row.id);
      // Roll up onto the campaign only on the FIRST occurrence of each stage, so a
      // customer opening something twice cannot push the open rate over 100%.
      const bump = {};
      if (patch.delivered_at && !row.delivered_at) bump.delivered_count = 1;
      if (patch.opened_at && !row.opened_at) bump.opened_count = 1;
      if (patch.clicked_at && !row.clicked_at) bump.clicked_count = 1;
      if (Object.keys(bump).length) {
        const { data: camp } = await client().from('notification_campaigns')
          .select('delivered_count, opened_count, clicked_count').eq('id', campaignId).maybeSingle();
        if (camp) {
          await client().from('notification_campaigns').update({
            delivered_count: (camp.delivered_count || 0) + (bump.delivered_count || 0),
            opened_count: (camp.opened_count || 0) + (bump.opened_count || 0),
            clicked_count: (camp.clicked_count || 0) + (bump.clicked_count || 0),
          }).eq('id', campaignId);
        }
      }
    }
    return res.json({ success: true, matched: true });
  }));

  // ── Preference centre ─────────────────────────────────────────────────────
  app.get('/api/notifications/preferences', h(async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { data } = await client().from('notification_preferences').select('*').eq('customer_id', customerId).maybeSingle();
    const limits = await targeting.loadLimits();
    return res.json({
      success: true,
      preferences: data || {
        customer_id: customerId, promotional: true, engagement: true, horoscope: true,
        quiet_start: null, quiet_end: null, timezone: 'Asia/Kolkata',
      },
      // So the app can say "quiet 10pm–8am by default" instead of showing an empty
      // field that looks broken.
      defaults: { quiet_start: limits.quietStart, quiet_end: limits.quietEnd },
    });
  }));

  app.patch('/api/notifications/preferences', h(async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const b = req.body || {};
    const row = { customer_id: customerId, updated_at: new Date().toISOString() };
    for (const k of ['promotional', 'engagement', 'horoscope']) {
      if (typeof b[k] === 'boolean') row[k] = b[k];
    }
    for (const k of ['quiet_start', 'quiet_end']) {
      if (b[k] === null) row[k] = null;
      else if (Number.isInteger(b[k]) && b[k] >= 0 && b[k] <= 23) row[k] = b[k];
    }
    const { data, error } = await client().from('notification_preferences')
      .upsert([row], { onConflict: 'customer_id' }).select('*');
    if (error) throw error;
    return res.json({ success: true, preferences: data[0] });
  }));

  // ── The in-app notification list ──────────────────────────────────────────
  // The app reads `notifications` straight from Supabase on the anon key today,
  // which cannot return the deep link or the image for a row it does not know
  // about, and cannot hide an expired offer. This serves the same list properly.
  // Both paths coexist: the direct read keeps working for every build already in
  // the field.
  app.get('/api/notifications/list', h(async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const { data, error } = await client().from('notifications')
      .select('id, title, body, type, category, is_read, read_at, image_url, deep_link, data, campaign_id, created_at, expires_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const now = Date.now();
    const rows = (data || []).filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now);
    return res.json({
      success: true,
      data: rows,
      unread: rows.filter((n) => !n.is_read).length,
    });
  }));

  // ── Unread badge counts + the astrologer's list (2026-11-13) ───────────────
  // The last reads of `notifications` the apps did straight from Supabase on the
  // publishable key: the header badge (both apps) and the astrologer's list. While
  // they existed, anon needed SELECT on the WHOLE table — 25,503 rows of other
  // people's support replies and order updates, readable by anyone holding the key
  // that ships inside both APKs. These routes let hardening_25 take that grant away.
  //
  // Expired rows are excluded from the count exactly as the list excludes them, so
  // the badge can never promise something the list then hides.
  async function unreadCount(column, ownerId) {
    const { data, error } = await client().from('notifications')
      .select('expires_at')
      .eq(column, ownerId)
      .eq('is_read', false)
      .limit(1000);
    if (error) throw error;
    const now = Date.now();
    return (data || []).filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now).length;
  }

  app.get('/api/notifications/unread-count', h(async (req, res) => {
    const customerId = await customerFromReq(req);
    if (!customerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    return res.json({ success: true, unread: await unreadCount('customer_id', customerId) });
  }));

  app.get('/api/vendor/notifications/unread-count', h(async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    return res.json({ success: true, unread: await unreadCount('astrologer_id', astrologerId) });
  }));

  app.get('/api/vendor/notifications/list', h(async (req, res) => {
    const astrologerId = vendorFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const { data, error } = await client().from('notifications')
      .select('id, title, body, type, category, is_read, read_at, image_url, deep_link, data, campaign_id, created_at, expires_at')
      .eq('astrologer_id', astrologerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const now = Date.now();
    const rows = (data || []).filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now);
    return res.json({ success: true, data: rows, unread: rows.filter((n) => !n.is_read).length });
  }));

  console.log('[notifications] platform routes registered (/api/admin/notifications/*, /api/notifications/*)');
};

module.exports.customerFromReq = customerFromReq;
