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

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const creditKey = (paymentId) => `razorpay:${paymentId}`;
const creditNote = (paymentId) => `Wallet recharge via Razorpay (payment ${paymentId})`;

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
    const newBalance = await wallet.adjustCustomerWallet(r.customer_id, Number(r.amount), {
      description: creditNote(razorpayPaymentId),
      idempotencyKey: creditKey(razorpayPaymentId),
    });
    return { matched: true, credited: true, customerId: r.customer_id, newBalance };
  }

  // Somebody else claimed it, or it is not payable. Re-read the current state.
  let eq = db.from('wallet_recharges')
    .select('status, customer_id, amount, razorpay_payment_id')
    .eq('razorpay_order_id', razorpayOrderId);
  if (customerId) eq = eq.eq('customer_id', customerId);
  const { data: now } = await eq.maybeSingle();

  if (now?.status === 'paid') {
    // Self-heal: re-apply the credit under the SAME key. A no-op when it already
    // landed; completes it when a previous call claimed the row but failed to credit.
    const payId = now.razorpay_payment_id || razorpayPaymentId;
    const newBalance = await wallet.adjustCustomerWallet(now.customer_id, Number(now.amount), {
      description: creditNote(payId),
      idempotencyKey: creditKey(payId),
    });
    return { matched: true, alreadyProcessed: true, customerId: now.customer_id, newBalance };
  }
  return { matched: true, payable: false, customerId: now?.customer_id };
}

module.exports = { completeRecharge };
