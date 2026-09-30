// Completing a Razorpay wallet recharge — the ONE implementation, shared by:
//   * POST /api/wallet/verify-payment   (the app, right after checkout), and
//   * POST /api/razorpay/webhook        (Razorpay, server-to-server).
//
// WHY TWO CALLERS: if a customer pays and the app dies before verify-payment lands
// (killed, network drop, phone locked), the money was taken and the recharge was
// never credited — the only recovery used to be an admin noticing. The webhook
// completes the same recharge from Razorpay's side. Whichever arrives first wins;
// the other is a no-op.
//
// EXACTLY-ONCE, twice over:
//   1. the status claim (created -> paid) succeeds for one caller only, and
//   2. the credit is keyed `razorpay:<paymentId>` — adjust_customer_wallet returns
//      the current balance WITHOUT crediting when that key already exists
//      (sql/hardening_03_atomic_wallet.sql). Both callers use the same key.
//
// SELF-HEALING: because (2) makes a repeated credit a no-op, a recharge found
// already 'paid' re-applies its credit. That fixes the one gap the old inline code
// had — a claim that succeeded but whose credit then failed left the row 'paid'
// with no money, and no retry could ever complete it.
const { createClient } = require('@supabase/supabase-js');
const wallet = require('./wallet');
const razorpay = require('./razorpay');
const rechargeOffer = require('./rechargeOffer');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const creditKey = (paymentId) => `razorpay:${paymentId}`;
// The key is deliberately unchanged by the bonus — see rechargeOffer.js. The note names
// it instead, so a customer reading their wallet history can see where the extra came from.
const creditNote = (paymentId, bonus = 0, offerLabel = null) => (
  bonus > 0
    ? `Wallet recharge via Razorpay (payment ${paymentId}) + ${offerLabel || `₹${bonus} bonus`}`
    : `Wallet recharge via Razorpay (payment ${paymentId})`
);

const MIN_RECHARGE_RUPEES = 1;
const MAX_RECHARGE_RUPEES = 100000;

/**
 * Start a Razorpay order that tops up a customer's wallet.
 *
 * Extracted from POST /api/wallet/create-order (2026-09-27) so the free call's
 * "buy N more minutes" button can open the gateway through the SAME path. That
 * matters for one specific reason: completeRecharge + razorpayWebhookRoutes already
 * recover a payment whose app died before verify-payment landed. A bespoke order type
 * would have needed its own recovery probe, and "paid but the app crashed" is exactly
 * the case nobody tests.
 *
 * The Razorpay order is created BEFORE the row is written, so a gateway failure leaves
 * nothing behind — same ordering as orderRoutes' checkout.
 *
 * @param {string} customerId
 * @param {number} amountRupees
 * @param {string} [receiptPrefix] 'wr' for an ordinary recharge, 'fcc' for a free-call
 *                                 continuation. Cosmetic: it only shows in Razorpay's
 *                                 dashboard, but it is what lets you tell the two apart
 *                                 there when reconciling.
 * @returns {Promise<{ok:boolean, orderId?:string, amount?:number, currency?:string,
 *                     keyId?:string, status?:number, code?:string, message?:string}>}
 *          Never throws for an expected refusal; the caller maps `status` straight to HTTP.
 */
async function createRechargeOrder(customerId, amountRupees, receiptPrefix = 'wr') {
  if (!razorpay.isConfigured()) {
    return { ok: false, status: 503, code: 'PAYMENTS_UNAVAILABLE', message: 'Payments are temporarily unavailable' };
  }
  const amount = Number(amountRupees);
  if (!Number.isFinite(amount) || amount < MIN_RECHARGE_RUPEES || amount > MAX_RECHARGE_RUPEES) {
    return {
      ok: false, status: 400, code: 'BAD_AMOUNT',
      message: `Amount must be between ₹${MIN_RECHARGE_RUPEES} and ₹${MAX_RECHARGE_RUPEES}`,
    };
  }
  const order = await razorpay.createOrder(amount, `${receiptPrefix}_${Date.now()}`);
  const { error } = await db.from('wallet_recharges').insert([{
    customer_id: customerId,
    amount,
    razorpay_order_id: order.id,
    status: 'created',
  }]);
  if (error) throw error;

  return {
    ok: true,
    orderId: order.id,
    amount,
    currency: order.currency,
    keyId: razorpay.RAZORPAY_KEY_ID,
  };
}

/**
 * @param {object}  p
 * @param {string}  p.razorpayOrderId
 * @param {string}  p.razorpayPaymentId
 * @param {string} [p.customerId]          the app path scopes to its own customer;
 *                                          the webhook has none and scopes by order id
 * @param {number} [p.expectedAmountPaise] the webhook passes Razorpay's captured
 *                                          amount; a mismatch refuses to credit
 * @returns {Promise<{matched:boolean, credited?:boolean, alreadyProcessed?:boolean,
 *                    payable?:boolean, amountMismatch?:boolean, customerId?:string,
 *                    newBalance?:number|null}>}
 */
