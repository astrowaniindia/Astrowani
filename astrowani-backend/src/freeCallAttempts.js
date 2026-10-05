/**
 * The free instant call attempt log — one row per RING, updated as that ring resolves.
 *
 * WHY IT IS A SEPARATE TABLE and not just `free_call_bookings`: that row is reused for
 * every astrologer a customer tries, and sessionManager deliberately NULLs its
 * call_session_id / call_ended_at / call_duration_seconds whenever a connection died
 * before it was a conversation, so the customer can retry. Correct product behaviour,
 * but it means the booking remembers nothing about the attempts that failed — which is
 * precisely what an owner needs to see. See sql/free_call_attempts.sql.
 *
 * EVERY FUNCTION HERE IS FIRE-AND-FORGET AND NEVER THROWS. This is analytics sitting in
 * the middle of a live call path: a failure to record must never fail a ring, a cancel,
 * or the end of a call. Callers do not await these (and must not start depending on
 * their return value for anything a customer can feel).
 *
 * It also self-disables if the migration has not been applied, so deploying the code
 * before the SQL cannot take free calls down. PostgREST reports a missing table as
 * PGRST205, not 42P01 — a branch checking only 42P01 would 500 instead of degrading.
 */
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TABLE = 'free_call_attempts';

/** Flips false the first time the table turns out not to exist, so we stop retrying. */
let tableAvailable = true;

function isMissingTable(err) {
  const s = `${err?.code || ''} ${err?.message || ''}`;
  return err?.code === 'PGRST205' || err?.code === '42P01' || new RegExp(TABLE).test(s);
}

/** Every write goes through here: one place that swallows, one place that disables. */
async function safely(label, fn) {
  if (!tableAvailable) return null;
  try {
    const { data, error } = await fn();
    if (error) {
      if (isMissingTable(error)) {
        tableAvailable = false;
        console.warn(`[freeCallAttempts] ${TABLE} is missing — run sql/free_call_attempts.sql. `
          + 'Free call analytics will record nothing until then; calls are unaffected.');
        return null;
      }
      console.error(`[freeCallAttempts] ${label} failed:`, error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.error(`[freeCallAttempts] ${label} threw:`, err.message);
    return null;
  }
}

/**
 * The astrologer's phone has just been told to ring. Written at ring time rather than on
 * answer, deliberately: an attempt nobody answered is the single most interesting row in
 * this table, and recording only answered calls would hide exactly the failure the owner
 * is trying to see.
 */
async function recordRing({
  bookingId, customerId, astrologerId, requestId, sessionId, attemptNo,
}) {
  return safely('recordRing', () => db.from(TABLE).insert([{
    booking_id: bookingId || null,
    customer_id: customerId || null,
    astrologer_id: astrologerId || null,
    request_id: requestId || null,
    session_id: sessionId || null,
    attempt_no: Number.isFinite(Number(attemptNo)) ? Number(attemptNo) : null,
    outcome: 'ringing',
  }]).select('id').single());
}

/**
 * The customer stopped this particular ring: 'cancelled' (picked somebody else) or
 * 'missed' (the ring timed out). Scoped to a still-'ringing' row so a call that was
 * answered a moment earlier is never rewritten as cancelled.
 */
async function closeRing(requestId, outcome) {
  if (!requestId) return null;
  const valid = ['cancelled', 'missed', 'rejected'].includes(outcome) ? outcome : 'cancelled';
  return safely('closeRing', () => db.from(TABLE)
    .update({
      outcome: valid,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // ring_seconds is computed from rang_at by the analytics query rather than here,
      // so one clock (the database's) decides every duration in this table.
    })
    .eq('request_id', requestId)
    .eq('outcome', 'ringing')
    .select('id'));
}

/**
 * The astrologer picked up. Matched on session_id, which the ring endpoint pre-generates
 * and both sides carry, so this works no matter which path accepted the call (in-app
 * card, heads-up notification, or the draw-over overlay).
 */
async function markAnswered(sessionId) {
  if (!sessionId) return null;
  const now = new Date().toISOString();
  return safely('markAnswered', () => db.from(TABLE)
    .update({ answered_at: now, updated_at: now })
    .eq('session_id', sessionId)
    .eq('outcome', 'ringing')
    .is('answered_at', null)
    .select('id'));
}

/**
 * The call is over. `outcome` mirrors sessionManager's own decision so this table and
 * the booking row can never tell different stories:
 *   completed                a real conversation
 *   too_short                under MIN_REAL_CALL_SECONDS — the booking was released
 *   abandoned_by_astrologer  they hung up before the 3-minute line
 */
async function markEnded({
  sessionId, outcome, endedBy, durationSeconds, payoutAmount,
}) {
  if (!sessionId) return null;
  const valid = ['completed', 'too_short', 'abandoned_by_astrologer'].includes(outcome)
    ? outcome : 'completed';
  const patch = {
    outcome: valid,
    ended_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (['customer', 'astrologer', 'system'].includes(endedBy)) patch.ended_by = endedBy;
  if (Number.isFinite(Number(durationSeconds))) {
    patch.duration_seconds = Math.max(0, Math.round(Number(durationSeconds)));
  }
  if (Number.isFinite(Number(payoutAmount))) patch.payout_amount = Number(payoutAmount);

  // NOT scoped to 'ringing': by now the row has usually been answered. It IS scoped to a
  // row that has not already been given a terminal outcome by closeRing, so a late
  // 'cancelled' and a real call cannot fight over the same row.
  return safely('markEnded', () => db.from(TABLE)
    .update(patch)
    .eq('session_id', sessionId)
    .in('outcome', ['ringing'])
    .select('id'));
}

/**
 * The payout is worked out after the call is finalised, so it lands as its own small
 * update rather than being folded into markEnded (which must run whether or not anybody
 * was paid).
 */
async function recordPayout(sessionId, amount) {
  if (!sessionId || !Number.isFinite(Number(amount))) return null;
  return safely('recordPayout', () => db.from(TABLE)
    .update({ payout_amount: Number(amount), updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .select('id'));
}

module.exports = {
  recordRing,
  closeRing,
  markAnswered,
  markEnded,
  recordPayout,
  // Exposed for the analytics routes, which should not query a table that is not there.
  isAvailable: () => tableAvailable,
  TABLE,
};
