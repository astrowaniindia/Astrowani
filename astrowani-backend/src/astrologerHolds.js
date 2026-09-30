// astrowani-backend/src/astrologerHolds.js
//
// A HOLD reserves an astrologer for one specific customer for a short moment after a
// free introductory call ends, so that customer can buy more minutes with the person
// they were just talking to instead of being handed a stranger.
//
// THE RACE THIS EXISTS TO CLOSE (it is the whole reason for the module):
//   free call ends -> astrologer is idle -> another customer's free call rings them
//   -> meanwhile the first customer is inside Razorpay paying for 5 more minutes
//   -> they pay, and the person they paid to talk to is already on another call.
//
// TWO PHASES, and the difference between them is deliberate:
//
//   'decision'  The customer is reading the "5 / 10 / 15 more minutes" offer and has
//               committed nothing. Blocks new FREE calls only. A PAYING customer still
//               gets through, because real revenue now beats a maybe, and if the
//               astrologer is taken the held customer has lost nothing.
//
//               THIS PHASE IS ALSO A PROMISE ON SCREEN: the offer sheet counts down the
//               hold's real remaining seconds ("90s left to decide") and tells the
//               customer the astrologer is sitting there waiting. Shortening it, or
//               letting it expire without the sheet noticing, makes the app lie. The
//               customer closing the sheet deletes the hold immediately rather than
//               leaving the astrologer parked for a decision already made.
//
//   'payment'   They tapped an amount and the gateway is open. Blocks EVERYTHING except
//               the held customer themselves. Money is committed at this point, so the
//               astrologer is genuinely reserved.
//
// WHY THE PRIMARY KEY IS THE GUARANTEE: one live hold per astrologer is enforced by
// astrologer_holds' PRIMARY KEY on astrologer_id, not by a read-then-write. Two
// concurrent attempts resolve in the database. Do not "optimise" this into a select
// followed by an insert.
//
// FAIL-OPEN, DELIBERATELY. Every read here answers "no hold" on any error, matching
// busyStatus.js. Failing closed would mean a transient database blip marks astrologers
// as reserved and blocks real consultations across the platform — far worse than losing
// one upsell. The cost of failing open is stated plainly: during an outage the race
// above can happen again.
//
// NOTHING HERE THROWS. placeHold runs inside sessionManager.terminateSession, which must
// finish and end the call even if the reservation cannot be written.

const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));

let warnedMissing = false;
function warnMissing() {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('[holds] astrologer_holds is missing — run sql/free_call_instant.sql. '
    + 'The post-call upsell will work but reserves nobody until then.');
}

const PHASE_DECISION = 'decision';
const PHASE_PAYMENT = 'payment';

/**
 * Reserve `astrologerId` for `customerId`. Phase 'decision'.
 *
 * Overwrites an EXPIRED hold for anyone, and a live hold belonging to the same
 * customer (a re-entry after backgrounding the app). Never steals a live hold from a
 * different customer — that customer may be mid-payment.
 *
 * @returns {Promise<boolean>} whether a hold is now in place for this customer.
 */
async function placeHold(db, { astrologerId, customerId, sessionId = null, seconds = 90 }) {
  if (!astrologerId || !customerId) return false;
  const expiresAt = new Date(Date.now() + Math.max(5, Number(seconds) || 90) * 1000).toISOString();
  try {
    const { error } = await db.from('astrologer_holds').insert([{
      astrologer_id: astrologerId,
      customer_id: customerId,
      session_id: sessionId,
      phase: PHASE_DECISION,
      expires_at: expiresAt,
    }]);
    if (!error) return true;

    // 23505: somebody already holds this astrologer. Take it over only if that hold is
    // expired or already ours — the .or() below is what makes this safe to race.
    if (error.code === '23505') {
      const { data } = await db.from('astrologer_holds')
        .update({
          customer_id: customerId,
          session_id: sessionId,
          phase: PHASE_DECISION,
          minutes: null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        })
        .eq('astrologer_id', astrologerId)
        .or(`expires_at.lte.${new Date().toISOString()},customer_id.eq.${customerId}`)
        .select('astrologer_id');
      return !!(data && data.length);
    }
    if (isMissingTable(error)) { warnMissing(); return false; }
    console.error('[holds] placeHold failed:', error.message);
    return false;
  } catch (e) {
    if (isMissingTable(e)) { warnMissing(); return false; }
    console.error('[holds] placeHold threw:', e.message);
    return false;
  }
}

/**
 * Move this customer's own hold to 'payment' and extend it. Scoped to customer_id, so
 * one customer can never upgrade a hold that belongs to somebody else.
 *
 * @returns {Promise<boolean>} whether the hold is now in the payment phase.
 */
async function upgradeToPayment(db, { astrologerId, customerId, minutes = null, seconds = 180 }) {
  if (!astrologerId || !customerId) return false;
  const expiresAt = new Date(Date.now() + Math.max(30, Number(seconds) || 180) * 1000).toISOString();
  try {
    const { data, error } = await db.from('astrologer_holds')
      .update({ phase: PHASE_PAYMENT, minutes: minutes || null, expires_at: expiresAt })
      .eq('astrologer_id', astrologerId)
      .eq('customer_id', customerId)
      .gt('expires_at', new Date().toISOString())
      .select('astrologer_id');
    if (error) {
      if (isMissingTable(error)) { warnMissing(); return false; }
      console.error('[holds] upgradeToPayment failed:', error.message);
      return false;
    }
    return !!(data && data.length);
  } catch (e) {
    console.error('[holds] upgradeToPayment threw:', e.message);
    return false;
  }
}

