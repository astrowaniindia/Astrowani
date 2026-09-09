/**
 * coinRoutes.js — the coin catalogue, balance, and Apple purchase verification.
 *
 * Coins are the iOS-only currency that satisfies App Store Guideline 3.1.1 for
 * the three digital-content paths (astro reports, gifts, free services). See
 * sql/coin_schema.sql for why they are a separate currency rather than a way of
 * topping up the rupee wallet.
 *
 * Registered from index.js alongside the other route modules.
 */

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');
const coins = require('./coins');
const appleIap = require('./appleIap');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Identify the caller from their JWT. Same shape as astroRoutes.resolveCustomer,
 * including the id-fallback guard that stops a soft-removed account resolving
 * from a token issued before deletion.
 *
 * There is deliberately NO customer id in any request body or path in this file:
 * the balance being credited is always the JWT's own.
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
    customer = await findCustomerByPhone(db, decoded.phone, 'id, coin_balance');
  }
  if (!customer && userId) {
    customer = await findCustomerById(db, userId, 'id, coin_balance');
  }
  return customer;
}

// The coin_balance column arrives with sql/coin_schema.sql. Until that runs, a
// select naming it errors. Rather than 500ing, every route reports "coins are not
// available yet" — the same deploy-order-does-not-matter posture as src/wallet.js
// and remedy commission. Ship the backend first or the SQL first; either works.
const isMissingCoinColumn = (err) =>
  !!err && /coin_balance|coin_transactions|coin_packs/i.test(`${err.message || ''}${err.details || ''}`)
       && /does not exist|schema cache|could not find/i.test(`${err.message || ''}${err.details || ''}`);

function coinsUnavailable(res, err) {
  console.warn('[coins] schema not installed yet —', err?.message || err);
  return res.status(503).json({
    success: false,
    code: 'COINS_UNAVAILABLE',
    message: 'Coins are not available yet. Run sql/coin_schema.sql.',
  });
}

