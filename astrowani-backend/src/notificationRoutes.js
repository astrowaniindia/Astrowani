// ─────────────────────────────────────────────────────────────────────────────
// Notification management — admin broadcast/personal send + history.
//
// Writes go through the service-role client (bypasses RLS), same as adminRoutes.js.
// A send does three things: (1) fans out one row per recipient into `notifications`
// (in-app source of truth), (2) emits a socket event to each recipient's personal
// room for instant in-app delivery while foregrounded (reuses the join_room(userId)
// pattern already used everywhere else in index.js), (3) fires a real FCM push via
// sendPush() so it also lands when the app is backgrounded/killed.
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_astrowani_key_123';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'
);

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
  console.error(`[notifications] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

const CHUNK_SIZE = 500; // FCM multicast limit per call

module.exports = function registerNotificationRoutes(app) {
  // ── Send — broadcast to all customers/astrologers, or a personal notification ──
  app.post('/api/admin/notifications/send', requireAdmin, h(async (req, res) => {
    const { audience, targetIds, title, body } = req.body || {};
    const validAudiences = ['all_customers', 'all_astrologers', 'customer', 'astrologer'];
    if (!validAudiences.includes(audience)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'title and body are required' });
    }
    const isPersonal = audience === 'customer' || audience === 'astrologer';
    if (isPersonal && (!Array.isArray(targetIds) || !targetIds.length)) {
      return res.status(400).json({ success: false, message: 'targetIds is required for a personal notification' });
    }

    const recipientType = audience === 'astrologer' || audience === 'all_astrologers' ? 'astrologer' : 'customer';
    const table = recipientType === 'astrologer' ? 'astrologers' : 'customers';
    const type = isPersonal ? 'admin_personal' : 'admin_broadcast';

    // Resolve recipients: [{ id, fcm_token }], and display names for the history log.
    let recipients = [];
    let targetNames = [];
    if (isPersonal) {
      const nameCols = recipientType === 'astrologer' ? 'id, fcm_token, first_name, last_name' : 'id, fcm_token, name';
      const { data, error } = await db.from(table).select(nameCols).in('id', targetIds);
      if (error) throw error;
      if (!data || !data.length) return res.status(404).json({ success: false, message: 'No matching recipients found' });
      recipients = data.map((d) => ({ id: d.id, fcm_token: d.fcm_token }));
      targetNames = data.map((d) => recipientType === 'astrologer'
        ? (`${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Astrologer')
        : (d.name || 'Customer'));
    } else {
      const { data, error } = await db.from(table).select('id, fcm_token');
      if (error) throw error;
      recipients = data || [];
    }

    if (!recipients.length) {
      return res.status(404).json({ success: false, message: 'No matching recipients found' });
    }

    // 1. Fan out one notifications row per recipient. The `notifications` table pre-dates
    // this feature — it identifies the recipient via astrologer_id OR customer_id (exactly
    // one set), not a recipient_type/recipient_id pair.
    const rows = recipients.map((r) => ({
      astrologer_id: recipientType === 'astrologer' ? r.id : null,
      customer_id: recipientType === 'customer' ? r.id : null,
      title,
      body,
      type,
    }));
    const { error: insertErr } = await db.from('notifications').insert(rows);
    if (insertErr) throw insertErr;

    // 2. Instant in-app push to anyone currently foregrounded (personal room per id).
    const io = app.locals.io;
    if (io) {
      recipients.forEach((r) => {
        io.to(r.id).emit('new_notification', { title, body, type, recipient_type: recipientType });
      });
    }

    // 3. Real FCM push (no-op until FIREBASE_SERVICE_ACCOUNT_JSON is configured).
    const tokens = recipients.map((r) => r.fcm_token).filter(Boolean);
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const result = await sendPush(chunk, { title, body, data: { type } });
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }

    // Compact admin history log. target_id only makes sense for a single-person send;
    // for a multi-person personal send, target_name lists everyone instead.
    await db.from('notification_broadcasts').insert([{
      audience,
      target_id: isPersonal && targetIds.length === 1 ? targetIds[0] : null,
      target_name: isPersonal ? targetNames.join(', ') : null,
      title,
      body,
      recipient_count: recipients.length,
      push_success: successCount,
      push_failure: failureCount,
    }]);

    return res.json({
      success: true,
      audience,
      targetNames,
      recipientCount: recipients.length,
      pushSuccess: successCount,
      pushFailure: failureCount,
    });
  }));

  // ── History — admin-facing log of past sends ────────────────────────────────
  app.get('/api/admin/notifications/history', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('notification_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  console.log('[notifications] routes registered under /api/admin/notifications');
};
