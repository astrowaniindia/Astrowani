/**
 * coins.js — atomic movement of the iOS-only coin balance.
 *
 * Coins exist because Apple requires In-App Purchase for digital content
 * consumed in the app (Guideline 3.1.1). They buy EXACTLY three things:
 * astro reports, gifts, and the "free services" charge. They must never pay for
 * a consultation or a remedy order — those are exempt from IAP (1:1 real-time
 * person-to-person, and physical goods respectively) and paying for them in
 * coins would hand Apple a cut of revenue it is not entitled to.
 *
 * This is the coin counterpart of wallet.js and deliberately mirrors its
 * contract: a signed `amount`, an `idempotencyKey` derived from the thing being
 * paid for, InsufficientCoins rather than a negative balance, and the same
 * PGRST203 overload guard.
 *
 * ONE DELIBERATE DIFFERENCE FROM wallet.js: there is NO legacy
 * read-modify-write fallback. wallet.js has one because it predates its atomic
 * functions and had a live non-atomic path to fall back to. Coins have no such
 * history, and a fallback here would mean inventing a non-atomic money path on
 * purpose. If the function is missing, every call throws:
 *
 *   * on a DEBIT that is correct and safe — the purchase fails and the customer
 *     keeps their coins.
 *   * on a CREDIT after a completed Apple purchase it is also correct, because
 *     the caller must NOT finish the StoreKit transaction when crediting fails.
 *     StoreKit re-delivers unfinished transactions on every app launch, so the
 *     credit is retried until it lands. Swallowing the error is the one outcome
 *     that would actually lose the customer's money.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST reports a missing function as PGRST202 (42883 from Postgres direct).
const FN_MISSING = new Set(['PGRST202', '42883']);
const isMissingFn = (err) =>
  !!err && (FN_MISSING.has(err.code) || /Could not find the function/i.test(err.message || ''));

// PostgREST reports an unresolvable OVERLOAD as PGRST203. Same failure mode that
// took vendor withdrawals offline — see wallet.js and
// sql/hardening_08_drop_duplicate_vendor_wallet_overload.sql.
const isAmbiguousFn = (err) =>
  !!err && (err.code === 'PGRST203' || /Could not choose the best candidate function/i.test(err.message || ''));

class CoinFunctionUnavailable extends Error {
  constructor(reason, err) {
    super(
      `adjust_customer_coins: ${reason} — NO COINS MOVED. ` +
      'Run sql/coin_schema.sql in the Supabase SQL editor; its self-verifying tail ' +
      'will confirm exactly one function overload exists. ' +
      `PostgREST said: ${err?.message || 'unknown'}`,
    );
    this.name = 'CoinFunctionUnavailable';
    this.code = 'COIN_FN_UNAVAILABLE';
  }
}

class InsufficientCoins extends Error {
  constructor(message = 'Not enough coins') {
    super(message);
    this.name = 'InsufficientCoins';
    this.code = 'INSUFFICIENT_COINS';
  }
}

function toError(err) {
  if (!err) return new Error('Unknown error');
  if (err instanceof Error) return err;
  const e = new Error(err.message || 'Database error');
  if (err.code) e.code = err.code;
  if (err.details) e.details = err.details;
  if (err.hint) e.hint = err.hint;
  return e;
}

const blob = (err) => `${err?.message || ''}${err?.details || ''}${err?.hint || ''}`;

const isInsufficient = (err) =>
  !!err && (
    /INSUFFICIENT_COINS/i.test(blob(err)) ||
    // The CHECK constraint, if the function were ever bypassed.
    /customers_coin_balance_non_negative/i.test(blob(err))
  );

const isNoSuchCustomer = (err) => !!err && /NO_SUCH_CUSTOMER/i.test(blob(err));

/**
 * Move coins on a customer balance. `amount` is signed: positive credits,
 * negative debits. There is no allowNegative option — coins are bought, never
 * borrowed, so a negative coin balance is always a bug.
 *
 * `idempotencyKey` makes a repeated call a no-op returning the current balance.
 * Derive it from the thing being paid for (a report request hash, a gift tap's
 * clientRequestId), NEVER from Date.now() or a random value — that defeats the
 * whole mechanism and has already caused a real double-charge in this codebase
 * (see the gift idempotency comment in index.js).
 *
 * @param {string}  customerId
 * @param {number}  amount              signed, whole coins
 * @param {object}  opts
 * @param {string} [opts.description]
 * @param {string} [opts.idempotencyKey]
 * @param {string} [opts.appleTransactionId]  set on credits from a purchase
 * @param {string} [opts.appleProductId]
 * @returns {Promise<number>} the new coin balance
 */
