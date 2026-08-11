// astrowani-backend/src/wallet.js
//
// Single choke point for every rupee that moves. Before this existed, each of
// the nine money paths in the codebase hand-rolled the same three steps —
// SELECT the balance, add to it in JavaScript, UPDATE it, then INSERT a ledger
// row as a separate statement. That pattern loses concurrent updates and can
// tear in half if the process dies mid-way; the 2026-08-07 audit found ₹5,865
// that no longer reconciles against the ledger because of it.
//
// Everything here delegates to the Postgres functions in
// sql/hardening_03_atomic_wallet.sql, which do the balance change and the ledger
// write in one transaction with the sufficiency check inside the UPDATE's WHERE
// clause, so it cannot be raced.
//
// DEPLOY ORDER DOES NOT MATTER. If those functions are not present yet, every
// call falls back to the old non-atomic path and logs a loud warning, so the API
// keeps working whether the SQL or this code lands first. Once the SQL is
// applied the fallback stops being reached. Check for the warning in the logs to
// confirm the migration actually took.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST reports "function does not exist" as PGRST202. Anything else is a
// real failure and must propagate — a wallet error should never be swallowed.
const FN_MISSING = new Set(['PGRST202', '42883']);
const isMissingFn = (err) =>
  !!err && (FN_MISSING.has(err.code) || /Could not find the function/i.test(err.message || ''));

let warnedOnce = false;
function warnFallback(fn) {
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      `[wallet] ${fn}: atomic wallet functions are not installed — falling back to the ` +
      'old read-modify-write path, which can lose concurrent updates. Run ' +
      'sql/hardening_03_atomic_wallet.sql in the Supabase SQL editor.',
    );
  }
}

class InsufficientFunds extends Error {
  constructor(message = 'Insufficient balance') {
    super(message);
    this.name = 'InsufficientFunds';
    this.code = 'INSUFFICIENT_FUNDS';
  }
}

const isInsufficient = (err) =>
  !!err && /INSUFFICIENT_FUNDS/.test(`${err.message || ''}${err.details || ''}${err.hint || ''}`);

/**
 * Move money on a customer wallet. `amount` is signed: positive credits,
 * negative debits. Throws InsufficientFunds rather than letting a balance go
 * negative, unless allowNegative is set (admin corrections may legitimately).
 *
 * `idempotencyKey` makes a repeated call a no-op that returns the current
 * balance — pass a key derived from the thing being paid for (a Razorpay
 * payment id, a session+minute, a withdrawal id), never a random value.
 *
 * @returns {Promise<number>} the new balance
 */
async function adjustCustomerWallet(customerId, amount, opts = {}) {
  const {
    description = null, sessionId = null, requestId = null,
    idempotencyKey = null, allowNegative = false,
  } = opts;

  const { data, error } = await db.rpc('adjust_customer_wallet', {
    p_customer_id: customerId,
    p_amount: amount,
    p_description: description,
    p_session_id: sessionId,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
    p_allow_negative: allowNegative,
  });

  if (!error) return Number(data);
  if (isInsufficient(error)) throw new InsufficientFunds();
  if (!isMissingFn(error)) throw error;

  warnFallback('adjustCustomerWallet');
  return legacyAdjust({
    table: 'customers', ledger: 'wallet_transactions', idColumn: 'id', ledgerIdColumn: 'user_id',
    id: customerId, amount, description, sessionId, requestId, allowNegative, idempotencyKey,
  });
}

/**
 * Same for an astrologer wallet. Earnings counters only ever move up:
 * a withdrawal reduces the balance but must not reduce today_earnings /
 * total_earnings, which are reporting figures with their own reset schedule.
 * Pass countEarnings:false for anything that is not real earned income.
 *
 * @returns {Promise<number>} the new balance
 */
async function adjustVendorWallet(astrologerId, amount, opts = {}) {
  const {
    description = null, sessionId = null, requestId = null,
    idempotencyKey = null, countEarnings = true, allowNegative = false,
  } = opts;

  const { data, error } = await db.rpc('adjust_vendor_wallet', {
    p_astrologer_id: astrologerId,
    p_amount: amount,
    p_description: description,
    p_session_id: sessionId,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
    p_count_earnings: countEarnings,
    p_allow_negative: allowNegative,
  });

  if (!error) return Number(data);
  if (isInsufficient(error)) throw new InsufficientFunds();
  if (!isMissingFn(error)) throw error;

  warnFallback('adjustVendorWallet');
  return legacyAdjust({
    table: 'astrologers', ledger: 'vendor_wallet_transactions', idColumn: 'id', ledgerIdColumn: 'vendor_id',
    id: astrologerId, amount, description, sessionId, requestId, allowNegative, idempotencyKey,
    earnings: countEarnings && amount > 0 ? amount : 0,
  });
}

/**
 * Debit a customer and credit an astrologer as one unit. Use this instead of two
 * separate calls whenever money moves between them — two calls leave a window
 * where the customer has paid and the astrologer has not been credited.
 *
 * `vendorAmount` defaults to the full amount; gifts pass 50% and the remainder
 * is platform revenue.
 *
 * @returns {Promise<{customerBalance:number, vendorBalance:number}>}
 */