async function completeRecharge({ razorpayOrderId, razorpayPaymentId, customerId = null, expectedAmountPaise = null }) {
  let rq = db.from('wallet_recharges')
    .select('id, customer_id, amount, status, razorpay_payment_id')
    .eq('razorpay_order_id', razorpayOrderId);
  if (customerId) rq = rq.eq('customer_id', customerId);
  const { data: row, error: readErr } = await rq.maybeSingle();
  if (readErr) throw readErr;
  if (!row) return { matched: false };

  // Refuse rather than credit a figure that does not match what was charged. This
  // cannot be fixed by retrying, so the caller logs it for a human.
  if (expectedAmountPaise != null && Math.round(Number(row.amount) * 100) !== Number(expectedAmountPaise)) {
    return { matched: true, amountMismatch: true, customerId: row.customer_id };
  }

  let cq = db.from('wallet_recharges')
    .update({ razorpay_payment_id: razorpayPaymentId, status: 'paid', paid_at: new Date().toISOString() })
    .eq('razorpay_order_id', razorpayOrderId)
    .eq('status', 'created');
  if (customerId) cq = cq.eq('customer_id', customerId);
  const { data: claimed, error: claimErr } = await cq.select();
  if (claimErr) throw claimErr;

  if (claimed && claimed.length) {
    const r = claimed[0];

    // Recharge bonus. Resolved HERE, once, by the server — never sent by the app — and
    // written to the row before the credit so the figure survives independently of
    // whatever the offer says later. Included in the SAME credit under the SAME key
    // rather than credited separately: the app callback and the webhook race on every
    // payment, and a second credit would be a second thing that could double-fire.
    //
    // A failure to resolve or record it must never cost the customer their recharge, so
    // both are best-effort and fall back to a plain top-up.
    let bonus = 0;
    let offerLabel = null;
    try {
      const resolved = await rechargeOffer.bonusFor(Number(r.amount));
      bonus = resolved.bonus;
      offerLabel = resolved.label;
      if (bonus > 0) {
        const { error: markErr } = await db.from('wallet_recharges')
          .update({ bonus_amount: bonus, offer_label: offerLabel })
          .eq('id', r.id);
        if (markErr) {
          // Could not record it, so do not pay it: an unrecorded bonus is money given
          // away with nothing to reconcile against, and the self-heal below would not
          // know to repeat it.
          console.warn('[walletRecharge] could not record the bonus, crediting the recharge only:', markErr.message);
          bonus = 0;
          offerLabel = null;
        }
      }
    } catch (e) {
      console.warn('[walletRecharge] bonus step failed, crediting the recharge only:', e.message);
      bonus = 0;
      offerLabel = null;
    }

    const newBalance = await wallet.adjustCustomerWallet(r.customer_id, Number(r.amount) + bonus, {
      description: creditNote(razorpayPaymentId, bonus, offerLabel),
      idempotencyKey: creditKey(razorpayPaymentId),
    });
    return { matched: true, credited: true, customerId: r.customer_id, newBalance, bonus };
  }

  // Somebody else claimed it, or it is not payable. Re-read the current state.
  let eq = db.from('wallet_recharges')
    .select('status, customer_id, amount, razorpay_payment_id, bonus_amount, offer_label')
    .eq('razorpay_order_id', razorpayOrderId);
  if (customerId) eq = eq.eq('customer_id', customerId);
  const { data: now } = await eq.maybeSingle();

  if (now?.status === 'paid') {
    // Self-heal: re-apply the credit under the SAME key. A no-op when it already
    // landed; completes it when a previous call claimed the row but failed to credit.
    //
    // The bonus is READ BACK from the row, never re-resolved. The offer may have been
    // changed or switched off since this payment was claimed, and what a payment is worth
    // has to be decided once. Re-running the slab maths here could also credit a
    // different total under an idempotency key that has already been used, which would
    // silently do nothing and leave the row disagreeing with the ledger.
    const payId = now.razorpay_payment_id || razorpayPaymentId;
    const bonus = Number(now.bonus_amount) || 0;
    const newBalance = await wallet.adjustCustomerWallet(now.customer_id, Number(now.amount) + bonus, {
      description: creditNote(payId, bonus, now.offer_label),
      idempotencyKey: creditKey(payId),
    });
    return { matched: true, alreadyProcessed: true, customerId: now.customer_id, newBalance, bonus };
  }
  return { matched: true, payable: false, customerId: now?.customer_id };
}

module.exports = {
  completeRecharge,
  createRechargeOrder,
  MIN_RECHARGE_RUPEES,
  MAX_RECHARGE_RUPEES,
};
