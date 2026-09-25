// astrowani-backend/src/offerGuard.js
//
// Stops "delete the account, sign up again, claim the new-customer offer again".
//
// HOW IT WORKS
//   1. When an account is deleted (by the customer or an admin), snapshotCustomer() looks at
//      what that account actually used and records it against a keyed hash of the phone
//      number (offer_claims). Nothing readable about the person is kept -- no name, no number.
//   2. Every "new customer only" offer asks claimedByOther() before granting itself. A later
//      account on the same number is refused the offers the earlier one used.
//   3. Refusals are written to offer_blocks so the admin can see it happening.
//
// ADDING A NEW OFFER (this is the "proper section" for the future):
//   a. Add its key to OFFERS below.
//   b. In snapshotCustomer(), add one line deciding whether THIS customer used it (query the
//      truth, do not trust a flag).
//   c. Where the offer is granted, call claimedByOther(mobile, OFFERS.X, customerId) and, if
//      true, refuse and call logBlock(...).
//   No migration is needed -- offer_key is free text.
//
// FAIL-SAFE DIRECTIONS
//   - snapshotCustomer never throws: an account deletion must never be blocked (both stores
//     require deletion to work). A failed snapshot is logged loudly.
//   - claimedByOther has an explicit `failClosed` option. A free CALL is a real astrologer's
//     time, so it fails closed; the free CHAT is a bot, so it fails open.
//   - A missing table (unapplied migration) never blocks anyone.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { canonicalDigits } = require('./customerLookup');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const OFFERS = {
  WELCOME: 'welcome_session', // already had a real consultation -> not a "new customer"
  FREE_CALL: 'free_call',
  FREE_CHAT: 'free_chat',
};

const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));
let warnedMissing = false;
function warnMissing() {
  if (!warnedMissing) { warnedMissing = true; console.warn('[offerGuard] tables missing - run sql/offer_guard.sql'); }
}

/** Keyed hash of the canonical 10-digit number; null when there is no usable number. */
function hashPhone(mobile) {
  const digits = canonicalDigits(mobile);
  if (!digits) return null;
  const key = process.env.OFFER_GUARD_SECRET || process.env.JWT_SECRET || '';
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(`offer-guard:${digits}`).digest('hex');
}

const last4Of = (mobile) => {
  const d = canonicalDigits(mobile);
  return d ? d.slice(-4) : null;
};

/**
 * Did ANOTHER (earlier, now-deleted) account on this number already use `offerKey`?
 * @returns {Promise<boolean>}
 */
async function claimedByOther(mobile, offerKey, customerId, { failClosed = false } = {}) {
  try {
    const hash = hashPhone(mobile);
    if (!hash) return false;
    const { data, error } = await db.from('offer_claims')
      .select('claimed_by_customer_id').eq('phone_hash', hash).eq('offer_key', offerKey).limit(5);
    if (error) {
      if (isMissingTable(error)) { warnMissing(); return false; }
      return failClosed;
    }
    return (data || []).some((c) => !customerId || String(c.claimed_by_customer_id) !== String(customerId));
  } catch (_) {
    return failClosed;
  }
}

/** Record that an attempt was refused. Never throws. */
async function logBlock({ offerKey, customerId, mobile, reason }) {
  try {
    const { error } = await db.from('offer_blocks').insert([{
      offer_key: offerKey,
      customer_id: customerId || null,
      last4: last4Of(mobile),
      reason: reason || 'previous_account_used_offer',
    }]);
    if (error && !isMissingTable(error)) console.error('[offerGuard] logBlock failed:', error.message);
  } catch (_) { /* audit only */ }
}

async function addClaims(mobile, keys, customerId, source) {
  const hash = hashPhone(mobile);
  if (!hash || !keys.length) return 0;
  const rows = keys.map((offer_key) => ({
    phone_hash: hash, offer_key, last4: last4Of(mobile), source, claimed_by_customer_id: customerId || null,
  }));
  const { error } = await db.from('offer_claims').upsert(rows, { onConflict: 'phone_hash,offer_key', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/**
 * Called BEFORE an account is deleted. Reads what the account really used and records it.
 * Never throws; returns { recorded: [...offer keys] } for logging.
 */
async function snapshotCustomer(customerId) {
  try {
    const { data: cust, error } = await db.from('customers')
      .select('id, mobile, free_bot_chat_credited_at').eq('id', customerId).maybeSingle();
    if (error || !cust || !cust.mobile || String(cust.mobile).startsWith('deleted:')) return { recorded: [] };

    const used = [];

    // A real consultation of any kind: this person is no longer a "new customer".
    const { count: sessions } = await db.from('chat_sessions')
      .select('id', { count: 'exact', head: true }).eq('caller_id', customerId);
    if ((sessions || 0) > 0) used.push(OFFERS.WELCOME);

    // The free intro call: booked or completed counts. 'missed' (the astrologer never rang)
    // and 'cancelled' do not -- the customer did not get the call.
    const { data: bookings } = await db.from('free_call_bookings')
      .select('status').eq('customer_id', customerId).in('status', ['booked', 'completed']).limit(1);
    if (bookings && bookings.length) used.push(OFFERS.FREE_CALL);

    if (cust.free_bot_chat_credited_at) used.push(OFFERS.FREE_CHAT);

    await addClaims(cust.mobile, used, customerId, 'account_deleted');
    return { recorded: used };
  } catch (e) {
    if (isMissingTable(e)) { warnMissing(); return { recorded: [] }; }
    console.error(`[offerGuard] snapshot failed for ${customerId} -- offers may be re-claimable:`, e.message);
    return { recorded: [], error: e.message };
  }
}

/**
 * Called right after a NEW account is created. If an earlier account on this number
 * already used the welcome chat (or was a real customer), mark the free chat as used so
 * neither the popup nor the reply endpoint treats this account as new.
 */
async function stampFreeChatForReturningNumber(customerId, mobile) {
  try {
    const prior = (await claimedByOther(mobile, OFFERS.FREE_CHAT, customerId))
      || (await claimedByOther(mobile, OFFERS.WELCOME, customerId));
    if (!prior) return false;
    const { error } = await db.from('customers')
      .update({ free_bot_chat_credited_at: new Date().toISOString() }).eq('id', customerId);
    if (error) throw error;
    await logBlock({ offerKey: OFFERS.FREE_CHAT, customerId, mobile, reason: 're-registered_after_deletion' });
    return true;
  } catch (e) {
    console.error('[offerGuard] stampFreeChat failed:', e.message);
    return false;
  }
}

module.exports = { OFFERS, hashPhone, claimedByOther, logBlock, snapshotCustomer, stampFreeChatForReturningNumber };