async function transferCustomerToVendor(customerId, astrologerId, amount, opts = {}) {
  const {
    vendorAmount = null, description = null,
    sessionId = null, requestId = null, idempotencyKey = null,
  } = opts;

  const { data, error } = await db.rpc('transfer_customer_to_vendor', {
    p_customer_id: customerId,
    p_astrologer_id: astrologerId,
    p_amount: amount,
    p_vendor_amount: vendorAmount,
    p_description: description,
    p_session_id: sessionId,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      customerBalance: Number(row?.customer_balance),
      vendorBalance: Number(row?.vendor_balance),
    };
  }
  if (isInsufficient(error)) throw new InsufficientFunds();
  if (!isMissingFn(error)) throw error;

  warnFallback('transferCustomerToVendor');
  // Debit first so a failure here cannot credit an astrologer for free.
  const customerBalance = await adjustCustomerWallet(customerId, -amount, {
    description, sessionId, requestId,
  });
  const vendorBalance = await adjustVendorWallet(astrologerId, vendorAmount ?? amount, {
    description, sessionId, requestId,
  });
  return { customerBalance, vendorBalance };
}

/**
 * Credit (or, rarely, debit) the platform's revenue ledger. Used by astroRoutes.js
 * to record the platform's cut of a paid astro-report purchase atomically with
 * its own ledger row — previously a separate SELECT/UPDATE/INSERT that could
 * race under concurrent purchases (see sql/hardening_04_atomic_admin_wallet.sql).
 *
 * @returns {Promise<number>} the new admin_wallet balance
 */
async function adjustAdminWallet(amount, opts = {}) {
  const { description = null, serviceKey = null, customerId = null, idempotencyKey = null } = opts;

  const { data, error } = await db.rpc('adjust_admin_wallet', {
    p_amount: amount,
    p_description: description,
    p_service_key: serviceKey,
    p_customer_id: customerId,
    p_idempotency_key: idempotencyKey,
  });

  if (!error) return Number(data);
  if (!isMissingFn(error)) throw error;

  warnFallback('adjustAdminWallet');
  const { data: adminWallet } = await db.from('admin_wallet').select('id, balance').limit(1).single();
  const next = (Number(adminWallet?.balance) || 0) + amount;
  await db.from('admin_wallet').update({ balance: next, updated_at: new Date().toISOString() }).eq('id', adminWallet.id);
  await db.from('admin_wallet_transactions').insert([{
    type: amount > 0 ? 'credit' : 'debit', amount: Math.abs(amount),
    description, service_key: serviceKey, customer_id: customerId,
  }]);
  return next;
}

// ── Legacy path ─────────────────────────────────────────────────────────────
// Only reached when the SQL functions are not installed. Deliberately kept in
// one place instead of nine, so there is a single thing to delete once the
// migration is confirmed everywhere.
// PostgREST reports an unknown column as PGRST204.
const isMissingColumn = (err) =>
  !!err && (err.code === 'PGRST204' || /column .* does not exist/i.test(err.message || ''));

let warnedNoIdempotency = false;

async function legacyAdjust({
  table, ledger, idColumn, ledgerIdColumn, id, amount, description,
  sessionId, requestId, allowNegative, idempotencyKey = null, earnings = 0,
}) {
  const cols = ledger === 'vendor_wallet_transactions'
    ? 'wallet_balance, today_earnings, total_earnings'
    : 'wallet_balance';

  // Best-effort replay check. The idempotency_key column arrives with the same
  // migration as the RPCs, so on a fully un-migrated database this lookup fails
  // and we can only warn — never silently pretend the guarantee holds.
  let canDoIdempotency = idempotencyKey != null;
  if (idempotencyKey) {
    const { data: seen, error: lookupErr } = await db
      .from(ledger).select('id').eq('idempotency_key', idempotencyKey).limit(1);
    if (lookupErr) {
      if (!isMissingColumn(lookupErr)) throw lookupErr;
      canDoIdempotency = false;
      if (!warnedNoIdempotency) {
        warnedNoIdempotency = true;
        console.warn(
          `[wallet] idempotency was requested (key ${idempotencyKey}) but ${ledger}.idempotency_key ` +
          'does not exist, so a replayed call WILL apply twice. Run sql/hardening_03_atomic_wallet.sql.',
        );
      }
    } else if (seen && seen.length) {
      const { data: cur } = await db.from(table).select('wallet_balance').eq(idColumn, id).single();
      return Number(cur?.wallet_balance) || 0;
    }
  }

  const { data: row, error: readErr } = await db
    .from(table).select(cols).eq(idColumn, id).single();
  if (readErr) throw readErr;

  const current = Number(row?.wallet_balance) || 0;
  const next = current + amount;
  if (next < 0 && !allowNegative) throw new InsufficientFunds();

  const patch = { wallet_balance: next };
  if (earnings > 0) {
    patch.today_earnings = (Number(row?.today_earnings) || 0) + earnings;
    patch.total_earnings = (Number(row?.total_earnings) || 0) + earnings;
  }

  const { error: updErr } = await db.from(table).update(patch).eq(idColumn, id);
  if (updErr) throw updErr;

  const ledgerRow = {
    [ledgerIdColumn]: id,
    type: amount > 0 ? 'credit' : 'debit',
    amount: Math.abs(amount),
    description,
    session_id: sessionId,
    request_id: requestId,
  };
  if (canDoIdempotency) ledgerRow.idempotency_key = idempotencyKey;
  await db.from(ledger).insert([ledgerRow]);

  return next;
}

module.exports = {
  adjustCustomerWallet,
  adjustVendorWallet,
  transferCustomerToVendor,
  adjustAdminWallet,
  InsufficientFunds,
};
