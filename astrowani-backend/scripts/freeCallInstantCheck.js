#!/usr/bin/env node
// Free INSTANT call: payout arithmetic and hold-blocking rules. No database, no network.
//
// WHY THIS IS WORTH KEEPING: two things in this feature are easy to regress and silent
// when they do.
//
//   1. The payout comes out of admin_wallet on every free call. Get the rounding or the
//      cap wrong and the platform quietly overpays on every single one — there is no
//      error, just a number that is too big. The 30-second floor must also stay equal to
//      closeFreeCallBooking's "did this call happen" threshold, or an astrologer is paid
//      for a call the system does not count as completed.
//
//   2. holdBlocks decides who may reach a reserved astrologer. If a 'payment' hold ever
//      stops blocking, a free call can ring somebody while a customer is inside Razorpay
//      paying to talk to them — the exact race the hold exists to prevent, and one that
//      only shows up under concurrency.
//
//   node --env-file=.env scripts/freeCallInstantCheck.js
global.WebSocket = require('ws');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);

const {
  freeCallPayout, normaliseMilestones, maxFreeCallPayout, DEFAULT_MILESTONES, MAX_MILESTONES,
} = require('../src/freeCallPayout');
const { holdBlocks, PHASE_DECISION, PHASE_PAYMENT } = require('../src/astrologerHolds');

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

/* ── 1. Payout arithmetic — MILESTONES, not per-minute ─────────────────────── */
const M = DEFAULT_MILESTONES;                          // 3 min -> ₹5, 9 min -> ₹5 more
const pay = (s, steps = M) => freeCallPayout(s, steps).amount;

ok(pay(0) === 0, 'a call of 0s pays nothing');
ok(pay(30) === 0, '30s pays nothing — picking up is not the work, got ' + pay(30));
ok(pay(179) === 0, '2:59 misses the first mark entirely, got ' + pay(179));
ok(pay(180) === 5, 'exactly 3:00 reaches the first mark and pays 5, got ' + pay(180));
ok(pay(181) === 5, '3:01 still pays 5 — nothing accrues between marks');
ok(pay(300) === 5, '5 minutes still pays only the first mark, got ' + pay(300));
ok(pay(539) === 5, '8:59 misses the second mark, got ' + pay(539));
ok(pay(540) === 10, 'exactly 9:00 reaches the second mark and pays 10, got ' + pay(540));
ok(pay(720) === 10, 'a full 12-minute call pays 10, got ' + pay(720));
ok(pay(7200) === 10, 'an absurd 2-hour value still pays only 10, got ' + pay(7200));

// The ledger note has to name what was actually reached, or an astrologer querying a
// ₹5 credit has no way to see which mark it was for.
ok(freeCallPayout(540, M).label === '3m + 9m', 'the label lists every mark reached, got ' + freeCallPayout(540, M).label);
ok(freeCallPayout(180, M).label === '3m', 'a single mark labels itself, got ' + freeCallPayout(180, M).label);
ok(freeCallPayout(60, M).label === '', 'an unpaid call has no label');
ok(freeCallPayout(540, M).reached.join(',') === '3,9', 'reached marks are reported for the log');
ok(maxFreeCallPayout(M) === 10, 'the advertised maximum is 10, got ' + maxFreeCallPayout(M));

// Nonsense must pay nothing rather than NaN — a NaN would reach adjustVendorWallet.
ok(pay(null) === 0, 'null seconds pays nothing');
ok(pay(undefined) === 0, 'undefined seconds pays nothing');
ok(pay(NaN) === 0, 'NaN seconds pays nothing');
ok(pay('abc') === 0, 'a non-numeric duration pays nothing');
ok(pay(-500) === 0, 'a negative duration pays nothing');
ok(Number.isFinite(pay(720)), 'the result is always a finite number');

// A custom ladder from the admin.
const custom = [{ minutes: 2, amount: 3 }, { minutes: 5, amount: 4 }, { minutes: 10, amount: 8 }];
ok(pay(119, custom) === 0, 'custom ladder: 1:59 pays nothing');
ok(pay(120, custom) === 3, 'custom ladder: 2:00 pays 3');
ok(pay(300, custom) === 7, 'custom ladder: 5:00 pays 3+4, got ' + pay(300, custom));
ok(pay(600, custom) === 15, 'custom ladder: 10:00 pays all three, got ' + pay(600, custom));

