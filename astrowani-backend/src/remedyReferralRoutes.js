// astrowani-backend/src/remedyReferralRoutes.js
//
// Astrologer → customer remedy recommendations, and the commission they earn.
// The money logic lives in remedyCommission.js; this file is only the API surface.
//
// TWO WAYS A REFERRAL IS CREATED, both supported deliberately:
//   * the astrologer recommends an item from the vendor app  (source 'vendor')
//   * an admin attributes one by hand                        (source 'admin')
// The second exists because plenty of real recommendations happen outside the app
// flow — a phone consult, a dispute, a correction — and without it those would be
// unpayable.
//
// WHY THE VENDOR WRITE GOES THROUGH HERE and not straight to Supabase from the app:
// remedy_referrals has RLS on with no anon policy. A referral is a claim on money, so
// the astrologer_id must come from a verified JWT, never from a request body — otherwise
// any astrologer holding the publishable key could write themselves a commission on
// somebody else's customer.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const { loadCommissionConfig } = require('./remedyCommission');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[remedyReferralRoutes] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

/** Astrologer id from the vendor JWT. Never trusted from the body — see header note. */
function resolveAstrologerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

const COMMISSIONABLE_TYPES = ['gemstone', 'puja', 'specific_puja'];

module.exports = function registerRemedyReferralRoutes(app) {
  // ── Vendor: recommend a remedy item to a customer ──────────────────────────
  app.post('/api/vendor/remedy-referrals', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { customerId, remedyItemId, note } = req.body || {};
    if (!customerId || !remedyItemId) {
      return res.status(400).json({ success: false, message: 'customerId and remedyItemId are required' });
    }

    // Validate both ends exist, and that the item is one commission applies to.
    // life_report is excluded: it is a digital good with no referral rate configured.
    const [{ data: item }, { data: customer }] = await Promise.all([
      db.from('remedy_items').select('id, type, title, is_active').eq('id', remedyItemId).maybeSingle(),
      db.from('customers').select('id').eq('id', customerId).maybeSingle(),
    ]);
    if (!item) return res.status(404).json({ success: false, message: 'Remedy item not found' });
    if (!item.is_active) return res.status(400).json({ success: false, message: 'That item is not currently available' });
    if (!COMMISSIONABLE_TYPES.includes(item.type)) {
      return res.status(400).json({ success: false, code: 'NOT_COMMISSIONABLE', message: 'Referrals do not apply to this item type' });
    }
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const { data, error } = await db.from('remedy_referrals').insert([{
      astrologer_id: astrologerId,
      customer_id: customerId,
      remedy_item_id: remedyItemId,
      source: 'vendor',
      note: note || null,
    }]).select().single();
    if (error) throw error;

    const { rates, windowDays } = await loadCommissionConfig(db);
    return res.status(201).json({
      success: true,
      referral: data,
      // So the vendor app can show "you'll earn about ₹X if they buy it" honestly —
      // the real figure is snapshotted at checkout from the rate live at that moment.
      commissionPercent: rates[item.type] ?? 0,
      windowDays,
    });
  }));

  // ── Vendor: my referrals + what they earned ────────────────────────────────
  app.get('/api/vendor/remedy-referrals', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const [{ data: referrals }, { data: lines }] = await Promise.all([
      db.from('remedy_referrals')
        .select('id, customer_id, remedy_item_id, source, note, created_at, remedy_items(title, type, price)')
        .eq('astrologer_id', astrologerId)
        .order('created_at', { ascending: false })
        .limit(100),
      db.from('order_items')
        .select('commission_amount, commission_paid_at, item_title, order_id')
        .eq('referred_by_astrologer_id', astrologerId),
    ]);

    let earned = 0;
    let pending = 0;
    for (const l of lines || []) {
      const amt = Number(l.commission_amount) || 0;
      if (l.commission_paid_at) earned += amt;
      else pending += amt;
    }

    return res.json({
      success: true,
      referrals: referrals || [],
      // `pending` is money on orders that exist but have not been delivered yet.
      // Shown separately so an astrologer is never told they have earned something
      // that a cancellation could still take away.
      earnings: {
        paid: Math.round(earned * 100) / 100,
        pending: Math.round(pending * 100) / 100,
      },
    });
  }));

  // ── Customer: which of these items were recommended to ME, and by whom ────
  //
  // Drives the "Recommended by <astrologer>" line on a product card. Deliberately a
  // separate endpoint rather than a field on GET /api/remedies, because that route is
  // unauthenticated and heavily contentCache'd — a per-customer field there would
  // either leak one customer's recommendations to everyone via the cache, or force the
  // cache off for everybody.
  //
  // Returns only what the badge needs (item id → astrologer name). No commission
  // figures: what an astrologer earns is none of the customer's business, and showing
  // it would make a recommendation look like a sales incentive rather than advice.
  app.get('/api/remedies/recommended', h(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.json({ success: true, recommendations: {} });

    let decoded;
    try {
      decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    } catch (_) {
      // A logged-out or stale-token customer just sees no badges.
      return res.json({ success: true, recommendations: {} });
    }

    // Same phone-first resolution as orderRoutes.js — the id inside an older token may
    // be a legacy `user_<timestamp>` string rather than a uuid.
    let customerId = null;
    if (decoded.phone) {
      const { data } = await db.from('customers').select('id').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) customerId = data[0].id;
    }
    const rawId = decoded.userId || decoded._id || decoded.id;
    if (!customerId && rawId && String(rawId).includes('-')) customerId = rawId;
    if (!customerId) return res.json({ success: true, recommendations: {} });

    const { windowDays } = await loadCommissionConfig(db);
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();

    // Newest first so the first row seen per item wins — the same
    // "last recommendation wins" rule checkout uses, so the badge can never name a
    // different astrologer than the one who would actually be credited.
    const { data: rows, error } = await db
      .from('remedy_referrals')
      .select('remedy_item_id, created_at, astrologers(first_name, last_name)')
      .eq('customer_id', customerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const recommendations = {};
    for (const r of rows || []) {
      if (recommendations[r.remedy_item_id]) continue;
      const a = r.astrologers || {};
      const name = `${a.first_name || ''} ${a.last_name || ''}`.trim();
      if (name) recommendations[r.remedy_item_id] = name;
    }
    return res.json({ success: true, recommendations });
  }));

  // ── Admin: list every referral ─────────────────────────────────────────────
  app.get('/api/admin/remedy-referrals', requireAdmin, h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { data, error } = await db.from('remedy_referrals')
      .select('id, astrologer_id, customer_id, remedy_item_id, source, created_by, note, created_at, '
        + 'astrologers(first_name, last_name), customers(name, mobile), remedy_items(title, type, price)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const { rates, windowDays } = await loadCommissionConfig(db);
    return res.json({ success: true, referrals: data || [], rates, windowDays });
  }));

  // ── Admin: attribute a referral by hand ───────────────────────────────────
  app.post('/api/admin/remedy-referrals', requireAdmin, h(async (req, res) => {
    const { astrologerId, customerId, remedyItemId, note } = req.body || {};
    if (!astrologerId || !customerId || !remedyItemId) {
      return res.status(400).json({ success: false, message: 'astrologerId, customerId and remedyItemId are required' });
    }
    const { data: item } = await db.from('remedy_items').select('id, type').eq('id', remedyItemId).maybeSingle();
    if (!item) return res.status(404).json({ success: false, message: 'Remedy item not found' });
    if (!COMMISSIONABLE_TYPES.includes(item.type)) {
      return res.status(400).json({ success: false, code: 'NOT_COMMISSIONABLE', message: 'Referrals do not apply to this item type' });
    }

    const { data, error } = await db.from('remedy_referrals').insert([{
      astrologer_id: astrologerId,
      customer_id: customerId,
      remedy_item_id: remedyItemId,
      source: 'admin',
      created_by: req.admin?.email || 'admin',
      note: note || null,
    }]).select().single();
    if (error) throw error;
    return res.status(201).json({ success: true, referral: data });
  }));

  // ── Admin: remove a referral ───────────────────────────────────────────────
  // Only affects FUTURE orders. Commission already snapshotted onto an order line
  // stays there, because that order was priced against this referral — deleting the
  // referral must not silently rewrite what an astrologer is owed.
  app.delete('/api/admin/remedy-referrals/:id', requireAdmin, h(async (req, res) => {
    const { error } = await db.from('remedy_referrals').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({
      success: true,
      note: 'Future orders only — commission already recorded on placed orders is unchanged.',
    });
  }));

  // ── Admin: commission earned per astrologer ───────────────────────────────
  app.get('/api/admin/remedy-commissions', requireAdmin, h(async (req, res) => {
    const { data: lines, error } = await db.from('order_items')
      .select('referred_by_astrologer_id, commission_amount, commission_percent, commission_paid_at, item_title, item_type, order_id')
      .not('referred_by_astrologer_id', 'is', null)
      .order('commission_paid_at', { ascending: false, nullsFirst: true })
      .limit(1000);
    if (error) throw error;

    const byAstrologer = new Map();
    for (const l of lines || []) {
      const id = l.referred_by_astrologer_id;
      if (!byAstrologer.has(id)) {
        byAstrologer.set(id, { astrologerId: id, name: '', paid: 0, pending: 0, orders: new Set() });
      }
      const e = byAstrologer.get(id);
      const amt = Number(l.commission_amount) || 0;
      if (l.commission_paid_at) e.paid += amt; else e.pending += amt;
      e.orders.add(l.order_id);
    }

    const ids = [...byAstrologer.keys()];
    if (ids.length) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', ids);
      for (const a of astros || []) {
        const e = byAstrologer.get(a.id);
        if (e) e.name = `${a.first_name || ''} ${a.last_name || ''}`.trim() || '(unnamed)';
      }
    }

    const rows = [...byAstrologer.values()].map((e) => ({
      astrologerId: e.astrologerId,
      name: e.name,
      paid: Math.round(e.paid * 100) / 100,
      pending: Math.round(e.pending * 100) / 100,
      orders: e.orders.size,
    })).sort((a, b) => (b.paid + b.pending) - (a.paid + a.pending));

    return res.json({
      success: true,
      astrologers: rows,
      totalPaid: Math.round(rows.reduce((s, r) => s + r.paid, 0) * 100) / 100,
      totalPending: Math.round(rows.reduce((s, r) => s + r.pending, 0) * 100) / 100,
    });
  }));

  console.log('[remedyReferralRoutes] registered /api/vendor/remedy-referrals + /api/admin/remedy-referrals');
};
