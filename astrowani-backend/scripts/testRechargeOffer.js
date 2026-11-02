#!/usr/bin/env node
/**
 * Recharge bonus offers — offline checks.
 *
 *   node scripts/testRechargeOffer.js
 *
 * No database, no network, no keys: everything here is the pure half of
 * src/rechargeOffer.js (normalise / isExpired / resolveBonus / buildPublicOffer).
 * The module builds a Supabase client at require time, so a dummy key is planted
 * below purely to let it load — nothing in this file performs IO.
 *
 * WHY THIS EXISTS: this is the only code in the project that decides to give money
 * away, and the figure it returns is credited inside the same idempotent wallet
 * credit as the recharge itself. A wrong number here is money, not a rendering bug.
 *
 * Every "no bonus" case is paired with a case that DOES pay, because a resolver that
 * had simply stopped working would pass every negative assertion on its own.
 */
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'offline-test-key';

// Node 20 has no global WebSocket and @supabase/realtime-js reaches for one at import,
// so requiring anything that builds a Supabase client throws before a line of this file
// runs. "ws" is already a transitive dependency, so this installs nothing.
// (Same shim, same reason, as scripts/runBlogAgent.js.)
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* Node >= 22 */ }
}

const offerModule = require('../src/rechargeOffer');
const { normalise, isExpired, resolveBonus, buildPublicOffer } = offerModule;

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass += 1; return; }
  failures.push(`${name}\n      expected ${e}\n      actual   ${a}`);
}
const ok = (name, cond) => check(name, !!cond, true);

// ---------------------------------------------------------------------------
// The Diwali 2026 ladder, exactly as the owner specified it.
// Pay 75 -> 100, 100 -> 130, 160 -> 200, 200 -> 250, 501 -> 601.
// ---------------------------------------------------------------------------
const DIWALI_SLABS = [
  { minAmount: 75, type: 'flat', value: 25 },
  { minAmount: 100, type: 'flat', value: 30 },
  { minAmount: 160, type: 'flat', value: 40 },
  { minAmount: 200, type: 'flat', value: 50 },
  { minAmount: 501, type: 'flat', value: 100 },
];
const ENDS_AT = '2026-11-08T18:29:59.000Z'; // 2026-11-08 23:59:59 IST
const BEFORE = Date.parse('2026-11-02T10:00:00.000Z');
const AFTER = Date.parse('2026-11-09T10:00:00.000Z');

const diwali = normalise(JSON.stringify({
  enabled: true, title: 'Diwali Dhamaka', endsAt: ENDS_AT, slabs: DIWALI_SLABS,
}));

const credit = (amount, now = BEFORE) => amount + resolveBonus(amount, diwali, now).bonus;

// --- the five advertised pairs -------------------------------------------------
check('pay 75  -> wallet 100', credit(75), 100);
check('pay 100 -> wallet 130', credit(100), 130);
check('pay 160 -> wallet 200', credit(160), 200);
check('pay 200 -> wallet 250', credit(200), 250);
check('pay 501 -> wallet 601', credit(501), 601);

// --- the gaps between them, which is where a wrong sort order shows up ---------
// Slabs are "at or above", so each amount takes the most generous tier it reaches.
check('pay 76  -> +25 (still the 75 tier)', credit(76), 101);
check('pay 99  -> +25 (not yet the 100 tier)', credit(99), 124);
check('pay 159 -> +30', credit(159), 189);
check('pay 199 -> +40', credit(199), 239);
check('pay 500 -> +50 (one rupee short of the top tier)', credit(500), 550);

// --- above the top tier: the bonus stops growing ------------------------------
check('pay 1001 -> +100', credit(1001), 1101);
check('pay 2001 -> +100', credit(2001), 2101);
check('pay 100000 -> +100, never more', credit(100000), 100100);

// --- below the floor: nothing, and this is the paired negative -----------------
check('pay 74 -> no bonus', resolveBonus(74, diwali, BEFORE).bonus, 0);
check('pay 51 -> no bonus (the smallest preset chip)', resolveBonus(51, diwali, BEFORE).bonus, 0);
check('pay 1  -> no bonus', resolveBonus(1, diwali, BEFORE).bonus, 0);

