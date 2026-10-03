/**
 * Dakshina — a voluntary thank-you after a FREE introductory call.
 *
 * THE RULES, and why each one is the way it is:
 *
 * 1. THE SERVER DECIDES THE AMOUNT IS LEGAL, not the app. The app may only send an
 *    amount; this module checks it against the admin's configured list (or the custom
 *    range) and prices the Razorpay order itself. Same posture as the remedy cart.
 *
 * 2. 50/50 SPLIT, matching the gift system (index.js GIFT_VENDOR_SHARE). The astrologer
 *    is credited their half only AFTER Razorpay's signature verifies — never on the
 *    app's word that a payment succeeded.
 *
 * 3. REPLAY-SAFE. verify-payment claims the row atomically on
 *    (razorpay_order_id, customer_id, status='pending_payment'). Zero rows claimed means
 *    somebody already settled it, which returns 200 {alreadyProcessed:true}, NOT an
 *    error — an error would make the app retry forever. Identical to
 *    POST /api/orders/verify-payment.
 *
 * 4. THE MONEY NEVER ENTERS THE CUSTOMER'S WALLET. It is not a recharge; there is
 *    nothing to refund from a balance and nothing to spend. It goes gateway -> split.
 */
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const razorpay = require('./razorpay');
const wallet = require('./wallet');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const JWT_SECRET = process.env.JWT_SECRET;
const CUSTOMER_COLS = 'id, name, mobile';

/** JWT -> the real customers row. Same pattern as freeCallRoutes/orderRoutes. */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  let customer = null;
  if (decoded.phone) customer = await findCustomerByPhone(db, decoded.phone, CUSTOMER_COLS);
  const userId = decoded.userId || decoded._id || decoded.id;
  // Guarded: a soft-removed account must not resolve from a retained token.
  if (!customer && userId) customer = await findCustomerById(db, userId, CUSTOMER_COLS);
  return customer;
}

// Same share the gift system uses. Kept as its own constant rather than imported from
// index.js so this module has no dependency on the monolith, but the two must stay in
// step — if one changes, change both.
const DAKSHINA_VENDOR_SHARE = 0.5;

// Amount ladder redesigned 2026-10-03 (owner) as "Shagun Recharge" — a voluntary
// thank-you shown after the free 11-minute call, nine fixed buttons rather than three
// plus a custom field. allowCustom is kept OFF by default to match: a grid of nine
// already covers the range the owner wants offered, and a tenth free-text box would
// crowd the sheet. Admin can still flip allowCustom back on; nothing here forbids it.
const DEFAULTS = {
  enabled: true,
  amounts: [11, 21, 51, 101, 251, 501, 1100, 2100, 5100],
  allowCustom: false,
  minAmount: 11,
  maxAmount: 5100,
};

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt;
};

/** Admin config, clamped — every field is admin free-text and none of it is trusted. */
async function loadConfig() {
  let parsed = {};
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'dakshina_config').limit(1);
    if (data && data.length) parsed = JSON.parse(data[0].value) || {};
  } catch (_) { parsed = {}; }

  const merged = { ...DEFAULTS, ...parsed };
  merged.enabled = merged.enabled !== false;
  merged.allowCustom = merged.allowCustom !== false;
  merged.minAmount = clampInt(merged.minAmount, 1, 100000, DEFAULTS.minAmount);
  merged.maxAmount = clampInt(merged.maxAmount, merged.minAmount, 100000, DEFAULTS.maxAmount);
  merged.amounts = (Array.isArray(merged.amounts) ? merged.amounts : DEFAULTS.amounts)
    .map((a) => clampInt(a, merged.minAmount, merged.maxAmount, 0))
    .filter((a) => a > 0)
    .filter((a, i, arr) => arr.indexOf(a) === i)
    .sort((a, b) => a - b)
    // Was capped at 4 for the old three-row sheet. The Shagun grid shows up to 12 in a
    // 3-wide layout, i.e. four rows — comfortably more than the 9 buttons the owner
    // asked for, with headroom for admin to add a couple more later.
    .slice(0, 12);
  if (!merged.amounts.length) merged.amounts = DEFAULTS.amounts.slice();
  return merged;
}

