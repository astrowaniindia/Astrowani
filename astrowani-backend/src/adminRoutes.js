// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard routes — auth + content/management CRUD.
//
// All routes are mounted under /api/admin. Everything except /login is guarded by
// `requireAdmin` (Bearer JWT with role === 'admin'). Writes use the Supabase
// service-role client (bypasses RLS), mirroring src/sessionManager.js.
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./push');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_astrowani_key_123';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client for admin writes (falls back to anon if service key missing,
// in which case writes depend on RLS being permissive on the new tables).
const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'
);

// ── Auth middleware ───────────────────────────────────────────────────────────
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

// Small async wrapper so each handler can throw and we return 500 once.
const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[admin] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

module.exports = function registerAdminRoutes(app) {
  // ── Login ────────────────────────────────────────────────────────────────
  app.post('/api/admin/login', h(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const { data: admins, error } = await db
      .from('admins')
      .select('id, email, name, password_hash')
      .eq('email', email.toLowerCase().trim())
      .limit(1);
    if (error) throw error;
    const admin = admins && admins[0];
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      success: true,
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });
  }));

  // ── Dashboard stats ─────────────────────────────────────────────────────--
  app.get('/api/admin/stats', requireAdmin, h(async (req, res) => {
    const [customers, astrologers, activeSessions, sessions, txns] = await Promise.all([
      db.from('customers').select('id', { count: 'exact', head: true }),
      db.from('astrologers').select('id', { count: 'exact', head: true }),
      db.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('chat_sessions').select('id', { count: 'exact', head: true }),
      db.from('wallet_transactions').select('amount, type').eq('type', 'debit'),
    ]);
    const revenue = (txns.data || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    // admin_wallet only exists once sql/astro_services_schema.sql has been run — degrade to 0
    // rather than 500ing the whole dashboard if it's missing.
    let adminWalletBalance = 0;
    try {
      const { data } = await db.from('admin_wallet').select('balance').limit(1).maybeSingle();
      adminWalletBalance = Number(data?.balance) || 0;
    } catch (_) { /* table not migrated yet */ }
    return res.json({
      success: true,
      stats: {
        customers: customers.count || 0,
        astrologers: astrologers.count || 0,
        activeSessions: activeSessions.count || 0,
        totalSessions: sessions.count || 0,
        revenue,
        adminWalletBalance,
      },
    });
  }));

  // ── Generic CRUD factory for simple content tables ────────────────────────
  // Registers GET (list), POST (create), PUT/:id (update), DELETE/:id for a table.
  function crud(resource, table, { orderBy = 'created_at', ascending = false, allowed } = {}) {
    const pick = (body) => {
      if (!allowed) return body;
      const out = {};
      for (const k of allowed) if (k in body) out[k] = body[k];
      return out;
    };

    app.get(`/api/admin/${resource}`, requireAdmin, h(async (req, res) => {
      const { data, error } = await db.from(table).select('*').order(orderBy, { ascending });
      if (error) throw error;
      return res.json({ success: true, data: data || [] });
    }));

    app.post(`/api/admin/${resource}`, requireAdmin, h(async (req, res) => {
      const { data, error } = await db.from(table).insert([pick(req.body || {})]).select().single();
      if (error) throw error;
      return res.json({ success: true, data });
    }));

    app.put(`/api/admin/${resource}/:id`, requireAdmin, h(async (req, res) => {
      const body = pick(req.body || {});
      if (table === 'blogs') body.updated_at = new Date().toISOString();
      const { data, error } = await db.from(table).update(body).eq('id', req.params.id).select().single();
      if (error) throw error;
      return res.json({ success: true, data });
    }));

    app.delete(`/api/admin/${resource}/:id`, requireAdmin, h(async (req, res) => {
      const { error } = await db.from(table).delete().eq('id', req.params.id);
      if (error) throw error;
      return res.json({ success: true });
    }));
  }

  crud('blogs', 'blogs', {
    allowed: ['title', 'excerpt', 'meta_description', 'thumbnail', 'category_id',
      'title_en', 'content_en', 'title_hi', 'content_hi', 'is_published'],
  });
  crud('banners', 'banners', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['title', 'title_hi', 'description', 'description_hi', 'image', 'link', 'sort_order', 'is_active', 'app'],
  });
  crud('thoughts', 'thoughts', {
    allowed: ['text', 'text_hi', 'author', 'author_hi', 'is_active'],
  });
  crud('categories', 'categories', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['name', 'name_hi', 'image', 'sort_order'],
  });
  // Remedy shop items (type = puja | gemstone | specific_puja). Admin UI filters by tab.
  crud('remedies', 'remedy_items', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['type', 'title', 'title_hi', 'description', 'description_hi', 'price', 'image', 'is_active', 'sort_order'],
  });
  // Live-stream gift catalog.
  crud('gifts', 'gifts', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['name', 'price', 'image', 'is_active', 'sort_order'],
  });
  // Paid astrology report catalog (JyotishamAstroAPI) — prices flow into admin_wallet on purchase.
  crud('astro-services', 'astro_services', {
    orderBy: 'sort_order', ascending: true,
    allowed: ['key', 'name', 'description', 'category', 'price', 'image', 'is_active', 'sort_order'],
  });

  // ── Live moderation ───────────────────────────────────────────────────────
  app.get('/api/admin/live', requireAdmin, h(async (req, res) => {
    const { data: sessions, error } = await db
      .from('live_sessions').select('*').eq('is_active', true).order('started_at', { ascending: false });
    if (error) throw error;
    const ids = (sessions || []).map((s) => s.astrologer_id);
    let names = {};
    if (ids.length) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', ids);
      (astros || []).forEach((a) => { names[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer'; });
    }
    return res.json({
      success: true,
      data: (sessions || []).map((s) => ({
        id: s.id,
        astrologerId: s.astrologer_id,
        astrologerName: names[s.astrologer_id] || '—',
        title: s.title,
        viewerCount: s.viewer_count || 0,
        totalGiftAmount: s.total_gift_amount || 0,
        startedAt: s.started_at,
      })),
    });
  }));

  // Force-stop a live stream (reuses backend endLiveSession → emits live_ended + flips flags).
  app.post('/api/admin/live/:id/stop', requireAdmin, h(async (req, res) => {
    const endLiveSession = app.locals.endLiveSession;
    if (endLiveSession) {
      await endLiveSession(req.params.id, 'admin_stopped');
    } else {
      await db.from('live_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', req.params.id);
    }
    return res.json({ success: true });
  }));

  // Missed sessions — unanswered call + chat requests across all astrologers.
  app.get('/api/admin/missed', requireAdmin, h(async (req, res) => {
    const [callsRes, chatsRes] = await Promise.all([
      db.from('call_requests')
        .select('id, astrologer_id, customer_id, customer_name, call_type, created_at')
        .eq('status', 'missed').order('created_at', { ascending: false }).limit(150),
      db.from('chat_requests')
        .select('id, receiver_id, caller_id, caller_name, created_at')
        .eq('status', 'missed').order('created_at', { ascending: false }).limit(150),
    ]);
    const calls = callsRes.data || [];
    const chats = chatsRes.data || [];

    // Resolve astrologer names
    const astroIds = [...new Set([
      ...calls.map(c => c.astrologer_id),
      ...chats.map(c => c.receiver_id),
    ].filter(Boolean))];
    let astroNames = {};
    if (astroIds.length) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (astros || []).forEach(a => { astroNames[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer'; });
    }

    const rows = [
      ...calls.map(c => ({
        id: c.id,
        type: c.call_type === 'video' ? 'Video Call' : 'Audio Call',
        astrologerName: astroNames[c.astrologer_id] || '—',
        customerName: c.customer_name || 'Customer',
        createdAt: c.created_at,
      })),
      ...chats.map(c => ({
        id: c.id,
        type: 'Chat',
        astrologerName: astroNames[c.receiver_id] || '—',
        customerName: c.caller_name || 'Customer',
        createdAt: c.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, data: rows });
  }));

  // Gift revenue (platform_cut = platform's share).
  app.get('/api/admin/gift-transactions', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('gift_transactions').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Astrologers (read + moderate) ─────────────────────────────────────────
  app.get('/api/admin/astrologers', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, email, phone_number, experience, specialties, ' +
        'languages, profile_pic_url, bio, ' +
        'approval_status, is_suspended, is_available, is_chat_enabled, is_call_enabled, ' +
        'is_video_call_enabled, chat_charge_per_minute, call_charge_per_minute, ' +
        'video_charge_per_minute, wallet_balance, today_earnings, total_earnings, admin_notes')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/astrologers/:id', requireAdmin, h(async (req, res) => {
    const allowed = ['approval_status', 'is_suspended', 'is_available', 'is_chat_enabled',
      'is_call_enabled', 'is_video_call_enabled', 'chat_charge_per_minute',
      'call_charge_per_minute', 'video_charge_per_minute', 'admin_notes',
      'first_name', 'last_name', 'profile_pic_url', 'bio', 'experience', 'languages',
      'wallet_balance'];
    const body = {};
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    const { data, error } = await db.from('astrologers').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  // ── New Entries (pending astrologer signups awaiting approval) ─────────────
  // Powers the admin "New Entries" screen. Returns pending applications with the
  // detail an admin needs to vet them. Approve/Reject reuse the PATCH above.
  app.get('/api/admin/new-entries', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, email, phone_number, gender, experience, ' +
        'languages, specialties, profile_image, approval_status, admin_notes, created_at')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Customers (read + wallet top-up) ──────────────────────────────────────
  app.get('/api/admin/customers', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('customers')
      .select('id, name, mobile, email, wallet_balance, created_at, fcm_token')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.post('/api/admin/customers/:id/wallet', requireAdmin, h(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!amount || amount === 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    const { data: cust, error: cErr } = await db
      .from('customers').select('wallet_balance').eq('id', req.params.id).single();
    if (cErr) throw cErr;
    const newBalance = (Number(cust.wallet_balance) || 0) + amount;
    const { error: uErr } = await db
      .from('customers').update({ wallet_balance: newBalance }).eq('id', req.params.id);
    if (uErr) throw uErr;
    await db.from('wallet_transactions').insert([{
      user_id: req.params.id,
      type: amount > 0 ? 'credit' : 'debit',
      amount: Math.abs(amount),
      description: req.body?.description || 'Admin wallet adjustment',
    }]);
    return res.json({ success: true, newBalance });
  }));

  // ── Sessions ──────────────────────────────────────────────────────────────
  app.get('/api/admin/sessions', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('chat_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Vendor withdrawal requests (view + approve/reject/mark paid) ──────────
  app.get('/api/admin/withdrawals', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('withdrawal_requests')
      .select('*, astrologers(first_name, last_name, phone_number)')
      .order('requested_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/withdrawals/:id', requireAdmin, h(async (req, res) => {
    const { status, admin_note } = req.body || {};
    if (!['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const { data: withdrawal, error: fetchErr } = await db
      .from('withdrawal_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) throw fetchErr;
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already processed' });
    }

    // Rejecting refunds the amount that was put on hold when the vendor requested it.
    if (status === 'rejected') {
      const { data: astroRow, error: astroErr } = await db
        .from('astrologers')
        .select('wallet_balance')
        .eq('id', withdrawal.astrologer_id)
        .single();
      if (astroErr) throw astroErr;
      await db
        .from('astrologers')
        .update({ wallet_balance: (astroRow?.wallet_balance ?? 0) + Number(withdrawal.amount) })
        .eq('id', withdrawal.astrologer_id);
      await db.from('vendor_wallet_transactions').insert([{
        vendor_id: withdrawal.astrologer_id,
        type: 'credit',
        amount: withdrawal.amount,
        description: 'Withdrawal request rejected — refunded',
        request_id: withdrawal.id,
      }]);
    }

    const { data, error } = await db
      .from('withdrawal_requests')
      .update({ status, admin_note: admin_note || null, processed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  // ── Astrologer reports (customer moderation flags) ────────────────────────
  app.get('/api/admin/reports', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('astrologer_reports')
      .select('*, customers(name, mobile), astrologers(first_name, last_name, phone_number)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/reports/:id', requireAdmin, h(async (req, res) => {
    const { status, admin_note } = req.body || {};
    if (!['reviewed', 'actioned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const { data, error } = await db
      .from('astrologer_reports')
      .update({ status, admin_note: admin_note || null, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  // ── Orders (view + update status) ─────────────────────────────────────────
  app.get('/api/admin/orders', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.patch('/api/admin/orders/:id', requireAdmin, h(async (req, res) => {
    const allowed = ['status', 'payment_status'];
    const body = {};
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    const { data, error } = await db.from('orders').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  // ── Reviews (moderate: list / edit / hide / delete) ───────────────────────
  // Recomputes an astrologer's cached average + count from non-hidden reviews.
  async function recompute(astrologerId) {
    if (!astrologerId) return;
    const { data: rows } = await db
      .from('reviews').select('rating').eq('astrologer_id', astrologerId).eq('is_hidden', false);
    const list = rows || [];
    const total = list.length;
    const avg = total
      ? Math.round((list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) * 10) / 10
      : 0;
    await db.from('astrologers').update({ average_rating: avg, total_reviews: total }).eq('id', astrologerId);
  }

  app.get('/api/admin/reviews', requireAdmin, h(async (req, res) => {
    const { data, error } = await db
      .from('reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const rows = data || [];
    const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    let astroNames = {}, custInfo = {};
    if (astroIds.length) {
      const { data: a } = await db.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (a || []).forEach((x) => { astroNames[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer'; });
    }
    if (custIds.length) {
      const { data: c } = await db.from('customers').select('id, name, mobile').in('id', custIds);
      (c || []).forEach((x) => { custInfo[x.id] = { name: x.name || 'Customer', mobile: x.mobile || '' }; });
    }
    return res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        astrologerName: astroNames[r.astrologer_id] || '—',
        customerName: custInfo[r.customer_id]?.name || 'Customer',
        customerMobile: custInfo[r.customer_id]?.mobile || '',
      })),
    });
  }));

  app.patch('/api/admin/reviews/:id', requireAdmin, h(async (req, res) => {
    const allowed = ['is_hidden', 'rating', 'comment', 'admin_note', 'admin_reply'];
    const body = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];
    const { data, error } = await db.from('reviews').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    await recompute(data.astrologer_id);
    return res.json({ success: true, data });
  }));

  app.delete('/api/admin/reviews/:id', requireAdmin, h(async (req, res) => {
    const { data: row } = await db.from('reviews').select('astrologer_id').eq('id', req.params.id).single();
    const { error } = await db.from('reviews').delete().eq('id', req.params.id);
    if (error) throw error;
    if (row) await recompute(row.astrologer_id);
    return res.json({ success: true });
  }));

  // ── App settings (key/value) ──────────────────────────────────────────────
  // Returns all settings as a flat { key: value } object.
  app.get('/api/admin/settings', requireAdmin, h(async (req, res) => {
    const { data, error } = await db.from('app_settings').select('key, value');
    if (error) throw error;
    const settings = {};
    (data || []).forEach((r) => { settings[r.key] = r.value; });
    return res.json({ success: true, settings });
  }));

  // Upsert a single setting: body { key, value }.
  app.patch('/api/admin/settings', requireAdmin, h(async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ success: false, message: 'key required' });
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return res.json({ success: true });
  }));

  // Audience segmentation by signup date — 'new' = joined within the last N days,
  // 'old' = joined before that, 'all' = no date filter.
  function applyAudienceFilter(query, audience, cutoffIso) {
    if (audience === 'new') return query.gte('created_at', cutoffIso);
    if (audience === 'old') return query.lt('created_at', cutoffIso);
    return query;
  }

  // ── Segment preview — lets the admin see audience size before sending ──
  app.get('/api/admin/customers/segment-count', requireAdmin, h(async (req, res) => {
    const audience = req.query.audience || 'all';
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: total }, { count: withToken }] = await Promise.all([
      applyAudienceFilter(db.from('customers').select('id', { count: 'exact', head: true }), audience, cutoff),
      applyAudienceFilter(db.from('customers').select('id', { count: 'exact', head: true }).not('fcm_token', 'is', null), audience, cutoff),
    ]);
    return res.json({ success: true, total: total || 0, withToken: withToken || 0 });
  }));

  // ── Push broadcast — send an announcement/offer to a customer segment ──
  app.post('/api/admin/push/broadcast', requireAdmin, h(async (req, res) => {
    const { title, body, audience = 'all', days } = req.body || {};
    if (!title || !body) return res.status(400).json({ success: false, message: 'title and body are required' });

    const thresholdDays = Number(days) > 0 ? Number(days) : 30;
    const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: customers, error } = await applyAudienceFilter(
      db.from('customers').select('fcm_token').not('fcm_token', 'is', null),
      audience,
      cutoff,
    );
    if (error) throw error;
    const tokens = (customers || []).map((c) => c.fcm_token).filter(Boolean);

    // FCM allows up to 500 tokens per multicast call — chunk accordingly.
    const CHUNK_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const result = await sendPush(chunk, { title, body, data: { type: 'admin_broadcast' } });
      successCount += result.successCount || 0;
      failureCount += result.failureCount || 0;
    }
    return res.json({ success: true, audience, days: thresholdDays, targeted: tokens.length, successCount, failureCount });
  }));

  console.log('[admin] routes registered under /api/admin');
};