/* ── 1b. Milestone normalising — the settings form is admin free text ──────── */
const norm = normaliseMilestones;
ok(norm(undefined).length === 2, 'a missing list falls back to the two defaults');
ok(norm([]).length === 2, 'an empty list falls back rather than paying nobody');
ok(norm('nonsense').length === 2, 'a non-array falls back');
ok(norm([{ minutes: 9, amount: 5 }, { minutes: 3, amount: 5 }])[0].minutes === 3,
  'marks are sorted, so an out-of-order entry still pays cumulatively');
ok(norm([{ minutes: 3, amount: 5 }, { minutes: 3, amount: 99 }]).length === 1,
  'a duplicated mark is collapsed — it must never pay twice at the same second');
ok(norm([{ minutes: 0, amount: 5 }, { minutes: 3, amount: 5 }]).length === 1,
  'a zero-minute mark is dropped (it would pay the instant a call connects)');
ok(norm([{ minutes: 3, amount: 0 }]).length === 2, 'a zero amount is not a milestone, so it falls back');
ok(norm([{ minutes: 3, amount: 99999 }])[0].amount === 5,
  'an absurd amount is refused and the defaults stand, protecting admin_wallet');
ok(norm([{ minutes: 99999, amount: 5 }]).length === 2, 'an absurd minute mark is refused');
ok(norm(Array.from({ length: 20 }, (_, i) => ({ minutes: i + 1, amount: 1 }))).length === MAX_MILESTONES,
  `the ladder is capped at ${MAX_MILESTONES} rungs`);
ok(norm([{ minutes: '3', amount: '5' }])[0].amount === 5, 'numeric strings from a form input are accepted');

/* ── 2. Hold blocking ──────────────────────────────────────────────────────── */
const now = Date.now();
const hold = (phase, cust, offsetMs = 60_000) => ({
  phase, customer_id: cust, expires_at: new Date(now + offsetMs).toISOString(),
});
const A = 'customer-A';
const B = 'customer-B';

ok(holdBlocks(null, { customerId: A, isFreeCall: true }) === false,
  'no hold blocks nobody');
ok(holdBlocks(hold(PHASE_PAYMENT, B, -1000), { customerId: A, isFreeCall: false }) === false,
  'an EXPIRED payment hold blocks nobody');

// The whole point: the held customer is never blocked by their own reservation.
ok(holdBlocks(hold(PHASE_PAYMENT, A), { customerId: A, isFreeCall: false }) === false,
  'the held customer passes their own payment hold (this is the continuation call)');
ok(holdBlocks(hold(PHASE_DECISION, A), { customerId: A, isFreeCall: true }) === false,
  'the held customer passes their own decision hold');

// Payment phase: money is committed, so nobody else gets through.
ok(holdBlocks(hold(PHASE_PAYMENT, B), { customerId: A, isFreeCall: false }) === true,
  'a payment hold blocks another customer\'s PAID call');
ok(holdBlocks(hold(PHASE_PAYMENT, B), { customerId: A, isFreeCall: true }) === true,
  'a payment hold blocks another customer\'s FREE call');

// Decision phase: nothing is committed yet, so real revenue wins.
ok(holdBlocks(hold(PHASE_DECISION, B), { customerId: A, isFreeCall: true }) === true,
  'a decision hold blocks another FREE call');
ok(holdBlocks(hold(PHASE_DECISION, B), { customerId: A, isFreeCall: false }) === false,
  'a decision hold ALLOWS a paying customer through (deliberate: revenue beats a maybe)');

// The defaults every pre-existing caller of checkAstrologerBusy relies on.
ok(holdBlocks(hold(PHASE_DECISION, B), {}) === false,
  'default opts behave as a paid call: a decision hold does not block');
ok(holdBlocks(hold(PHASE_PAYMENT, B), {}) === true,
  'default opts behave as a paid call: a payment hold does block');

/* ── 3. Continuation pricing ───────────────────────────────────────────────── */
// The app renders what the server sends; this is that calculation.
const price = (rate, minutes) => Math.round(rate * minutes);
ok(price(15, 5) === 75, '5 min at 15/min = 75');
ok(price(15, 10) === 150, '10 min at 15/min = 150');
ok(price(15, 15) === 225, '15 min at 15/min = 225');
ok(price(12.5, 5) === 63, 'a fractional rate is rounded to whole rupees, got ' + price(12.5, 5));
ok(price(0, 5) === 0, 'a zero rate prices at zero — the endpoint refuses to offer this');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
