// astrowani-backend/src/debtGuard.js
//
// Makes a negative wallet balance survive "delete the account, sign up again with the same
// number" — same shape as src/offerGuard.js (offer_claims), reusing its phone-hash helper.
//
// HOW IT WORKS
//   1. Before an account with wallet_balance < 0 is deleted, recordDebt() writes the owed
//      amount against a keyed hash of the phone number (wallet_debt_claims). No name, no
//      number, no readable PII — same as offer_claims.
//   2. The moment a NEW customers row is created on that number, applyCarriedDebt() sets its
//      wallet_balance to -debt and marks the claim applied, so the debt cannot be collected
//      twice and cannot be dodged by deleting again.
//
// FAIL-SAFE DIRECTIONS
//   - recordDebt never throws: an account deletion must never be blocked by this (Play/Apple
//     both require deletion to work, and CLAUDE.md's account-deletion section already treats
//     "must always succeed" as load-bearing for offerGuard — same posture here).
//   - applyCarriedDebt never throws either: a failed debt carry-forward must not break signup.
//   - A missing table (unapplied migration) never blocks anyone, same as offerGuard.
//
// NOT covered (same limits as offerGuard): a different phone number, and accounts deleted
// before this shipped (nothing was recorded for them).

const { createClient } = require('@supabase/supabase-js');
const { hashPhone } = require('./offerGuard');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));
let warnedMissing = false;
function warnMissing() {
  if (!warnedMissing) { warnedMissing = true; console.warn('[debtGuard] wallet_debt_claims missing - run sql/hardening_23_wallet_debt_persistence.sql'); }
}

const last4Of = (mobile) => {
  const digits = String(mobile || '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
};

/**
 * Called BEFORE an account is deleted, with the balance it is about to lose. A positive
 * balance is not debt — nothing to record. Upserts (not inserts): a customer who racks up
 * debt, deletes, comes back, racks up MORE debt and deletes again should have the two sums
 * added, not the first one silently discarded by a unique-key conflict.
 */
async function recordDebt(mobile, walletBalance, customerId, reason = 'account_deleted') {
  try {
    const balance = Number(walletBalance) || 0;
    if (balance >= 0) return { recorded: false };
    const hash = hashPhone(mobile);
    if (!hash) return { recorded: false };
    const owed = Math.round(Math.abs(balance) * 100) / 100;

    const { data: existing } = await db.from('wallet_debt_claims')
      .select('id, debt_amount, applied_to_customer_id').eq('phone_hash', hash).maybeSingle();

    if (existing && existing.applied_to_customer_id == null) {
      // Not yet collected on a new account — add to what is already owed.
      const { error } = await db.from('wallet_debt_claims')
        .update({ debt_amount: Number(existing.debt_amount || 0) + owed, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      // Either no prior claim, or the prior one was already applied and paid down (a second,
      // independent debt on the same number starts its own unapplied claim).
      const { error } = await db.from('wallet_debt_claims').upsert([{
        phone_hash: hash, debt_amount: owed, last4: last4Of(mobile),
        reason, recorded_from_customer_id: customerId || null,
        applied_to_customer_id: null, updated_at: new Date().toISOString(),
      }], { onConflict: 'phone_hash' });
      if (error) throw error;
    }
    console.warn(`[debtGuard] recorded Rs ${owed} owed by phone ending ${last4Of(mobile)} before account deletion`);
    return { recorded: true, amount: owed };
  } catch (e) {
    if (isMissingTable(e)) { warnMissing(); return { recorded: false }; }
    console.error(`[debtGuard] recordDebt failed for customer ${customerId} — debt may be lost:`, e.message);
    return { recorded: false, error: e.message };
  }
}

/**
 * Called right after a NEW customers row is created. If this number owes an unapplied debt,
 * set the new row's wallet_balance to -debt and mark the claim applied. Capped to the schema
 * floor (chk_customers_balance_floor, currently -2000) so a very old large debt cannot by
 * itself violate the constraint and break signup.
 */
async function applyCarriedDebt(customerId, mobile) {
  try {
    const hash = hashPhone(mobile);
    if (!hash) return { applied: false };
    const { data: claim } = await db.from('wallet_debt_claims')
      .select('id, debt_amount').eq('phone_hash', hash).is('applied_to_customer_id', null).maybeSingle();
    if (!claim || !(Number(claim.debt_amount) > 0)) return { applied: false };

    const debt = Math.min(Number(claim.debt_amount), 2000);
    const { error: updErr } = await db.from('customers')
      .update({ wallet_balance: -debt }).eq('id', customerId);
    if (updErr) throw updErr;

    const { error: claimErr } = await db.from('wallet_debt_claims')
      .update({ applied_to_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('id', claim.id);
    if (claimErr) throw claimErr;

    console.warn(`[debtGuard] carried Rs ${debt} debt forward onto new account ${customerId}`);
    return { applied: true, amount: debt };
  } catch (e) {
    if (isMissingTable(e)) { warnMissing(); return { applied: false }; }
    console.error(`[debtGuard] applyCarriedDebt failed for customer ${customerId} — debt not carried forward:`, e.message);
    return { applied: false, error: e.message };
  }
}

module.exports = { recordDebt, applyCarriedDebt };