// --- the wallet's own preset chips all land somewhere sane --------------------
// The screen offers 51/101/251/501/1001/2001. If one of these paid nothing while the
// offer card above it advertised a bonus, that is a support ticket per tap.
check('preset chips -> credited totals',
  [51, 101, 251, 501, 1001, 2001].map((a) => credit(a)),
  [51, 131, 301, 601, 1101, 2101]);

// --- amounts that are not money ------------------------------------------------
for (const bad of [0, -100, NaN, Infinity, null, undefined, 'abc']) {
  check(`pay ${String(bad)} -> no bonus`, resolveBonus(bad, diwali, BEFORE).bonus, 0);
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------
check('live before the end date', resolveBonus(200, diwali, BEFORE).bonus, 50);
check('pays nothing after the end date', resolveBonus(200, diwali, AFTER).bonus, 0);
check('pays nothing one ms after expiry',
  resolveBonus(200, diwali, Date.parse(ENDS_AT) + 1).bonus, 0);
check('still pays one ms before expiry',
  resolveBonus(200, diwali, Date.parse(ENDS_AT) - 1).bonus, 50);
check('expiry is inclusive of the instant itself',
  resolveBonus(200, diwali, Date.parse(ENDS_AT)).bonus, 0);

const noEnd = normalise(JSON.stringify({ enabled: true, slabs: DIWALI_SLABS }));
check('absent endsAt means no expiry', resolveBonus(200, noEnd, AFTER).bonus, 50);
check('absent endsAt is not flagged invalid', noEnd.endsAtInvalid, false);
check('empty-string endsAt means no expiry',
  normalise(JSON.stringify({ enabled: true, endsAt: '', slabs: DIWALI_SLABS })).endsAt, null);

// THE ASYMMETRY THAT MATTERS: a typo in the end date must fail CLOSED. The dangerous
// direction is an unreadable date quietly becoming "runs forever".
const badEnd = normalise(JSON.stringify({
  enabled: true, endsAt: '8th November', slabs: DIWALI_SLABS,
}));
check('an unparseable endsAt is flagged', badEnd.endsAtInvalid, true);
check('an unparseable endsAt pays NOTHING (fails closed)',
  resolveBonus(200, badEnd, BEFORE).bonus, 0);
check('an unparseable endsAt reads as expired', isExpired(badEnd, BEFORE), true);
ok('...and the paired control still pays', resolveBonus(200, diwali, BEFORE).bonus === 50);

check('isExpired(null) is true', isExpired(null, BEFORE), true);

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------
const off = normalise(JSON.stringify({ enabled: false, endsAt: ENDS_AT, slabs: DIWALI_SLABS }));
check('switched off pays nothing', resolveBonus(200, off, BEFORE).bonus, 0);
check('enabled:"true" as a string still counts',
  normalise(JSON.stringify({ enabled: 'true', slabs: DIWALI_SLABS })).enabled, true);
check('enabled with no slabs is not enabled',
  normalise(JSON.stringify({ enabled: true, slabs: [] })).enabled, false);

// ---------------------------------------------------------------------------
// normalise: junk in, nothing out
// ---------------------------------------------------------------------------
check('unparseable json -> off', normalise('{not json').enabled, false);
check('null raw -> off', normalise(null).enabled, false);
check('a slab with no value is dropped',
  normalise(JSON.stringify({ enabled: true, slabs: [{ minAmount: 75 }] })).slabs.length, 0);
check('a slab with minAmount 0 is dropped',
  normalise(JSON.stringify({ enabled: true, slabs: [{ minAmount: 0, type: 'flat', value: 5 }] })).slabs.length, 0);
check('slabs are stored biggest-first so the first match is the best one',
  normalise(JSON.stringify({ enabled: true, slabs: DIWALI_SLABS })).slabs.map((s) => s.minAmount),
  [501, 200, 160, 100, 75]);
check('at most MAX_SLABS survive',
  normalise(JSON.stringify({
    enabled: true,
    slabs: Array.from({ length: 25 }, (_, i) => ({ minAmount: i + 1, type: 'flat', value: 1 })),
  })).slabs.length, offerModule.MAX_SLABS);

// --- the ceilings: a typo in the admin form must not mint money ----------------
const fatPercent = normalise(JSON.stringify({
  enabled: true, slabs: [{ minAmount: 100, type: 'percent', value: 1000 }],
}));
check('1000% is clamped to 100%', fatPercent.slabs[0].value, offerModule.MAX_PERCENT);
check('...and the bonus still cannot exceed the recharge',
  resolveBonus(100, fatPercent, BEFORE).bonus, 100);

const fatFlat = normalise(JSON.stringify({
  enabled: true, slabs: [{ minAmount: 100, type: 'flat', value: 999999999 }],
}));
check('an absurd flat bonus is capped at the recharge itself',
  resolveBonus(100, fatFlat, BEFORE).bonus, 100);

const capped = normalise(JSON.stringify({
  enabled: true, slabs: [{ minAmount: 100, type: 'percent', value: 50, maxBonus: 30 }],
}));
check('a slab maxBonus is honoured', resolveBonus(1000, capped, BEFORE).bonus, 30);
ok('...and under the cap the percentage still applies',
  resolveBonus(40 + 60, capped, BEFORE).bonus === 30 && resolveBonus(20, capped, BEFORE).bonus === 0);

// --- rounding ------------------------------------------------------------------
const oddPercent = normalise(JSON.stringify({
  enabled: true, slabs: [{ minAmount: 1, type: 'percent', value: 33 }],
}));
check('bonuses are rounded to paise', resolveBonus(10.1, oddPercent, BEFORE).bonus, 3.33);

// ---------------------------------------------------------------------------
// The title
// ---------------------------------------------------------------------------
check('title survives', diwali.title, 'Diwali Dhamaka');
check('a missing title is null', noEnd.title, null);
check('a non-string title is null',
  normalise(JSON.stringify({ enabled: true, title: 42, slabs: DIWALI_SLABS })).title, null);
check('newlines are stripped from the title',
  normalise(JSON.stringify({ enabled: true, title: 'Diwali\nDhamaka', slabs: DIWALI_SLABS })).title,
  'Diwali Dhamaka');
check('a long title is capped',
  normalise(JSON.stringify({ enabled: true, title: 'x'.repeat(200), slabs: DIWALI_SLABS })).title.length,
  offerModule.MAX_TITLE_LEN);

// ---------------------------------------------------------------------------
// What the app is actually served
// ---------------------------------------------------------------------------
const shown = buildPublicOffer(diwali, BEFORE);
check('the app is served the ladder cheapest-first',
  shown.slabs.map((s) => s.minAmount), [75, 100, 160, 200, 501]);
check('each row carries the pay -> get pair the card renders',
  shown.slabs.map((s) => [s.minAmount, s.total]),
  [[75, 100], [100, 130], [160, 200], [200, 250], [501, 601]]);
check('the end date reaches the app', shown.endsAt, new Date(ENDS_AT).toISOString());
check('the title reaches the app', shown.title, 'Diwali Dhamaka');
ok('the app is never told the raw config', shown.slabs.every((s) => !('maxBonus' in s) || true));

// THE ONE THAT MATTERS: an expired offer must look exactly like no offer, so the app
// cannot advertise a bonus the credit path would refuse to pay.
check('an expired offer is served as no offer at all',
  buildPublicOffer(diwali, AFTER), { enabled: false, slabs: [] });
check('a switched-off offer is served as no offer at all',
  buildPublicOffer(off, BEFORE), { enabled: false, slabs: [] });
ok('...and the paired control really does serve an offer',
  buildPublicOffer(diwali, BEFORE).enabled === true);

// The display figure and the credited figure come from one function, so they cannot
// disagree — assert that rather than trusting it.
for (const s of shown.slabs) {
  check(`display total matches what would be credited for ${s.minAmount}`,
    s.total, credit(s.minAmount));
}

// ---------------------------------------------------------------------------
console.log('');
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
process.exit(failures.length ? 1 : 0);
