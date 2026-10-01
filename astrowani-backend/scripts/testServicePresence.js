// Tests the service-gate POLICY (src/servicePresence.js) — the rule that decides whether a
// disconnected participant's chat message is still carried.
//
// Most cases below assert a message IS carried. That is deliberate: a false NEGATIVE here
// breaks a live, paid consultation for someone whose connection is perfectly fine, which is
// far more damaging than a few extra seconds of grace for someone gaming it.
const { mayBeServed, SERVICE_PRESENCE_GRACE_MS } = require('../src/servicePresence');

const NOW = 1_800_000_000_000;
const iso = (ms) => new Date(ms).toISOString();
let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log(`FAIL  ${name} (got ${actual}, expected ${expected})`); }
};

check('grace is 20s', SERVICE_PRESENCE_GRACE_MS, 20000);

// --- in the room: always served, whatever else is true ---
check('in the room, never seen before', mayBeServed({ inRoom: true, now: NOW }), true);
check('in the room, ancient last-seen', mayBeServed({ inRoom: true, lastSeenMs: 1, now: NOW }), true);

// --- just left: inside the grace ---
check('left 1s ago', mayBeServed({ inRoom: false, lastSeenMs: NOW - 1000, now: NOW }), true);
check('left 19s ago', mayBeServed({ inRoom: false, lastSeenMs: NOW - 19000, now: NOW }), true);
check('left exactly 20s ago (boundary is inclusive)', mayBeServed({ inRoom: false, lastSeenMs: NOW - 20000, now: NOW }), true);

// --- past the grace: the exploit window closes ---
check('left 21s ago', mayBeServed({ inRoom: false, lastSeenMs: NOW - 21000, now: NOW }), false);
check('left 5 minutes ago', mayBeServed({ inRoom: false, lastSeenMs: NOW - 300000, now: NOW }), false);
check('never in the room, no session start', mayBeServed({ inRoom: false, now: NOW }), false);

// --- the startup race: birth details are auto-sent before join_session can ack ---
check('fresh session, never joined yet', mayBeServed({ inRoom: false, startedAt: iso(NOW - 2000), now: NOW }), true);
check('fresh session at the 20s edge', mayBeServed({ inRoom: false, startedAt: iso(NOW - 20000), now: NOW }), true);
check('old session, never joined', mayBeServed({ inRoom: false, startedAt: iso(NOW - 600000), now: NOW }), false);
check('old session but seen recently', mayBeServed({ inRoom: false, startedAt: iso(NOW - 600000), lastSeenMs: NOW - 3000, now: NOW }), true);
check('recent start beats a stale sighting', mayBeServed({ inRoom: false, startedAt: iso(NOW - 1000), lastSeenMs: NOW - 999000, now: NOW }), true);

// --- junk input must not accidentally open or close the gate ---
check('unparseable startedAt, no sighting', mayBeServed({ inRoom: false, startedAt: 'not-a-date', now: NOW }), false);
check('null startedAt, recent sighting', mayBeServed({ inRoom: false, startedAt: null, lastSeenMs: NOW - 1000, now: NOW }), true);
check('no arguments at all', mayBeServed(), false);
check('explicit graceMs is honoured', mayBeServed({ inRoom: false, lastSeenMs: NOW - 45000, graceMs: 60000, now: NOW }), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
