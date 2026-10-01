// Proves the fanout filter against REAL Supabase Realtime payloads.
//
// The unit tests (scripts/testFanoutFilter.js) assert the LOGIC. They cannot
// prove the one assumption the logic rests on: that a real postgres_changes
// payload actually carries `eventType`, a full `old` and a full `new`. If
// REPLICA IDENTITY were not FULL, or supabase-js changed its payload shape, the
// filter would fail safe (relay everything) and the fix would silently do
// nothing — which looks exactly like success from the outside.
//
// This subscribes for real and reports what the filter decides about each
// payload that arrives. It only READS. It writes nothing.
//
// Run:  node --env-file=.env scripts/verifyFanoutFilterLive.js
// Then, in another window, cause an astrologers write (or let billing do it).
//
// NOTE: Node 20 has no global WebSocket, which @supabase/realtime-js needs at
// import time. If this throws on boot, run it as:
//   node --env-file=.env -e "globalThis.WebSocket=require('ws');require('./scripts/verifyFanoutFilterLive.js')"

const { createClient } = require('@supabase/supabase-js');
const { isNonDisplayChange } = require('../src/astrologerFanout');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — run with --env-file=.env');
  process.exit(1);
}

const SECONDS = Number(process.argv[2] || 90);
const rt = createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } });

let seen = 0;
let skipped = 0;
let relayed = 0;

console.log(`Listening on public.astrologers for ${SECONDS}s. Read-only.\n`);

rt.channel(`verify-fanout-${Date.now()}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'astrologers' }, (payload) => {
    seen++;
    const decision = isNonDisplayChange(payload);
    if (decision) skipped++; else relayed++;

    const before = payload.old || {};
    const after = payload.new || {};
    const diff = Object.keys(after).filter((k) => String(before[k]) !== String(after[k]));

    console.log(
      `[${payload.eventType}] oldKeys=${Object.keys(before).length} ` +
      `changed=[${diff.join(', ') || '(none)'}] -> ${decision ? 'SKIP (noise)' : 'RELAY'}`,
    );
    if (payload.eventType === 'UPDATE' && Object.keys(before).length <= 1) {
      console.log('  !! `old` has <=1 key — REPLICA IDENTITY is not FULL on this table.');
      console.log('     The filter will relay everything and the fix will do nothing.');
      console.log('     Apply: ALTER TABLE public.astrologers REPLICA IDENTITY FULL;');
    }
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') console.log('subscribed — waiting for writes…\n');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error(`realtime ${status}:`, err?.message || '(no detail)');
    }
  });

setTimeout(() => {
  console.log(`\n--- ${seen} change(s): ${skipped} skipped as noise, ${relayed} relayed ---`);
  if (!seen) console.log('No writes occurred in the window. Trigger one and re-run.');
  process.exit(0);
}, SECONDS * 1000);
