// ─────────────────────────────────────────────────────────────────────────────
// Admin-triggerable referral popup — same shape as notificationRoutes.js's admin
// send, but shows the actual in-app ReferralPromptHost (customer) / ReferralPopupHost
// (vendor) modal instead of a plain notification. Customers AND astrologers can be
// targeted (astrologers have no referral code — their popup is generic messaging).
//
// A send does two things: (1) emits a socket event to each recipient's personal room
// for instant popup display while foregrounded (reuses the join_room(userId) pattern
// already used everywhere else in index.js), (2) fires a real FCM push as a fallback
// so backgrounded/killed users still get a plain notification (tapping it just opens
// the app — the popup itself only makes sense for a foregrounded app, same as the
// existing after-session ReviewPrompt/ReferralPrompt pattern).
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { sendPush, isPushReady } = require('./push');

const JWT_SECRET = process.env.JWT_SECRET;
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
  console.error(`[referral-popup] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

const CHUNK_SIZE = 500; // FCM multicast limit per call

module.exports = function registerReferralPopupRoutes(app) {
  // ── Send — show the referral popup to all customers/astrologers, or specific people ──
  app.post('/api/admin/referral-popup/send', requireAdmin, h(async (req, res) => {
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
      return res.status(400).json({ success: false, message: 'targetIds is required to target specific people' });
    }

    const recipientType = audience === 'astrologer' || audience === 'all_astrologers' ? 'astrologer' : 'customer';
    const table = recipientType === 'astrologer' ? 'astrologers' : 'customers';

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

    // 1. Instant popup for anyone currently foregrounded (personal room per id) — customer
    // app shows ReferralPromptHost (with their real code/reward), vendor app shows the
    // generic ReferralPopupHost (astrologers have no referral code of their own).
    const io = app.locals.io;
    if (io) {
      recipients.forEach((r) => {
        io.to(r.id).emit('show_referral_popup', { title, body, recipient_type: recipientType });
      });
    }

    // 2. Fallback FCM push so a backgrounded/killed app isn't left with no signal at all.
    const tokens = recipients.map((r) => r.fcm_token).filter(Boolean);
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const result = await sendPush(chunk, { data: { type: 'referral_popup', title, body } });
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }

    await db.from('referral_popup_broadcasts').insert([{
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
      pushReady: isPushReady(),
    });
  }));

  // ── History — admin-facing log of past sends ────────────────────────────────
  app.get('/api/admin/referral-popup/history', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('referral_popup_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  console.log('[referral-popup] routes registered under /api/admin/referral-popup');
};
