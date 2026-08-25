// Remedies commerce — saved addresses, multi-item cart checkout, order history.
//
// Replaces the old single-item POST /api/orders + GET /api/orders/mine that lived in
// index.js. Those were written before `resolveCustomerFromReq` existed and each
// re-implemented its JWT-phone-to-customer-UUID lookup inline; the POST had no caller in
// any app (RemedyShop.js deliberately never called it), and the GET passed a legacy
// `user_<timestamp>` id straight into .eq() on a uuid column, which Postgres rejects — a
// guaranteed 500 for any customer still holding a pre-UUID token.
//
// HANDLER ORDER IS DELIBERATE, and mirrors src/astroRoutes.js:
//   resolve customer → validate address → reprice from the DB → check the ordering gate
//   → check stock → create the order → ONLY THEN move money.
// So a blocked category, an unknown item or an out-of-stock line never charges anybody,
// and no money moves before there is an order row whose id can key the idempotency.
//
// MONEY RULES (non-negotiable — see CLAUDE.md's 2026-08-07 data-layer audit):
//   * Nothing money-shaped in a request body is ever trusted. Prices, fees and totals are
//     always re-derived here from remedy_items + app_settings. The client displays what
//     /api/orders/quote returns; it never computes a total of its own.
//   * Every wallet movement goes through src/wallet.js (the atomic
//     adjust_customer_wallet RPC) with an order-derived idempotency key — never a
//     read-modify-write, never a random key.
//   * Every payment confirmation is replay-safe via an atomic status claim, exactly as
//     POST /api/wallet/verify-payment does it: 0 rows updated means somebody already
//     handled this payment, which is a SUCCESS, not an error.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const razorpay = require('./razorpay');
const wallet = require('./wallet');
const { resolveLineCommissions } = require('./remedyCommission');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';

// Service-role client. This module only ever runs behind JWT auth, so a single
// service-role client for both reads and writes keeps it self-contained — the same
// convention as src/adminRoutes.js and src/astroRoutes.js.
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Sanity ceilings. Not business rules — just bounds so a malformed or malicious cart
// can't ask us to price 10,000 lines or 2 billion units of anything.
const MAX_LINES = 20;
const MAX_QTY_PER_LINE = 10;

const ORDER_STATUSES_CANCELLABLE = ['placed', 'confirmed'];

// Money is numeric in Postgres but arrives here as a JS float. Round every derived figure
// so a cart of 3 × ₹33.33 can't produce ₹99.99000000000001 on an invoice.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * JWT → the real customers row. Mirrors src/astroRoutes.js's resolveCustomer: the phone
 * in the token is the reliable identifier, the id inside it may be a legacy
 * `user_<timestamp>` string from a token issued before the UUID fix.
 */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  const userId = decoded.userId || decoded._id || decoded.id;
  let customer = null;
  if (decoded.phone) {
    const { data } = await db
      .from('customers').select('id, name, mobile, wallet_balance').eq('mobile', decoded.phone).limit(1);
    if (data && data.length) customer = data[0];
  }
  if (!customer && userId && String(userId).includes('-')) {
    const { data } = await db
      .from('customers').select('id, name, mobile, wallet_balance').eq('id', userId).single();
    if (data) customer = data;
  }
  return customer;
}

/** Read several app_settings keys in one round trip. Missing keys fall back to defaults. */
async function getSettings(defaults) {
  const keys = Object.keys(defaults);
  const out = { ...defaults };
  try {
    const { data } = await db.from('app_settings').select('key, value').in('key', keys);
    for (const row of data || []) {
      if (row.value != null && row.value !== '') out[row.key] = row.value;
    }
  } catch (_) {
    // Fall back to the defaults. Note what those defaults mean: fees default to 0 and the
    // per-type gate defaults to CLOSED, so a settings read failure can only ever
    // under-charge or refuse — never over-charge or let a blocked category through.
  }
  return out;
}

/** Is this remedy type currently accepting orders? Defaults to NO if the key is absent. */
async function orderingGate(types) {
  const defaults = {};
  for (const t of types) defaults[`remedy_orders_enabled_${t}`] = 'false';
  const settings = await getSettings(defaults);
  const blocked = types.filter((t) => String(settings[`remedy_orders_enabled_${t}`]) !== 'true');
  return { blocked };
}

/**
 * Collapse a client cart into priced lines, entirely from the DB.
 *
 * Returns { ok: false, code, ... } for anything the caller should turn into a 4xx, so the
 * quote endpoint and the checkout endpoint make the identical judgement about an identical
 * cart — checkout re-runs this rather than trusting the quote the app was shown.
 */