/**
 * Release a hold. When `customerId` is given the delete is scoped to it, so a customer
 * pressing the dismiss button can only ever free their own reservation.
 */
/**
 * Put a payment hold back to the decision phase.
 *
 * WHY THIS EXISTS: a payment hold blocks EVERY customer, which is correct while money
 * is actually moving. But a customer who opens the gateway and presses back has not
 * paid and may never pay, and without this the astrologer stays blocked to the whole
 * marketplace until the 3-minute hold expires — idle, and losing paid work, for a
 * purchase that did not happen.
 *
 * Scoped to the customer who owns the hold, so one customer cannot downgrade another's
 * in-flight payment out from under them. Returns false (never throws) if there is
 * nothing of theirs to downgrade — the caller is an error path already.
 */
async function downgradeToDecision(db, { astrologerId, customerId, seconds = 45 }) {
  if (!astrologerId || !customerId) return false;
  const expiresAt = new Date(Date.now() + Math.max(15, Number(seconds) || 45) * 1000).toISOString();
  try {
    const { data, error } = await db.from('astrologer_holds')
      .update({ phase: PHASE_DECISION, minutes: null, expires_at: expiresAt })
      .eq('astrologer_id', astrologerId)
      .eq('customer_id', customerId)
      .eq('phase', PHASE_PAYMENT)
      .select('astrologer_id');
    if (error) {
      if (isMissingTable(error)) { warnMissing(); return false; }
      console.error('[holds] downgradeToDecision failed:', error.message);
      return false;
    }
    return !!(data && data.length);
  } catch (e) {
    console.error('[holds] downgradeToDecision threw:', e.message);
    return false;
  }
}

async function releaseHold(db, { astrologerId, customerId = null }) {
  if (!astrologerId) return false;
  try {
    let q = db.from('astrologer_holds').delete().eq('astrologer_id', astrologerId);
    if (customerId) q = q.eq('customer_id', customerId);
    const { error } = await q;
    if (error && !isMissingTable(error)) {
      console.error('[holds] releaseHold failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[holds] releaseHold threw:', e.message);
    return false;
  }
}

/** The live hold on this astrologer, or null. Never throws; null on any error. */
async function getHold(db, astrologerId) {
  if (!astrologerId) return null;
  try {
    const { data, error } = await db.from('astrologer_holds')
      .select('astrologer_id, customer_id, session_id, phase, minutes, expires_at, created_at')
      .eq('astrologer_id', astrologerId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) warnMissing();
      return null;
    }
    return data || null;
  } catch (_) {
    return null;
  }
}

/** The live hold this customer owns, or null — used to restore the upsell after the app was backgrounded. */
async function getHoldForCustomer(db, customerId) {
  if (!customerId) return null;
  try {
    const { data, error } = await db.from('astrologer_holds')
      .select('astrologer_id, customer_id, session_id, phase, minutes, expires_at, created_at')
      .eq('customer_id', customerId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) warnMissing();
      return null;
    }
    return data || null;
  } catch (_) {
    return null;
  }
}

/**
 * Every live hold, keyed by astrologer id. One query for a whole list screen rather
 * than one per row, matching buildBusyMap's shape.
 */
async function buildHoldMap(db) {
  const map = {};
  try {
    const { data, error } = await db.from('astrologer_holds')
      .select('astrologer_id, customer_id, phase, expires_at, created_at')
      .gt('expires_at', new Date().toISOString());
    if (error) {
      if (isMissingTable(error)) warnMissing();
      return map;
    }
    (data || []).forEach((h) => { map[h.astrologer_id] = h; });
  } catch (_) { /* fail open */ }
  return map;
}

/**
 * Does `hold` stop `customerId` from reaching this astrologer?
 *
 * The held customer is never blocked by their own hold — that is the entire point of
 * it. Beyond that: a payment-phase hold blocks everyone else, a decision-phase hold
 * blocks only another FREE call.
 */
function holdBlocks(hold, { customerId, isFreeCall }) {
  if (!hold) return false;
  if (new Date(hold.expires_at).getTime() <= Date.now()) return false;
  if (customerId && String(hold.customer_id) === String(customerId)) return false;
  if (hold.phase === PHASE_PAYMENT) return true;
  return !!isFreeCall;
}

/** Delete holds whose time is up. Runs on sessionManager's 30s tick. */
async function sweepExpired(db) {
  try {
    const { error } = await db.from('astrologer_holds')
      .delete()
      .lte('expires_at', new Date().toISOString());
    if (error && !isMissingTable(error)) {
      console.error('[holds] sweepExpired failed:', error.message);
    }
  } catch (_) { /* best effort */ }
}

module.exports = {
  PHASE_DECISION,
  PHASE_PAYMENT,
  downgradeToDecision,
  placeHold,
  upgradeToPayment,
  releaseHold,
  getHold,
  getHoldForCustomer,
  buildHoldMap,
  holdBlocks,
  sweepExpired,
};