module.exports = function registerCoinRoutes(app) {
  /**
   * The purchasable packs. Unauthenticated: it is a catalogue, and the app needs
   * it to ask StoreKit for prices before the customer has done anything.
   *
   * Returns NO prices — Apple owns those. The app pairs each product_id with the
   * localised, tax-inclusive price StoreKit reports on the device. Sending a
   * price from here would show a number the customer will not actually be charged.
   */
  app.get('/api/coins/packs', async (req, res) => {
    try {
      const packs = await coins.listCoinPacks();
      return res.json({
        success: true,
        packs: packs.map((p) => ({
          productId: p.product_id,
          coins: p.coins,
          badge: p.badge || null,
        })),
      });
    } catch (err) {
      if (isMissingCoinColumn(err)) return coinsUnavailable(res, err);
      console.error('GET /api/coins/packs failed:', err);
      return res.status(500).json({ success: false, message: 'Could not load coin packs' });
    }
  });

  /** The caller's own coin balance. */
  app.get('/api/coins/balance', async (req, res) => {
    try {
      const customer = await resolveCustomer(req);
      if (!customer) return res.status(401).json({ success: false, message: 'Not authenticated' });
      return res.json({ success: true, coins: Number(customer.coin_balance || 0) });
    } catch (err) {
      if (isMissingCoinColumn(err)) return coinsUnavailable(res, err);
      console.error('GET /api/coins/balance failed:', err);
      return res.status(500).json({ success: false, message: 'Could not load balance' });
    }
  });

  /**
   * Credit coins for a completed Apple purchase.
   *
   * The app posts the JWS StoreKit gave it. This route proves it came from Apple,
   * for this app, for a product we sell, and has not been revoked — then credits
   * exactly once.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ REPLAY IS NORMAL AND MUST RETURN 200.                                  │
   * │ StoreKit re-delivers any transaction the app has not "finished", so the │
   * │ same purchase legitimately arrives here more than once — after a crash, │
   * │ a lost response, or simply the next app launch. The unique index on     │
   * │ coin_transactions.apple_transaction_id makes the second credit a no-op; │
   * │ answering it with an ERROR would make the app refuse to finish the      │
   * │ transaction, so StoreKit would deliver it again, forever. Same rule as  │
   * │ POST /api/orders/verify-payment.                                        │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  app.post('/api/coins/verify-purchase', async (req, res) => {
    try {
      const customer = await resolveCustomer(req);
      if (!customer) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const { signedTransaction } = req.body || {};
      if (!signedTransaction) {
        return res.status(400).json({ success: false, message: 'signedTransaction is required' });
      }

      // 1. Prove it came from Apple. Throws rather than returning a falsy value,
      //    so there is no path where an unverified transaction reaches the credit.
      let txn;
      try {
        txn = await appleIap.verifyTransaction(signedTransaction);
      } catch (err) {
        if (err.code === 'APPLE_IAP_NOT_CONFIGURED') {
          // 503, not 400: the customer did nothing wrong and their purchase is
          // still valid. The app must NOT finish the transaction on a 503, so
          // StoreKit will redeliver it once this is configured and nobody loses
          // coins they paid for.
          console.error('[coins] purchase could not be verified —', err.message);
          return res.status(503).json({
            success: false,
            code: 'APPLE_IAP_NOT_CONFIGURED',
            retryable: true,
            message: 'Purchases cannot be processed right now. You have not lost anything — this will complete automatically.',
          });
        }
        console.warn('[coins] rejected a transaction:', err.message);
        return res.status(400).json({
          success: false,
          code: 'VERIFICATION_FAILED',
          message: 'This purchase could not be verified.',
        });
      }

      // 2. Only products we actually sell, and only unrevoked ones.
      let packs;
      try {
        packs = await coins.listCoinPacks();
      } catch (err) {
        if (isMissingCoinColumn(err)) return coinsUnavailable(res, err);
        throw err;
      }
      const byProduct = new Map(packs.map((p) => [p.product_id, p]));
      const refusal = appleIap.reasonToRefuse(txn, new Set(byProduct.keys()));
      if (refusal) {
        console.warn(`[coins] refusing transaction ${txn.transactionId}: ${refusal}`);
        return res.status(400).json({
          success: false,
          code: 'TRANSACTION_REFUSED',
          message: 'This purchase could not be applied.',
        });
      }

      const pack = byProduct.get(txn.productId);

      // A consumable can legitimately be bought in quantity in one transaction.
      // Defaulting to 1 (rather than 0) means a payload without the field still
      // credits the customer something rather than nothing.
      const quantity = Number(txn.quantity) > 0 ? Number(txn.quantity) : 1;
      const amount = pack.coins * quantity;

      // 3. Credit, exactly once. The transaction id IS the idempotency key —
      //    it is Apple's own unique identifier for this purchase, so it dedupes
      //    across retries, app reinstalls and device changes alike.
      let newBalance;
      try {
        newBalance = await coins.adjustCustomerCoins(customer.id, amount, {
          description: `Coin purchase: ${pack.coins} coins${quantity > 1 ? ` x${quantity}` : ''}`,
          idempotencyKey: `apple:${txn.transactionId}`,
          appleTransactionId: String(txn.transactionId),
          appleProductId: txn.productId,
        });
      } catch (err) {
        if (err.code === 'COIN_FN_UNAVAILABLE') return coinsUnavailable(res, err);
        if (isMissingCoinColumn(err)) return coinsUnavailable(res, err);
        throw err;
      }

      console.log(
        `[coins] credited ${amount} to ${customer.id} for ${txn.productId} ` +
        `(txn ${txn.transactionId}, ${txn._environment})`,
      );

      // The app finishes the StoreKit transaction on this 200 — including when it
      // was a replay, which is the point.
      return res.json({
        success: true,
        coins: newBalance,
        credited: amount,
        environment: txn._environment,
      });
    } catch (err) {
      console.error('POST /api/coins/verify-purchase failed:', err);
      // 500 is retryable by design: the app should not finish the transaction,
      // so StoreKit redelivers and the customer is eventually credited.
      return res.status(500).json({
        success: false,
        retryable: true,
        message: 'Could not complete this purchase. It will be retried automatically.',
      });
    }
  });
};