async function priceCart(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, code: 'EMPTY_CART', message: 'Your cart is empty' };
  }
  if (rawItems.length > MAX_LINES) {
    return { ok: false, code: 'TOO_MANY_LINES', message: `A single order can hold at most ${MAX_LINES} different items` };
  }

  // Merge duplicate lines for the same item, then clamp. A client that sends the same
  // itemId twice means "one line, combined quantity", not two lines.
  const wanted = new Map();
  for (const raw of rawItems) {
    const itemId = raw && raw.itemId;
    if (!itemId || typeof itemId !== 'string') {
      return { ok: false, code: 'BAD_ITEM', message: 'Cart contains an invalid item' };
    }
    const qty = Math.max(1, parseInt(raw.quantity, 10) || 1);
    wanted.set(itemId, Math.min(MAX_QTY_PER_LINE, (wanted.get(itemId) || 0) + qty));
  }

  // is_active is enforced here, which the old POST /api/orders did not do — it looked an
  // item up by id alone, so a product an admin had deactivated was still orderable by
  // anyone holding its id.
  const ids = [...wanted.keys()];
  const { data: rows, error } = await db
    .from('remedy_items')
    .select('id, type, title, title_hi, price, image, stock, unit_label, is_active')
    .in('id', ids)
    .eq('is_active', true);
  if (error) throw error;

  const found = new Map((rows || []).map((r) => [r.id, r]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    return {
      ok: false,
      code: 'ITEM_UNAVAILABLE',
      message: 'Some items in your cart are no longer available',
      missing,
    };
  }

  const lines = ids.map((id) => {
    const row = found.get(id);
    const quantity = wanted.get(id);
    const unitPrice = round2(row.price);
    return {
      itemId: row.id,
      title: row.title,
      titleHi: row.title_hi || null,
      type: row.type,
      image: row.image || null,
      unitLabel: row.unit_label || null,
      unitPrice,
      quantity,
      lineTotal: round2(unitPrice * quantity),
      stock: row.stock,
    };
  });

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  const settings = await getSettings({
    remedy_delivery_fee: '0',
    remedy_free_delivery_above: '0',
    remedy_handling_fee: '0',
  });
  const baseDelivery = Math.max(0, round2(Number(settings.remedy_delivery_fee) || 0));
  const freeAbove = Math.max(0, Number(settings.remedy_free_delivery_above) || 0);
  const handlingFee = Math.max(0, round2(Number(settings.remedy_handling_fee) || 0));

  // freeAbove of 0 means "no threshold", i.e. the fee always applies.
  const deliveryFee = freeAbove > 0 && subtotal >= freeAbove ? 0 : baseDelivery;

  return {
    ok: true,
    lines,
    subtotal,
    deliveryFee,
    handlingFee,
    freeDeliveryAbove: freeAbove,
    grandTotal: round2(subtotal + deliveryFee + handlingFee),
    types: [...new Set(lines.map((l) => l.type))],
  };
}

/** Which lines can't be fulfilled from stock? `stock === null` means unlimited. */
function stockShortfalls(lines) {
  return lines
    .filter((l) => l.stock !== null && l.stock !== undefined && l.stock < l.quantity)
    .map((l) => ({ itemId: l.itemId, title: l.title, wanted: l.quantity, available: l.stock }));
}

/**
 * Move stock by a signed delta, per line, with an optimistic compare-and-set so two
 * simultaneous checkouts can't both decrement from the same starting value.
 *
 * Deliberately NEVER throws: this only ever runs AFTER the customer has been charged, so a
 * stock bookkeeping failure must not fail the request or lose the order. It logs loudly
 * instead — an admin correcting a stock count is recoverable, a customer paying for an
 * order that then 500s is not.
 */
async function moveStock(lines, sign) {
  for (const line of lines) {
    if (line.stock === null || line.stock === undefined) continue; // unlimited
    let applied = false;
    for (let attempt = 0; attempt < 3 && !applied; attempt += 1) {
      const { data: cur } = await db
        .from('remedy_items').select('stock').eq('id', line.itemId).single();
      if (!cur || cur.stock === null || cur.stock === undefined) { applied = true; break; }
      const next = Math.max(0, cur.stock + sign * line.quantity);
      const { data: upd } = await db
        .from('remedy_items')
        .update({ stock: next })
        .eq('id', line.itemId)
        .eq('stock', cur.stock)   // the compare-and-set
        .select('id');
      applied = !!(upd && upd.length);
    }
    if (!applied) {
      console.error(
        `[orders] stock ${sign < 0 ? 'decrement' : 'restore'} failed for item ${line.itemId} ` +
        `(qty ${line.quantity}) after 3 attempts — stock count needs a manual correction.`,
      );
    }
  }
}

/** Append to the order's status history. Never throws — the timeline is not worth a 500. */
async function logStatus(orderId, status, note, createdBy = 'system') {
  try {
    await db.from('order_status_events').insert([{
      order_id: orderId, status, note: note || null, created_by: createdBy,
    }]);
  } catch (err) {
    console.error('[orders] status event insert failed:', err.message);
  }
}

