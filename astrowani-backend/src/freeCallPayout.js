// astrowani-backend/src/freeCallPayout.js
//
// What the platform owes an astrologer for a free introductory call. Pure — no I/O, no
// database — so scripts/freeCallInstantCheck.js can assert every boundary without
// touching production. sessionManager.payFreeCallAstrologer is the only caller.
//
// THIS IS MILESTONE-BASED, NOT PER-MINUTE, and that is the whole point.
//
// A free intro call attracts people who are never going to become customers: they answer,
// waste a few seconds, and hang up. Paying ₹1 for every minute that happened to elapse
// rewarded that, and produced awkward ₹2 and ₹3 ledger entries that meant nothing to
// anybody. The payout is ONE fixed step (owner, 2026-10-03):
//
//     crossed 4 minutes  -> ₹5, and that is the whole payout
//
// FLAT ABOVE THE MARK, on purpose. ₹5 at 4:00, ₹5 at 10:00, ₹5 on a call that runs the
// full 11 minutes — there is no second step and nothing accrues with length. So the
// astrologer is paid for HOLDING a conversation past the four-minute line, not for picking
// up and not for stretching it out. A call that ends at 3:59 pays nothing at all. The
// thresholds and the amounts are admin-configurable (free_call_offer.payoutMilestones), so
// the shape can change without a deploy — adding a second row there is all it would take
// to make it tiered again — but the shape is always "reach this mark, earn this amount".
//
// THIS APPLIES ONLY TO THE FREE INTRO CALL. Ordinary paid consultations are billed per
// minute by process_session_billing and are not affected by anything in this file.
//
// WHY IT IS SETTLED AT THE END OF THE CALL, not at the moment each mark is crossed:
// chat_sessions.is_free deliberately keeps free calls out of the billing poll, so there is
// no per-minute worker watching them, and adding one would put a write loop back on a path
// that exists to have none. Settling once from the final duration pays exactly the same
// money, stays idempotent on the session id, and still works when the call dies without a
// clean hangup (endOverdueFreeCalls closes it and the same arithmetic runs).

/** One step: ₹5 at four minutes. Mirrored in freeCallRoutes.DEFAULTS and clamped there too. */
const DEFAULT_MILESTONES = [
  { minutes: 4, amount: 5 },
];

const MAX_MILESTONES = 6;

/**
 * Clean an admin-entered milestone list into something safe to pay from: real numbers
 * only, sorted by minute, one entry per minute mark, and bounded in both count and value
 * so a typo in the settings form cannot drain admin_wallet.
 *
 * Falls back to DEFAULT_MILESTONES when nothing usable survives — paying the documented
 * amount is better than silently paying nobody.
 */
function normaliseMilestones(list) {
  if (!Array.isArray(list)) return DEFAULT_MILESTONES.map((m) => ({ ...m }));

  const seen = new Set();
  const clean = [];
  list.forEach((raw) => {
    const minutes = Number(raw?.minutes);
    const amount = Number(raw?.amount);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) return;
    const mark = Math.round(minutes);
    if (seen.has(mark)) return;
    seen.add(mark);
    clean.push({ minutes: mark, amount: Math.round(amount * 100) / 100 });
  });

  if (!clean.length) return DEFAULT_MILESTONES.map((m) => ({ ...m }));
  clean.sort((a, b) => a.minutes - b.minutes);
  return clean.slice(0, MAX_MILESTONES);
}

/**
 * @param {number} seconds       measured call length
 * @param {Array}  milestones    [{minutes, amount}], already normalised by the caller
 * @returns {{amount: number, reached: number[], label: string}}
 *          amount is 0 when no mark was reached; `label` is for the ledger note.
 */
function freeCallPayout(seconds, milestones) {
  const secs = Number(seconds);
  const steps = normaliseMilestones(milestones);
  if (!Number.isFinite(secs) || secs <= 0) return { amount: 0, reached: [], label: '' };

  // Crossing the mark means reaching it exactly: a call of exactly 240s HAS hit four
  // minutes. Comparing in seconds (not ceil'd minutes) is deliberate — rounding 3:31 up
  // to "4 minutes" would pay for a conversation that never got there.
  const reached = steps.filter((m) => secs >= m.minutes * 60);
  const amount = reached.reduce((sum, m) => sum + m.amount, 0);

  return {
    amount: Math.round(amount * 100) / 100,
    reached: reached.map((m) => m.minutes),
    label: reached.map((m) => `${m.minutes}m`).join(' + '),
  };
}

/** The most one call can ever pay, for display in the admin. */
function maxFreeCallPayout(milestones) {
  return normaliseMilestones(milestones).reduce((sum, m) => sum + m.amount, 0);
}

module.exports = {
  freeCallPayout,
  normaliseMilestones,
  maxFreeCallPayout,
  DEFAULT_MILESTONES,
  MAX_MILESTONES,
};
