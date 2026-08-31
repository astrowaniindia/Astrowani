#!/usr/bin/env node
// Free-call slot arithmetic check. No database, no network — pure date maths.
//
// WHY THIS IS WORTH KEEPING: the slot grid must be generated in the offer's
// business timezone (IST), NOT the server's. A VPS whose clock moves to UTC
// would silently shift every offered slot by 5h30m, and nothing else in the
// system would notice. These assertions fail loudly if that regresses.
//
//   node --env-file=.env scripts/freeCallSlotCheck.js
global.WebSocket = require('ws');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const { _internals } = require('../src/freeCallRoutes');
const { buildSlots, offerDateKeys, businessDateKey, formatSlotLabel, DEFAULTS } = _internals;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

const offer = { ...DEFAULTS, enabled: true, durationMinutes: 12, slotMinutes: 30, openHour: 10, closeHour: 20, daysAhead: 7, minLeadMinutes: 60 };

// Fix "now" at 2026-09-01 04:00 UTC = 09:30 IST, before the 10:00 open.
const now = new Date('2026-09-01T04:00:00Z');

const dates = offerDateKeys(offer, now);
ok(dates.length === 7, 'seven dates offered, got ' + dates.length);
ok(dates[0] === '2026-09-01', 'first date is today in business time: ' + dates[0]);
ok(dates[6] === '2026-09-07', 'last date is +6 days: ' + dates[6]);

const slots = buildSlots(offer, '2026-09-01', now);
ok(slots.length === 20, '10:00->20:00 at 30min = 20 slots, got ' + slots.length);
ok(slots[0].label === '10:00 AM', 'first slot label: ' + slots[0].label);
ok(slots[slots.length - 1].label === '7:30 PM', 'last slot label: ' + slots[slots.length - 1].label);

// 10:00 IST == 04:30 UTC. This is the assertion that catches a timezone slip.
ok(slots[0].startIso === '2026-09-01T04:30:00.000Z', 'first slot instant: ' + slots[0].startIso);
ok(slots[0].endIso === '2026-09-01T04:42:00.000Z', '12-minute duration: ' + slots[0].endIso);

// Lead time: now is 09:30 IST + 60min lead => 10:30 IST. 10:00 must be past, 10:30 not.
ok(slots[0].past === true, '10:00 is inside the 60min lead window');
ok(slots[1].past === false, '10:30 is bookable, past=' + slots[1].past);

// A slot must fit entirely inside the window: with a 45-min call, 19:30 would
// end at 20:15 and must not be offered.
const long = { ...offer, durationMinutes: 45 };
const ls = buildSlots(long, '2026-09-01', now);
ok(ls[ls.length - 1].label === '7:00 PM', '45-min call last slot is 7:00 PM, got ' + ls[ls.length - 1].label);

// Round-trip: the instant of a slot maps back to the same business date, even
// for a late slot that is the NEXT UTC day (19:30 IST = 14:00 UTC, same day;
// check a 23:30 close instead).
const late = { ...offer, openHour: 22, closeHour: 24 };
const lateSlots = buildSlots(late, '2026-09-01', now);
ok(lateSlots.length > 0, 'late-evening window produces slots');
ok(businessDateKey(lateSlots[0].start) === '2026-09-01',
   'a 10pm IST slot (= 16:30 UTC) still belongs to its own business date: ' + businessDateKey(lateSlots[0].start));
ok(formatSlotLabel(lateSlots[0].start) === '10:00 PM', 'late label: ' + formatSlotLabel(lateSlots[0].start));

// Midnight boundary: 00:00-01:00 IST is 18:30-19:30 the PREVIOUS UTC day.
const mid = { ...offer, openHour: 0, closeHour: 1 };
const ms = buildSlots(mid, '2026-09-02', now);
ok(ms[0].startIso === '2026-09-01T18:30:00.000Z', 'midnight IST maps to prev UTC day: ' + ms[0].startIso);
ok(businessDateKey(ms[0].start) === '2026-09-02', 'and still reports as 2026-09-02: ' + businessDateKey(ms[0].start));
ok(formatSlotLabel(ms[0].start) === '12:00 AM', 'midnight label: ' + formatSlotLabel(ms[0].start));

// Nonsense config must not produce an infinite or empty grid.
ok(buildSlots({ ...offer, openHour: 10, closeHour: 10 }, '2026-09-01', now).length === 0, 'zero-length window yields no slots');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