// Checkout de-duplication needs orders.client_request_id
// (sql/remedy_commerce_client_request_id.sql). DEPLOY ORDER DOES NOT MATTER, the same
// posture src/wallet.js takes about its atomic functions: if the column isn't there yet,
// checkout keeps working without the dedup guard and logs a loud warning once, rather than
// 500ing on every order until someone runs the SQL. Once applied, the guard engages with no
// restart. Watch for this warning in the logs to confirm the migration actually took.
let dedupeAvailable = true;
let warnedDedupe = false;
function noteDedupeUnavailable() {
  dedupeAvailable = false;
  if (!warnedDedupe) {
    warnedDedupe = true;
    console.warn(
      '[orders] orders.client_request_id is missing — checkout de-duplication is DISABLED, '
      + 'so a retried or raced checkout can create a second order and charge again. Run '
      + 'sql/remedy_commerce_client_request_id.sql in the Supabase SQL editor.',
    );
  }
}
// PostgREST reports an unknown column as PGRST204; Postgres itself as 42703.
const isMissingColumn = (err) =>
  !!err && (err.code === 'PGRST204' || err.code === '42703'
    || /client_request_id|source/.test(err.message || '') && /column|schema cache/i.test(err.message || ''));

// orders.source ('app' | 'web') — which storefront placed the order, so the admin can tell
// a shop.astrowani.com order from one placed inside the app. Purely descriptive: nothing
// branches on it, no money depends on it. Same degradation posture as client_request_id
// above, for the same reason — an unapplied migration must not take checkout down.
let sourceAvailable = true;
let warnedSource = false;
function noteSourceUnavailable() {
  sourceAvailable = false;
  if (!warnedSource) {
    warnedSource = true;
    console.warn(
      '[orders] orders.source is missing — orders will not record which storefront placed '
      + 'them. Run sql/order_source.sql in the Supabase SQL editor.',
    );
  }
}
const ORDER_SOURCES = ['app', 'web'];

/** The address, frozen. See sql/remedy_commerce_schema.sql on orders.delivery_address. */
function snapshotAddress(a) {
  return {
    label: a.label,
    full_name: a.full_name,
    phone: a.phone,
    house_flat: a.house_flat,
    street_area: a.street_area,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  };
}

/** One-line human-readable form, for the legacy orders.address text column and the admin. */
function addressToText(a) {
  return [a.house_flat, a.street_area, a.landmark, a.city, a.state, a.pincode]
    .filter(Boolean).join(', ');
}

function validateAddressBody(body) {
  const required = ['full_name', 'phone', 'house_flat', 'city', 'pincode'];
  const missing = required.filter((f) => !String(body?.[f] || '').trim());
  if (missing.length) return `Please fill in: ${missing.join(', ')}`;
  if (!/^[1-9][0-9]{5}$/.test(String(body.pincode).trim())) return 'Enter a valid 6-digit pincode';
  if (!/^[0-9]{10}$/.test(String(body.phone).replace(/\D/g, '').slice(-10))) return 'Enter a valid 10-digit phone number';
  if (body.label && !['home', 'work', 'other'].includes(body.label)) return 'Invalid address label';
  return null;
}

function pickAddressFields(body) {
  return {
    label: body.label || 'home',
    full_name: String(body.full_name).trim(),
    phone: String(body.phone).replace(/\D/g, '').slice(-10),
    house_flat: String(body.house_flat).trim(),
    street_area: body.street_area ? String(body.street_area).trim() : null,
    landmark: body.landmark ? String(body.landmark).trim() : null,
    city: String(body.city).trim(),
    state: body.state ? String(body.state).trim() : null,
    pincode: String(body.pincode).trim(),
  };
}

