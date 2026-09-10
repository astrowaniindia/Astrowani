// POST /api/apple/notifications — App Store Server Notifications v2.
//
// THE GAP THIS CLOSES: Apple lets a customer refund a coin purchase after they have
// spent the coins. Until now a refund took the money back from us and left the coins
// with the customer. Apple now tells us, and we take back what is left.
//
// THE POLICY, stated because the code cannot defer it: coin_balance has a CHECK
// constraint forbidding negative values, so we can only recover coins that are still
// there. On a refund we take back min(coins credited, current balance). Anything
// already spent is NOT recovered; the ledger row says exactly how much, so it is
// visible to an admin. We never push a balance negative and never touch rupees.
//
// Handled:
//   REFUND / REVOKE   -> claw back, keyed `apple-refund:<transactionId>` (once only)
//   REFUND_REVERSED   -> give back exactly what the refund took, keyed
//                        `apple-refund-reversed:<transactionId>` (once only)
//   everything else   -> acknowledged 200 and ignored
//
// SETUP (after Apple enrolment — yours): App Store Connect -> the app -> App Information
// -> App Store Server Notifications -> Version 2 -> Production AND Sandbox URL:
//   https://backend.astrowani.com/api/apple/notifications
// Verification uses the same root certificates and APPLE_IAP_APP_APPLE_ID as purchases
// (src/appleIap.js); until those exist every call answers 503 and Apple retries.
const { createClient } = require('@supabase/supabase-js');
const appleIap = require('./appleIap');
const coins = require('./coins');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const refundKey = (txnId) => `apple-refund:${txnId}`;
const reversalKey = (txnId) => `apple-refund-reversed:${txnId}`;

async function findByKey(key) {
  const { data, error } = await db.from('coin_transactions')
    .select('id, customer_id, type, amount').eq('idempotency_key', key).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Take back the coins a refunded Apple purchase credited — as many as are left.
 * @returns {Promise<{status:string, credited?:number, recovered?:number, shortfall?:number, customerId?:string}>}
 */
async function refundPurchase(transactionId) {
  const txnId = String(transactionId);
  const { data: credit, error } = await db.from('coin_transactions')
    .select('customer_id, amount')
    .eq('apple_transaction_id', txnId).eq('type', 'credit').maybeSingle();
  if (error) throw error;
  // Refunded before we ever credited it (or not our transaction): nothing to undo.
  if (!credit) return { status: 'never-credited' };

  const existing = await findByKey(refundKey(txnId));
  if (existing) return { status: 'already-processed', recovered: existing.amount, customerId: credit.customer_id };

  // Two attempts: a spend landing between reading the balance and debiting it makes
  // the debit fail InsufficientCoins; re-read once and take what is left then.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const balance = await coins.getCoinBalance(credit.customer_id);
    const recovered = Math.max(0, Math.min(Number(credit.amount), Number(balance) || 0));
    const shortfall = Number(credit.amount) - recovered;

    if (recovered === 0) {
      // Everything was spent. There is no zero-amount ledger row (amount > 0 is a
      // CHECK), so the log line IS the record — make it unmissable.
      console.error(`[apple-refund] txn ${txnId}: all ${credit.amount} coins were already spent by ${credit.customer_id} — nothing recovered`);
      return { status: 'nothing-to-recover', credited: Number(credit.amount), recovered: 0, shortfall, customerId: credit.customer_id };
    }

    try {
      await coins.adjustCustomerCoins(credit.customer_id, -recovered, {
        idempotencyKey: refundKey(txnId),
        description: `Apple refunded purchase ${txnId}: recovered ${recovered} of ${credit.amount} coins`
          + (shortfall > 0 ? `; ${shortfall} had already been spent` : ''),
      });
      return { status: 'recovered', credited: Number(credit.amount), recovered, shortfall, customerId: credit.customer_id };
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS' && attempt === 0) continue;
      throw err;
    }
  }
  return { status: 'retry-exhausted' };
}

/** Apple reversed a refund: give back exactly what the refund took, once. */
async function reverseRefund(transactionId) {
  const txnId = String(transactionId);
  const refund = await findByKey(refundKey(txnId));
  if (!refund) return { status: 'nothing-was-recovered' };
  const already = await findByKey(reversalKey(txnId));
  if (already) return { status: 'already-processed', restored: already.amount };
  await coins.adjustCustomerCoins(refund.customer_id, Number(refund.amount), {
    idempotencyKey: reversalKey(txnId),
    description: `Apple reversed the refund of purchase ${txnId}: restored ${refund.amount} coins`,
  });
  return { status: 'restored', restored: Number(refund.amount), customerId: refund.customer_id };
}

const REFUND_TYPES = new Set(['REFUND', 'REVOKE']);

module.exports = function registerAppleNotificationRoutes(app) {
  app.post('/api/apple/notifications', async (req, res) => {
    const signedPayload = req.body && req.body.signedPayload;
    if (!signedPayload) return res.status(400).json({ ok: false, message: 'signedPayload is required' });

    let note;
    try {
      note = await appleIap.verifyNotification(signedPayload);
    } catch (err) {
      if (err.code === 'APPLE_IAP_NOT_CONFIGURED') {
        // 503 so Apple retries once we are configured — a refund is not lost.
        return res.status(503).json({ ok: false, message: 'Apple verification not configured' });
      }
      console.warn('[apple-notifications] rejected an unverifiable notification:', err.message);
      return res.status(400).json({ ok: false, message: 'Unverifiable notification' });
    }

    const type = note.notificationType;
    if (!REFUND_TYPES.has(type) && type !== 'REFUND_REVERSED') {
      return res.json({ ok: true, ignored: type || 'unknown' });
    }

    const signedTxn = note.data && note.data.signedTransactionInfo;
    if (!signedTxn) return res.json({ ok: true, ignored: 'no transaction in notification' });

    let txn;
    try {
      txn = await appleIap.verifyTransaction(signedTxn);
    } catch (err) {
      console.warn('[apple-notifications] transaction inside notification failed verification:', err.message);
      return res.status(400).json({ ok: false, message: 'Unverifiable transaction' });
    }

    try {
      const result = type === 'REFUND_REVERSED'
        ? await reverseRefund(txn.transactionId)
        : await refundPurchase(txn.transactionId);
      console.log(`[apple-notifications] ${type} txn ${txn.transactionId} (${note._environment}):`, JSON.stringify(result));
      return res.json({ ok: true, type, status: result.status });
    } catch (err) {
      // 500 on purpose: Apple retries, and both handlers are idempotent.
      console.error(`[apple-notifications] ${type} txn ${txn.transactionId} failed:`, err.message);
      return res.status(500).json({ ok: false });
    }
  });
};

module.exports.refundPurchase = refundPurchase;
module.exports.reverseRefund = reverseRefund;
