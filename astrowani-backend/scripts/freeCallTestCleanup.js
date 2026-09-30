#!/usr/bin/env node
/**
 * Remove the rows an instant free-call test run leaves behind, for ONE customer.
 *
 *   node --env-file=.env scripts/freeCallTestCleanup.js 9999999999
 *   node --env-file=.env scripts/freeCallTestCleanup.js 9999999999 --apply
 *
 * Dry run by default: it prints exactly what it would delete and changes nothing.
 * Nothing is removed until you pass --apply.
 *
 * WHY THIS EXISTS
 * A local backend reads the live database, so an end-to-end test genuinely inserts
 * bookings, call requests and sessions. `src/freeCallLocalTest.js` keeps SETTINGS and
 * BALANCES untouched; this script clears the rows.
 *
 * WHAT IT WILL NOT TOUCH, deliberately:
 *   - app_settings, astrologers, or any other configuration
 *   - any wallet, ledger or admin_wallet row (a test run should not have moved money;
 *     if one did, that is a real finding and wants looking at, not deleting)
 *   - any row belonging to a different customer
 *   - sessions that are still active (end the call first — deleting a live session
 *     strands the astrologer)
 */

const { createClient } = require('@supabase/supabase-js');

// Node 20 has no global WebSocket and supabase-js constructs a Realtime client eagerly.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* realtime unused here */ }
}

const mobile = (process.argv[2] || '').replace(/\D/g, '').slice(-10);
const APPLY = process.argv.includes('--apply');

if (!mobile || mobile.length !== 10) {
  console.error('Usage: node --env-file=.env scripts/freeCallTestCleanup.js <10-digit-mobile> [--apply]');
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from the environment.');
  process.exit(2);
}
const db = createClient(url, key);

(async () => {
  const { data: customers, error: cErr } = await db
    .from('customers').select('id, name, mobile').eq('mobile', mobile).limit(2);
  if (cErr) { console.error('customer lookup failed:', cErr.message); process.exit(1); }
  if (!customers || !customers.length) { console.error(`No customer with mobile ${mobile}.`); process.exit(1); }
  if (customers.length > 1) { console.error('More than one customer on that number — refusing to guess.'); process.exit(1); }

  const c = customers[0];
  console.log(`\n${APPLY ? 'CLEANING' : 'DRY RUN for'}: ${c.name} (${c.mobile})  id=${c.id}\n`);

  const { data: bookings } = await db
    .from('free_call_bookings')
    .select('id, kind, status, call_session_id, created_at')
    .eq('customer_id', c.id);

  const { data: sessions } = await db
    .from('chat_sessions')
    .select('id, is_free, is_active, started_at, ended_at')
    .eq('caller_id', c.id).eq('is_free', true);

  const { data: reqs } = await db
    .from('call_requests')
    .select('id, status, is_free, created_at')
    .eq('customer_id', c.id).eq('is_free', true);

  const { data: holdRows } = await db
    .from('astrologer_holds').select('astrologer_id, phase, expires_at').eq('customer_id', c.id);

  const { data: ratings } = await db
    .from('app_ratings').select('id, rating, context').eq('customer_id', c.id);

  const live = (sessions || []).filter((s) => s.is_active);
  if (live.length) {
    console.error(`REFUSING: ${live.length} free session(s) still active. End the call first:`);
    live.forEach((s) => console.error(`   ${s.id}`));
    process.exit(1);
  }

  const plan = [
    ['astrologer_holds', holdRows || [], () => db.from('astrologer_holds').delete().eq('customer_id', c.id)],
    ['app_ratings', ratings || [], () => db.from('app_ratings').delete().eq('customer_id', c.id)],
    ['free_call_bookings', bookings || [], () => db.from('free_call_bookings').delete().eq('customer_id', c.id)],
    // chat_sessions before call_requests: the request row references the session.
    ['chat_sessions (free only)', sessions || [], () => db.from('chat_sessions').delete().eq('caller_id', c.id).eq('is_free', true)],
    ['call_requests (free only)', reqs || [], () => db.from('call_requests').delete().eq('customer_id', c.id).eq('is_free', true)],
  ];

  for (const [name, rows] of plan) console.log(`  ${String(rows.length).padStart(3)}  ${name}`);

  if (!APPLY) {
    console.log('\nNothing deleted. Re-run with --apply to remove the rows above.\n');
    return;
  }

  console.log('');
  let failed = 0;
  for (const [name, rows, run] of plan) {
    if (!rows.length) continue;
    const { error } = await run();
    if (error) { console.error(`  FAILED ${name}: ${error.message}`); failed += 1; }
    else console.log(`  deleted ${rows.length} from ${name}`);
  }

  // Assert, rather than trust the deletes reported success.
  const { count: leftB } = await db.from('free_call_bookings')
    .select('id', { count: 'exact', head: true }).eq('customer_id', c.id);
  const { count: leftH } = await db.from('astrologer_holds')
    .select('astrologer_id', { count: 'exact', head: true }).eq('customer_id', c.id);
  console.log(`\nremaining: bookings=${leftB || 0} holds=${leftH || 0}`);
  console.log(failed ? '\nFinished WITH ERRORS.\n' : '\nClean.\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('cleanup threw:', e.message); process.exit(1); });