module.exports = (app) => {
  // Async wrapper so a thrown error becomes a 500 through Express's error middleware
  // (src/errorLogger.js) rather than an unhandled rejection. Same helper shape as
  // adminRoutes.js's h().
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const auth = (fn) => h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer?.id) return res.status(401).json({ success: false, message: 'Not authenticated' });
    return fn(req, res, customer);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Public storefront config
  //
  // shop.astrowani.com is a static site with no Supabase client of its own, so unlike the
  // two apps it cannot read app_settings directly. This is the read-only slice of those
  // settings a storefront legitimately needs before anyone is signed in: which categories
  // are accepting orders, and what delivery costs.
  //
  // It is a CONVENIENCE, never an enforcement point. /quote and /checkout re-derive every
  // one of these figures server-side and /checkout 403s a blocked category regardless of
  // what a client believed. All this buys is that a shopper learns a category is not
  // delivering yet from the product card, instead of at the payment step.
  //
  // Deliberately unauthenticated: it holds no customer data, and requiring a token would
  // mean a signed-out visitor could not be told what is on sale.
  // ───────────────────────────────────────────────────────────────────────────

  const STORE_TYPES = ['gemstone', 'puja', 'specific_puja', 'life_report'];
  let storeConfigCache = { at: 0, body: null };

  app.get('/api/store/config', h(async (req, res) => {
    // 60s TTL, same shape as the other in-memory caches in this codebase. Every visitor
    // hits this on page load and the values change a few times a year.
    if (storeConfigCache.body && Date.now() - storeConfigCache.at < 60000) {
      return res.json(storeConfigCache.body);
    }

    const defaults = { remedy_delivery_fee: '0', remedy_free_delivery_above: '0', remedy_handling_fee: '0' };
    for (const t of STORE_TYPES) defaults[`remedy_orders_enabled_${t}`] = 'false';
    const settings = await getSettings(defaults);

    const ordering = {};
    for (const t of STORE_TYPES) ordering[t] = String(settings[`remedy_orders_enabled_${t}`]) === 'true';

    const freeAbove = Math.max(0, Number(settings.remedy_free_delivery_above) || 0);
    const body = {
      success: true,
      ordering,
      deliveryFee: Math.max(0, round2(Number(settings.remedy_delivery_fee) || 0)),
      // 0 in app_settings means "no threshold". Sent as null so the storefront does not
      // render "free delivery above ₹0", which would read as free delivery on everything.
      freeDeliveryAbove: freeAbove > 0 ? freeAbove : null,
      handlingFee: Math.max(0, round2(Number(settings.remedy_handling_fee) || 0)),
      maxLines: MAX_LINES,
      maxQtyPerLine: MAX_QTY_PER_LINE,
    };

    storeConfigCache = { at: Date.now(), body };
    return res.json(body);
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // Address book
  // ───────────────────────────────────────────────────────────────────────────

  app.get('/api/addresses', auth(async (req, res, customer) => {
    const { data, error } = await db
      .from('customer_addresses').select('*')
      .eq('customer_id', customer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  app.post('/api/addresses', auth(async (req, res, customer) => {
    const invalid = validateAddressBody(req.body);
    if (invalid) return res.status(400).json({ success: false, message: invalid });

    const fields = pickAddressFields(req.body);

    // The first address a customer saves is their default whether they asked or not —
    // otherwise checkout has nothing pre-selected and the "Deliver to" row reads empty.
    const { count } = await db
      .from('customer_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id);
    const makeDefault = req.body.is_default === true || !count;

    // uq_customer_addresses_one_default is a real unique index, so clearing the previous
    // default is not optional politeness — the insert would fail without it.
    if (makeDefault) {
      await db.from('customer_addresses')
        .update({ is_default: false }).eq('customer_id', customer.id).eq('is_default', true);
    }

    const { data, error } = await db.from('customer_addresses').insert([{
      ...fields, customer_id: customer.id, is_default: makeDefault,
    }]).select().single();

    if (error) {
      // Two rapid taps on Save can both decide they're the default, clear the old one, and
      // then both try to insert with is_default = true — the second violates
      // uq_customer_addresses_one_default. Saving it as a non-default is a far better
      // outcome than a 500 that loses an address the customer just typed out.
      if (error.code === '23505' || /uq_customer_addresses_one_default/.test(error.message || '')) {
        const retry = await db.from('customer_addresses').insert([{
          ...fields, customer_id: customer.id, is_default: false,
        }]).select().single();
        if (retry.error) throw retry.error;
        return res.status(201).json({ success: true, data: retry.data });
      }
      throw error;
    }
    return res.status(201).json({ success: true, data });
  }));

  app.put('/api/addresses/:id', auth(async (req, res, customer) => {
    const invalid = validateAddressBody(req.body);
    if (invalid) return res.status(400).json({ success: false, message: invalid });

    // Scope the write by customer_id as well as id: an address id is a UUID, but that is
    // obscurity, not authorisation.
    const { data: owned } = await db
      .from('customer_addresses').select('id')
      .eq('id', req.params.id).eq('customer_id', customer.id).single();
    if (!owned) return res.status(404).json({ success: false, message: 'Address not found' });

    const patch = { ...pickAddressFields(req.body), updated_at: new Date().toISOString() };
    if (req.body.is_default === true) {
      await db.from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', customer.id).eq('is_default', true).neq('id', req.params.id);
      patch.is_default = true;
    }

    const { data, error } = await db.from('customer_addresses')
      .update(patch).eq('id', req.params.id).eq('customer_id', customer.id).select().single();
    if (error) throw error;
    return res.json({ success: true, data });
  }));

  app.delete('/api/addresses/:id', auth(async (req, res, customer) => {
    // Past orders keep their own frozen copy in orders.delivery_address, so deleting a
    // saved address can never change where an existing order says it shipped.
    const { data, error } = await db.from('customer_addresses')
      .delete().eq('id', req.params.id).eq('customer_id', customer.id).select('id, is_default');
    if (error) throw error;
    if (!data || !data.length) return res.status(404).json({ success: false, message: 'Address not found' });

    // Promote the most recent survivor so the customer is never left with addresses but no
    // default (which would make checkout look empty despite having somewhere to ship to).
    if (data[0].is_default) {
      const { data: next } = await db
        .from('customer_addresses').select('id')
        .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(1);
      if (next && next.length) {
        await db.from('customer_addresses').update({ is_default: true }).eq('id', next[0].id);
      }
    }
    return res.json({ success: true });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // Quote — the single source of truth for every number the cart screen shows
  // ───────────────────────────────────────────────────────────────────────────

  app.post('/api/orders/quote', auth(async (req, res) => {
    const quote = await priceCart(req.body?.items);
    if (!quote.ok) return res.status(400).json({ success: false, ...quote });

    const { blocked } = await orderingGate(quote.types);
    const shortfalls = stockShortfalls(quote.lines);

    return res.json({
      success: true,
      // `stock` is dropped from the response: the app has no business seeing inventory
      // counts, and `outOfStock` below already says everything it needs to act on.
      items: quote.lines.map(({ stock, ...line }) => line),
      subtotal: quote.subtotal,
      deliveryFee: quote.deliveryFee,
      handlingFee: quote.handlingFee,
      freeDeliveryAbove: quote.freeDeliveryAbove,
      grandTotal: quote.grandTotal,
      blockedTypes: blocked,
      outOfStock: shortfalls,
      canCheckout: blocked.length === 0 && shortfalls.length === 0,
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // Checkout
  // ───────────────────────────────────────────────────────────────────────────

  app.post('/api/orders/checkout', auth(async (req, res, customer) => {
    const paymentMethod = String(req.body?.paymentMethod || '');

    // De-duplication. The wallet debit is keyed on the order id, which guarantees one order
    // can't be charged twice — but every call mints a NEW order id, so without this a
    // retried checkout is a second order and a second charge. Verified against the real DB:
    // two simultaneous identical checkouts charged twice.
    //
    // The token is per checkout ATTEMPT, not per cart, so deliberately buying the same item
    // again later is unaffected. Optional: a client that omits it simply gets the old
    // behaviour rather than an error.
    const clientRequestId = req.body?.clientRequestId
      ? String(req.body.clientRequestId).slice(0, 120)
      : null;

    if (clientRequestId && dedupeAvailable) {
      // A voided attempt (insufficient balance, then a top-up and retry) must NOT be
      // returned as already-done — only a live order counts as a duplicate.
      const { data: dupe, error: dupeErr } = await db.from('orders')
        .select('*, order_items(*)')
        .eq('customer_id', customer.id)
        .eq('client_request_id', clientRequestId)
        .neq('status', 'cancelled')
        .limit(1);
      if (dupeErr && isMissingColumn(dupeErr)) noteDedupeUnavailable();
      if (dupe && dupe.length) {
        const existing = dupe[0];
        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          paymentMethod: existing.payment_method,
          orderId: existing.id,
          order: existing,
          // A pending_payment duplicate is an in-flight Razorpay attempt, so hand back what
          // the app needs to resume that same gateway order rather than opening a new one.
          razorpayOrderId: existing.razorpay_order_id || undefined,
          amount: Number(existing.grand_total),
          keyId: existing.razorpay_order_id ? razorpay.RAZORPAY_KEY_ID : undefined,
        });
      }
    }

    if (paymentMethod === 'cod') {
      // The app shows Cash on Delivery as a real but disabled option so the payment screen
      // tells the truth about what is coming. Enabling it is a change here, not a migration
      // — the DB already accepts 'cod' as a payment_method.
      return res.status(400).json({
        success: false, code: 'COD_COMING_SOON',
        message: 'Cash on Delivery is coming soon. Please pay online or from your wallet.',
      });
    }
    if (!['razorpay', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Choose a payment method' });
    }

    // 1. Address — required for physical remedies, and must belong to this customer.
    const addressId = req.body?.addressId;
    if (!addressId) return res.status(400).json({ success: false, message: 'Select a delivery address' });
    const { data: address } = await db
      .from('customer_addresses').select('*')
      .eq('id', addressId).eq('customer_id', customer.id).single();
    if (!address) return res.status(400).json({ success: false, message: 'Delivery address not found' });

    // 2. Reprice from the DB. Whatever total the app was showing is irrelevant.
    const quote = await priceCart(req.body?.items);
    if (!quote.ok) return res.status(400).json({ success: false, ...quote });

    // 3. The gate, enforced server-side. An old installed build with a stale idea of which
    //    categories are live cannot slip an order past this.
    const { blocked } = await orderingGate(quote.types);
    if (blocked.length) {
      return res.status(403).json({
        success: false, code: 'CATEGORY_NOT_SERVICEABLE', blockedTypes: blocked,
        message: 'We are not delivering some of these items to your location yet.',
      });
    }

    // 4. Stock.
    const shortfalls = stockShortfalls(quote.lines);
    if (shortfalls.length) {
      return res.status(409).json({
        success: false, code: 'OUT_OF_STOCK', outOfStock: shortfalls,
        message: `${shortfalls[0].title} is out of stock`,
      });
    }

    if (quote.grandTotal <= 0) {
      return res.status(400).json({ success: false, message: 'Order total must be greater than zero' });
    }

    // 5. Razorpay order first when paying online — if the gateway is down we want to fail
    //    before writing an order row that could never be paid.
    let rzOrder = null;
    if (paymentMethod === 'razorpay') {
      if (!razorpay.isConfigured()) {
        return res.status(503).json({ success: false, message: 'Online payment is temporarily unavailable' });
      }
      rzOrder = await razorpay.createOrder(quote.grandTotal, `ord_${Date.now()}`);
    }

    // 6. The order row. `status: 'pending_payment'` until money actually moves, so an
    //    abandoned Razorpay checkout is never mistaken for something to fulfil.
    //
    //    The legacy inline single-item columns are filled with a SUMMARY of the cart
    //    (item_title, item_type, quantity, total) purely so the existing readers that
    //    predate order_items — the admin Orders table and MyOrdersScreen — keep showing
    //    something meaningful instead of blanks. order_items is the real record; item_id
    //    is left null because a multi-item order does not have one item.
    const firstLine = quote.lines[0];
    const extraLines = quote.lines.length - 1;
    const summaryTitle = extraLines > 0
      ? `${firstLine.title} + ${extraLines} more item${extraLines > 1 ? 's' : ''}`
      : firstLine.title;
    const totalUnits = quote.lines.reduce((n, l) => n + l.quantity, 0);

    const orderRow = {
      customer_id: customer.id,
      item_id: null,
      item_title: summaryTitle,
      item_type: quote.types.length === 1 ? quote.types[0] : 'mixed',
      price: null,
      quantity: totalUnits,
      total: quote.grandTotal,
      subtotal: quote.subtotal,
      delivery_fee: quote.deliveryFee,
      handling_fee: quote.handlingFee,
      grand_total: quote.grandTotal,
      customer_name: address.full_name,
      customer_phone: address.phone,
      address: addressToText(address),
      address_id: address.id,
      delivery_address: snapshotAddress(address),
      payment_method: paymentMethod,
      razorpay_order_id: rzOrder ? rzOrder.id : null,
      status: 'pending_payment',
      payment_status: 'pending',
    };
    if (clientRequestId && dedupeAvailable) orderRow.client_request_id = clientRequestId;
    // Anything the client sends that is not one of the two known storefronts is recorded
    // as 'app', the pre-existing default — an unrecognised string is not worth a 400 over
    // a descriptive field, but it must not be written through either.
    if (sourceAvailable) {
      orderRow.source = ORDER_SOURCES.includes(req.body?.source) ? req.body.source : 'app';
    }

    let { data: order, error: orderErr } = await db.from('orders').insert([orderRow]).select().single();

    // A column isn't there yet — retry without the optional ones so an unapplied migration
    // degrades to "no dedup / no source" rather than "no orders at all". Which one is
    // missing is read off the message where possible; where it isn't, both are dropped,
    // since one more insert attempt is cheaper than guessing wrong on a checkout.
    if (orderErr && isMissingColumn(orderErr)) {
      const msg = orderErr.message || '';
      const namesSource = /source/.test(msg);
      const namesRequestId = /client_request_id/.test(msg);
      if (namesSource || !namesRequestId) { noteSourceUnavailable(); delete orderRow.source; }
      if (namesRequestId || !namesSource) { noteDedupeUnavailable(); delete orderRow.client_request_id; }
      ({ data: order, error: orderErr } = await db.from('orders').insert([orderRow]).select().single());
    }

    if (orderErr) {
      // The dedup check above loses to a genuinely simultaneous request — both read "no
      // duplicate", both insert. uq_orders_client_request lets exactly one win; the loser
      // lands here having charged nothing, and returns the winner's order. This is the
      // difference between "usually deduped" and "cannot double-charge".
      const isDupeKey = orderErr.code === '23505'
        || /uq_orders_client_request/.test(orderErr.message || '');
      if (clientRequestId && isDupeKey) {
        const { data: winner } = await db.from('orders')
          .select('*, order_items(*)')
          .eq('customer_id', customer.id)
          .eq('client_request_id', clientRequestId)
          .limit(1);
        if (winner && winner.length) {
          return res.status(200).json({
            success: true,
            alreadyProcessed: true,
            paymentMethod: winner[0].payment_method,
            orderId: winner[0].id,
            order: winner[0],
            razorpayOrderId: winner[0].razorpay_order_id || undefined,
            amount: Number(winner[0].grand_total),
            keyId: winner[0].razorpay_order_id ? razorpay.RAZORPAY_KEY_ID : undefined,
          });
        }
      }
      throw orderErr;
    }

    // Astrologer referral commission, snapshotted per line. Runs AFTER pricing and
    // annotates only — it can never change what the customer pays, because the
    // commission comes out of the platform's margin. Never throws: an unattributed
    // order is recoverable (an admin can attribute it), a blocked purchase is not.
    // Actual payment happens on delivery — see remedyCommission.js.
    const commissions = await resolveLineCommissions(db, customer.id, quote.lines);

    const { error: linesErr } = await db.from('order_items').insert(quote.lines.map((l) => {
      const c = commissions.get(l.itemId);
      return {
        order_id: order.id,
        item_id: l.itemId,
        item_title: l.title,
        item_type: l.type,
        image: l.image,
        unit_price: l.unitPrice,
        quantity: l.quantity,
        line_total: l.lineTotal,
        referred_by_astrologer_id: c ? c.astrologerId : null,
        commission_percent: c ? c.percent : null,
        commission_amount: c ? c.amount : null,
      };
    }));
    if (linesErr) throw linesErr;

    await logStatus(order.id, 'pending_payment', `Awaiting ${paymentMethod} payment`);

    // 7. Online: hand the app what it needs to open Razorpay. Nothing is fulfillable until
    //    /api/orders/verify-payment confirms the signature.
    if (paymentMethod === 'razorpay') {
      return res.status(200).json({
        success: true,
        paymentMethod,
        orderId: order.id,
        razorpayOrderId: rzOrder.id,
        amount: quote.grandTotal,
        currency: rzOrder.currency,
        keyId: razorpay.RAZORPAY_KEY_ID,
      });
    }

    // 8. Wallet: debit now. The idempotency key is derived from the order id, so a
    //    double-tapped checkout that somehow reached the same order cannot double-charge.
    let newBalance;
    try {
      newBalance = await wallet.adjustCustomerWallet(customer.id, -quote.grandTotal, {
        description: `Remedy order ${order.id} (${summaryTitle})`,
        idempotencyKey: `order:${order.id}`,
      });
    } catch (err) {
      if (err instanceof wallet.InsufficientFunds || err.code === 'INSUFFICIENT_FUNDS') {
        // Void the unpayable order rather than leaving it pending forever, and tell the app
        // exactly how short the customer is so it can offer "Add ₹X" straight to the
        // existing Wallet screen.
        await db.from('orders')
          .update({ status: 'cancelled', payment_status: 'failed', cancelled_at: new Date().toISOString() })
          .eq('id', order.id);
        await logStatus(order.id, 'cancelled', 'Insufficient wallet balance');
        const balance = Number(customer.wallet_balance) || 0;
        return res.status(402).json({
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          message: 'Not enough wallet balance for this order',
          required: quote.grandTotal,
          balance,
          shortfall: round2(Math.max(0, quote.grandTotal - balance)),
        });
      }
      throw err;
    }

    const { data: paidOrder } = await db.from('orders').update({
      status: 'placed', payment_status: 'paid', paid_at: new Date().toISOString(),
    }).eq('id', order.id).select().single();

    await logStatus(order.id, 'placed', 'Paid from Astrowani wallet');
    await moveStock(quote.lines, -1);

    // Platform revenue, mirroring src/astroRoutes.js: the customer has already been
    // charged, so a failure to write the platform ledger row must be logged rather than
    // allowed to fail a paid order. Only wallet-paid orders touch admin_wallet — a
    // Razorpay-paid order's money never enters our ledger at all, and its revenue record
    // is the razorpay_payment_id on the order row.
    try {
      await wallet.adjustAdminWallet(quote.grandTotal, {
        description: `Remedy order: ${summaryTitle}`,
        customerId: customer.id,
        idempotencyKey: `order:${order.id}:admin`,
      });
    } catch (err) {
      console.error(`[orders] admin ledger credit failed for order ${order.id} (customer already charged):`, err.message);
    }

    return res.status(200).json({
      success: true, paymentMethod, orderId: order.id, order: paidOrder || order, newBalance,
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // Razorpay confirmation — structural clone of POST /api/wallet/verify-payment
  // ───────────────────────────────────────────────────────────────────────────

  app.post('/api/orders/verify-payment', auth(async (req, res, customer) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    const valid = razorpay.verifySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      // Leave status at 'pending_payment' — only payment_status records the failure, so a
      // genuine retry against the same Razorpay order can still succeed.
      await db.from('orders')
        .update({ payment_status: 'failed' })
        .eq('razorpay_order_id', razorpay_order_id)
        .eq('customer_id', customer.id)
        .eq('status', 'pending_payment');
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // The atomic claim. Only succeeds once per order, and only for the customer who
    // created it. A second verify call (retry, double-tap, replay) matches 0 rows and is a
    // no-op — success, not an error, because the first call already did the work.
    const { data: claimed, error: claimErr } = await db.from('orders').update({
      razorpay_payment_id,
      status: 'placed',
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    })
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('customer_id', customer.id)
      .eq('status', 'pending_payment')
      .select('*');
    if (claimErr) throw claimErr;

    if (!claimed || !claimed.length) {
      const { data: existing } = await db.from('orders')
        .select('*, order_items(*)')
        .eq('razorpay_order_id', razorpay_order_id)
        .eq('customer_id', customer.id)
        .single();
      if (existing?.payment_status === 'paid') {
        return res.status(200).json({ success: true, alreadyProcessed: true, order: existing });
      }
      return res.status(409).json({ success: false, message: 'Order not found or not payable' });
    }

    const order = claimed[0];
    await logStatus(order.id, 'placed', `Paid online (payment ${razorpay_payment_id})`);

    // Stock comes off at confirmation, never at add-to-cart, so an abandoned checkout
    // never holds inventory hostage.
    const { data: lines } = await db.from('order_items')
      .select('item_id, quantity').eq('order_id', order.id);
    if (lines && lines.length) {
      const withStock = [];
      const { data: stockRows } = await db.from('remedy_items')
        .select('id, stock').in('id', lines.map((l) => l.item_id).filter(Boolean));
      const stockById = new Map((stockRows || []).map((r) => [r.id, r.stock]));
      for (const l of lines) {
        if (!l.item_id) continue;
        withStock.push({ itemId: l.item_id, quantity: l.quantity, stock: stockById.get(l.item_id) ?? null });
      }
      await moveStock(withStock, -1);
    }

    const { data: full } = await db.from('orders')
      .select('*, order_items(*), order_status_events(*)').eq('id', order.id).single();

    return res.status(200).json({ success: true, order: full || order });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // History + cancellation
  // ───────────────────────────────────────────────────────────────────────────

  app.get('/api/orders/mine', auth(async (req, res, customer) => {
    // Hides 'pending_payment' rows: an abandoned Razorpay checkout is not an order the
    // customer should see in their history, and showing one would read as a charge.
    const { data, error } = await db.from('orders')
      .select('*, order_items(*), order_status_events(id, status, note, created_at)')
      .eq('customer_id', customer.id)
      .neq('status', 'pending_payment')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    // Readers can rely on `items` always being an array. Orders that predate order_items
    // (every life_report order) get a single synthetic line built from the inline columns,
    // so the app renders one code path instead of two.
    const orders = (data || []).map((o) => ({
      ...o,
      items: (o.order_items && o.order_items.length) ? o.order_items : (o.item_title ? [{
        item_id: o.item_id,
        item_title: o.item_title,
        item_type: o.item_type,
        image: null,
        unit_price: o.price,
        quantity: o.quantity || 1,
        line_total: o.total,
        legacy: true,
      }] : []),
      timeline: (o.order_status_events || [])
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
      cancellable: ORDER_STATUSES_CANCELLABLE.includes(o.status),
    }));

    return res.json({ success: true, data: orders });
  }));

  app.post('/api/orders/:id/cancel', auth(async (req, res, customer) => {
    const { data: order } = await db.from('orders')
      .select('*, order_items(item_id, quantity)')
      .eq('id', req.params.id).eq('customer_id', customer.id).single();
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!ORDER_STATUSES_CANCELLABLE.includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: order.status === 'cancelled'
          ? 'This order is already cancelled'
          : 'This order has already been packed and can no longer be cancelled',
      });
    }

    // Claim the cancellation atomically, so two taps can't both proceed to refund.
    const { data: claimed } = await db.from('orders').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
    })
      .eq('id', order.id)
      .in('status', ORDER_STATUSES_CANCELLABLE)
      .select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ success: false, message: 'This order is no longer cancellable' });
    }

    let refund = { refunded: false, amount: 0 };
    if (order.payment_status === 'paid') {
      const amount = round2(Number(order.grand_total ?? order.total) || 0);
      if (order.payment_method === 'wallet' && amount > 0) {
        // Straight back to the wallet, keyed on the order so a retried cancel can't
        // refund twice.
        await wallet.adjustCustomerWallet(customer.id, amount, {
          description: `Refund for cancelled remedy order ${order.id}`,
          idempotencyKey: `order-refund:${order.id}`,
        });
        await db.from('orders').update({ payment_status: 'refunded' }).eq('id', order.id);
        refund = { refunded: true, amount };
        await logStatus(order.id, 'cancelled', `Cancelled by customer — ₹${amount} refunded to wallet`, 'customer');

        // Reverse the platform-revenue credit taken at checkout.
        try {
          await wallet.adjustAdminWallet(-amount, {
            description: `Refund: cancelled remedy order ${order.id}`,
            customerId: customer.id,
            idempotencyKey: `order-refund:${order.id}:admin`,
          });
        } catch (err) {
          console.error(`[orders] admin ledger reversal failed for order ${order.id}:`, err.message);
        }
      } else {
        // Razorpay refunds are not automated — there is no gateway refund call in this
        // codebase. Flagged for an admin to process from the Razorpay dashboard.
        await db.from('orders').update({ payment_status: 'refund_pending' }).eq('id', order.id);
        await logStatus(order.id, 'cancelled', 'Cancelled by customer — online refund pending', 'customer');
        refund = { refunded: false, amount, pending: true };
      }
    } else {
      await logStatus(order.id, 'cancelled', 'Cancelled by customer', 'customer');
    }

    // Put unsold stock back.
    const lines = order.order_items || [];
    if (lines.length) {
      const { data: stockRows } = await db.from('remedy_items')
        .select('id, stock').in('id', lines.map((l) => l.item_id).filter(Boolean));
      const stockById = new Map((stockRows || []).map((r) => [r.id, r.stock]));
      await moveStock(
        lines.filter((l) => l.item_id).map((l) => ({
          itemId: l.item_id, quantity: l.quantity, stock: stockById.get(l.item_id) ?? null,
        })),
        +1,
      );
    }

    return res.json({ success: true, refund });
  }));
};