module.exports = function registerDakshinaRoutes(app) {
  const h = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error('[dakshina]', e.message);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Something went wrong' });
  });

  const { requireAdmin } = require('./adminRoutes');

  /* ── What can I give? ─────────────────────────────────────────────────── */
  app.get('/api/dakshina/options', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });
    const cfg = await loadConfig();
    return res.status(200).json({
      success: true,
      enabled: cfg.enabled,
      amounts: cfg.amounts,
      allowCustom: cfg.allowCustom,
      minAmount: cfg.minAmount,
      maxAmount: cfg.maxAmount,
      // The app needs this to open Razorpay; it is the publishable key id, not a secret.
      keyId: razorpay.RAZORPAY_KEY_ID || null,
      paymentsAvailable: razorpay.isConfigured(),
    });
  }));

  /* ── Start a payment ──────────────────────────────────────────────────── */
  app.post('/api/dakshina/create-order', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const cfg = await loadConfig();
    if (!cfg.enabled) {
      return res.status(403).json({ success: false, code: 'DISABLED', message: 'Not available right now.' });
    }
    if (!razorpay.isConfigured()) {
      return res.status(503).json({
        success: false, code: 'PAYMENTS_UNAVAILABLE',
        message: 'Payments are temporarily unavailable. Nothing has been charged.',
      });
    }

    const astrologerId = String(req.body?.astrologerId || '').trim();
    if (!astrologerId) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'astrologerId is required' });
    }
    const amount = Math.round(Number(req.body?.amount));
    // A preset amount is always allowed; anything else only within the admin's range,
    // and only when custom amounts are switched on.
    const isPreset = cfg.amounts.includes(amount);
    const inCustomRange = cfg.allowCustom && amount >= cfg.minAmount && amount <= cfg.maxAmount;
    if (!Number.isFinite(amount) || amount <= 0 || (!isPreset && !inCustomRange)) {
      return res.status(400).json({
        success: false, code: 'BAD_AMOUNT',
        message: `Please choose an amount between ₹${cfg.minAmount} and ₹${cfg.maxAmount}.`,
      });
    }

    const { data: astro } = await db.from('astrologers')
      .select('id').eq('id', astrologerId).maybeSingle();
    if (!astro) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Astrologer not found' });
    }

    const order = await razorpay.createOrder(amount, `dk_${Date.now()}`);
    const vendorAmount = Math.round(amount * DAKSHINA_VENDOR_SHARE);

    const { data: row, error } = await db.from('dakshina_payments').insert([{
      customer_id: customer.id,
      astrologer_id: astrologerId,
      session_id: req.body?.sessionId || null,
      amount,
      vendor_amount: vendorAmount,
      platform_amount: amount - vendorAmount,
      status: 'pending_payment',
      razorpay_order_id: order.id,
    }]).select('id').single();
    if (error) {
      console.error('[dakshina] insert failed:', error.message);
      return res.status(503).json({
        success: false, code: 'NOT_CONFIGURED',
        message: 'Not available yet. Nothing has been charged.',
      });
    }

    return res.status(200).json({
      success: true,
      dakshinaId: row.id,
      orderId: order.id,
      amount,
      currency: 'INR',
      keyId: razorpay.RAZORPAY_KEY_ID,
    });
  }));

  /* ── Settle it ────────────────────────────────────────────────────────── */
  app.post('/api/dakshina/verify-payment', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const orderId = req.body?.razorpay_order_id;
    const paymentId = req.body?.razorpay_payment_id;
    const signature = req.body?.razorpay_signature;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Missing payment fields' });
    }
    if (!razorpay.verifySignature({ orderId, paymentId, signature })) {
      return res.status(400).json({ success: false, code: 'BAD_SIGNATURE', message: 'Payment could not be verified' });
    }

    // Atomic claim. Scoped to this customer AND to the pending state, so a replay (or a
    // webhook racing the app) claims zero rows and is reported as already handled.
    const { data: claimed, error: claimErr } = await db.from('dakshina_payments')
      .update({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
      .eq('razorpay_order_id', orderId)
      .eq('customer_id', customer.id)
      .eq('status', 'pending_payment')
      .select('id, astrologer_id, amount, vendor_amount, platform_amount, session_id');

    if (claimErr) {
      console.error('[dakshina] claim failed:', claimErr.message);
      return res.status(500).json({ success: false, message: 'Could not record the payment' });
    }
    if (!claimed || !claimed.length) {
      // Already settled by an earlier call. 200, deliberately — see rule 3.
      return res.status(200).json({ success: true, alreadyProcessed: true });
    }

    const row = claimed[0];

    // Credit the astrologer their half. Keyed on the dakshina row id, so even if this
    // endpoint were somehow reached twice for the same row the ledger cannot double.
    // Counted as earnings: it is money they earned by doing the call.
    try {
      await wallet.adjustVendorWallet(row.astrologer_id, Number(row.vendor_amount), {
        description: 'Dakshina from a free intro call',
        sessionId: row.session_id || null,
        idempotencyKey: `dakshina:${row.id}`,
        countEarnings: true,
      });
    } catch (e) {
      // The customer HAS paid by this point. Never fail their request over a ledger
      // problem — record loudly and let it be reconciled from dakshina_payments, which
      // already holds the authoritative row.
      console.error(`[dakshina] CREDIT FAILED for ${row.id} (astrologer ${row.astrologer_id}, `
        + `₹${row.vendor_amount}) — customer was charged. Needs manual credit:`, e.message);
    }

    // Platform's half. Non-blocking, same as the remedy checkout.
    wallet.adjustAdminWallet(Number(row.platform_amount), {
      description: 'Dakshina platform share',
      idempotencyKey: `dakshina-platform:${row.id}`,
    }).catch((e) => console.error('[dakshina] admin_wallet credit failed:', e.message));

    return res.status(200).json({ success: true, amount: Number(row.amount) });
  }));

  /* ── Admin ────────────────────────────────────────────────────────────── */
  app.get('/api/admin/dakshina/config', requireAdmin, h(async (req, res) => {
    return res.status(200).json({ success: true, config: await loadConfig() });
  }));

  app.get('/api/admin/dakshina/payments', requireAdmin, h(async (req, res) => {
    const { data, error } = await db.from('dakshina_payments')
      .select('id, amount, vendor_amount, platform_amount, status, paid_at, created_at, '
        + 'customers(name, mobile), astrologers(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(200).json({ success: true, payments: [], tableMissing: true });
    const paid = (data || []).filter((r) => r.status === 'paid');
    return res.status(200).json({
      success: true,
      payments: data || [],
      totals: {
        count: paid.length,
        gross: paid.reduce((s, r) => s + Number(r.amount || 0), 0),
        toAstrologers: paid.reduce((s, r) => s + Number(r.vendor_amount || 0), 0),
        toPlatform: paid.reduce((s, r) => s + Number(r.platform_amount || 0), 0),
      },
    });
  }));

  console.log('[dakshina] routes registered under /api/dakshina + /api/admin/dakshina');
};

module.exports.loadDakshinaConfig = loadConfig;
module.exports.DAKSHINA_VENDOR_SHARE = DAKSHINA_VENDOR_SHARE;