async function adjustCustomerCoins(customerId, amount, opts = {}) {
  const {
    description = null,
    idempotencyKey = null,
    appleTransactionId = null,
    appleProductId = null,
  } = opts;

  if (!Number.isInteger(amount)) {
    throw new Error(`adjustCustomerCoins: amount must be a whole number of coins, got ${amount}`);
  }

  const { data, error } = await db.rpc('adjust_customer_coins', {
    p_customer_id: customerId,
    p_amount: amount,
    p_description: description,
    p_idempotency_key: idempotencyKey,
    p_apple_transaction_id: appleTransactionId,
    p_apple_product_id: appleProductId,
  });

  if (error) {
    // Order matters: the specific, self-diagnosing failures first, so a schema
    // problem never surfaces as a generic 500 the way the withdrawal bug did.
    if (isAmbiguousFn(error)) {
      console.error('[coins] FATAL SCHEMA PROBLEM: adjust_customer_coins is ambiguous — coin writes are DOWN.');
      throw new CoinFunctionUnavailable('the database holds more than one version of this function', error);
    }
    if (isMissingFn(error)) {
      console.error('[coins] adjust_customer_coins is not installed — coin writes are DOWN.');
      throw new CoinFunctionUnavailable('the function is not installed', error);
    }
    if (isInsufficient(error)) throw new InsufficientCoins();
    if (isNoSuchCustomer(error)) throw new Error('NO_SUCH_CUSTOMER');
    throw toError(error);
  }

  return Number(data);
}

/**
 * Gift paid in coins: debit the customer's COINS, credit the astrologer's RUPEES.
 *
 * The asymmetry is deliberate and load-bearing — astrologers withdraw rupees and
 * have no coin balance, so paying them in coins would pay them in a currency they
 * cannot cash out. Both legs commit together inside one plpgsql function; see the
 * 4b section of sql/coin_schema.sql.
 *
 * @param {string} customerId
 * @param {string} astrologerId
 * @param {number} coinAmount    whole coins to take from the customer (positive)
 * @param {object} opts
 * @param {number} opts.vendorAmount  rupees to credit the astrologer (the split is
 *                                    computed by the caller, never in the database)
 * @returns {Promise<{coinBalance:number, vendorBalance:number}>}
 */
async function transferCoinsToVendor(customerId, astrologerId, coinAmount, opts = {}) {
  const { vendorAmount, description = null, sessionId = null, idempotencyKey = null } = opts;

  if (!Number.isInteger(coinAmount) || coinAmount <= 0) {
    throw new Error(`transferCoinsToVendor: coinAmount must be a positive whole number, got ${coinAmount}`);
  }
  if (!Number.isFinite(vendorAmount) || vendorAmount < 0) {
    throw new Error(`transferCoinsToVendor: vendorAmount must be a non-negative number, got ${vendorAmount}`);
  }

  const { data, error } = await db.rpc('transfer_coins_to_vendor', {
    p_customer_id: customerId,
    p_astrologer_id: astrologerId,
    p_coins: coinAmount,
    p_vendor_amount: vendorAmount,
    p_description: description,
    p_session_id: sessionId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (isAmbiguousFn(error)) {
      console.error('[coins] FATAL SCHEMA PROBLEM: transfer_coins_to_vendor is ambiguous — coin gifting is DOWN.');
      throw new CoinFunctionUnavailable('the database holds more than one version of this function', error);
    }
    if (isMissingFn(error)) {
      console.error('[coins] transfer_coins_to_vendor is not installed — coin gifting is DOWN.');
      throw new CoinFunctionUnavailable('the function is not installed', error);
    }
    if (isInsufficient(error)) throw new InsufficientCoins();
    throw toError(error);
  }

  // A TABLE-returning function comes back as an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    coinBalance: Number(row?.coin_balance ?? 0),
    vendorBalance: Number(row?.vendor_balance ?? 0),
  };
}

/**
 * Read a customer's coin balance. Returns 0 for a customer with no balance yet.
 * Throws if the column is missing, rather than reporting a false 0 — a false 0
 * reads to the customer as "my coins vanished".
 */
async function getCoinBalance(customerId) {
  const { data, error } = await db
    .from('customers')
    .select('coin_balance')
    .eq('id', customerId)
    .maybeSingle();

  if (error) throw toError(error);
  return Number(data?.coin_balance || 0);
}

/**
 * Balance read for a spend decision, which MUST NOT throw.
 *
 * The spend paths read the balance before their try/catch — and
 * POST /api/astro/:key has no outer try/catch at all, so a throw there becomes an
 * unhandled promise rejection under Express 4 rather than a response. This returns
 * a discriminated result instead, so "coins are not installed yet" is a decision
 * the caller makes explicitly rather than an exception nobody catches.
 *
 * It deliberately does NOT fall back to 0. A 0 would render as "Not enough coins"
 * and send the customer off to buy coins they already have.
 *
 * @returns {Promise<{ok: true, balance: number} | {ok: false, reason: string}>}
 */
async function readSpendableBalance(customerId) {
  try {
    return { ok: true, balance: await getCoinBalance(customerId) };
  } catch (err) {
    return { ok: false, reason: err?.message || 'coin balance unavailable' };
  }
}

/**
 * The purchasable coin packs, in display order. Prices are deliberately absent:
 * Apple owns them. The app pairs each product_id with the localised, tax-inclusive
 * price StoreKit reports at runtime.
 */
async function listCoinPacks() {
  const { data, error } = await db
    .from('coin_packs')
    .select('product_id, coins, badge, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw toError(error);
  return data || [];
}

module.exports = {
  adjustCustomerCoins,
  transferCoinsToVendor,
  getCoinBalance,
  readSpendableBalance,
  listCoinPacks,
  InsufficientCoins,
  CoinFunctionUnavailable,
};
