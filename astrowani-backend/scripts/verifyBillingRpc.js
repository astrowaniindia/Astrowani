#!/usr/bin/env node
/**
 * Verifies what the deployed `process_session_billing` function ACTUALLY does.
 *
 * WHY THIS EXISTS
 * That function is the single most important piece of financial logic in the
 * system — it is what debits customers and credits astrologers every minute of
 * every call and chat. It exists only inside the Supabase dashboard. It is not
 * in this repository, has never been code-reviewed, and cannot be restored if
 * the project is lost or someone drops it.
 *
 * Until it is exported and committed (see EXPORT below), this script is the
 * next best thing: it runs the real function against a throwaway customer,
 * astrologer and session, and asserts the behaviour the rest of the codebase
 * depends on. It touches no real account and deletes everything it creates.
 *
 *   node --env-file=.env scripts/verifyBillingRpc.js
 *
 * EXPORT — run this in the Supabase SQL editor and commit the result to
 * sql/process_session_billing.sql, so the function stops being unrecoverable:
 *
 *   SELECT pg_get_functiondef(p.oid)
 *     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 *    WHERE n.nspname = 'public' AND p.proname = 'process_session_billing';
 *
 * THE CONTRACT the codebase assumes (from src/sessionManager.js):
 *   - takes p_session_id uuid
 *   - returns truthy when the minute was billed, falsy when the customer could
 *     not afford it (sessionManager treats falsy as "terminate the session")
 *   - debits the customer by chat_sessions.per_minute_charge
 *   - credits the astrologer the same amount and counts it toward earnings
 *   - advances chat_sessions.next_billing_at by 60 seconds
 *   - never allows a customer balance to go negative
 *   - writes a row to each ledger
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required. Use --env-file=.env');
  process.exit(2);
}

let pass = 0, fail = 0, warn = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};
const note = (msg) => { warn++; console.log(`  WARN  ${msg}`); };

const RATE = 10;
const tag = `billingtest-${Date.now()}`;

(async () => {
  let cust, astro, session;
  try {
    ({ data: cust } = await db.from('customers')
      .insert([{ name: tag, mobile: tag, wallet_balance: 25 }]).select().single());
    ({ data: astro } = await db.from('astrologers')
      .insert([{ first_name: tag, phone_number: tag, wallet_balance: 0, today_earnings: 0, total_earnings: 0 }])
      .select().single());
    if (!cust || !astro) throw new Error('could not create throwaway accounts');

    ({ data: session } = await db.from('chat_sessions').insert([{
      caller_id: cust.id, vendor_id: astro.id, per_minute_charge: RATE,
      call_type: 'chat', is_active: true,
      started_at: new Date().toISOString(),
      next_billing_at: new Date(Date.now() - 1000).toISOString(),
    }]).select().single());
    if (!session) throw new Error('could not create throwaway session');

    console.log(`\nthrowaway session ${session.id.slice(0, 8)} — customer ₹25, rate ₹${RATE}/min\n`);

    const bal = async (t, id, c = 'wallet_balance') =>
      Number((await db.from(t).select(c).eq('id', id).single()).data?.[c]);
    const sess = async (c) =>
      (await db.from('chat_sessions').select(c).eq('id', session.id).single()).data?.[c];
    const ledger = async (t, col) =>
      (await db.from(t).select('id', { count: 'exact', head: true }).eq(col, t === 'wallet_transactions' ? cust.id : astro.id)).count;

    // ── one successful billing cycle ─────────────────────────────────────
    const before = await sess('next_billing_at');
    const { data: r1, error: e1 } = await db.rpc('process_session_billing', { p_session_id: session.id });
    if (e1) throw new Error(`RPC failed: ${e1.message}`);

    check('returns truthy when the customer can pay', !!r1, `returned ${JSON.stringify(r1)}`);
    check(`debits the customer by per_minute_charge (₹${RATE})`, (await bal('customers', cust.id)) === 25 - RATE,
      `balance is ₹${await bal('customers', cust.id)}, expected ₹${25 - RATE}`);
    check(`credits the astrologer ₹${RATE}`, (await bal('astrologers', astro.id)) === RATE,
      `balance is ₹${await bal('astrologers', astro.id)}`);
    check('counts toward today_earnings', (await bal('astrologers', astro.id, 'today_earnings')) === RATE,
      `today_earnings is ₹${await bal('astrologers', astro.id, 'today_earnings')}`);
    check('counts toward total_earnings', (await bal('astrologers', astro.id, 'total_earnings')) === RATE,
      `total_earnings is ₹${await bal('astrologers', astro.id, 'total_earnings')}`);

    const after = await sess('next_billing_at');
    const advanced = new Date(after) - new Date(before);
    check('advances next_billing_at by ~60s', advanced >= 55000 && advanced <= 65000,
      `advanced by ${Math.round(advanced / 1000)}s`);

    check('writes a customer ledger row', (await ledger('wallet_transactions', 'user_id')) >= 1);
    check('writes an astrologer ledger row', (await ledger('vendor_wallet_transactions', 'vendor_id')) >= 1);

    // ── drain the balance, then confirm it refuses ───────────────────────
    // ₹15 left, ₹10/min: one more succeeds, the next must not overdraw.
    await db.from('chat_sessions')
      .update({ next_billing_at: new Date(Date.now() - 1000).toISOString() }).eq('id', session.id);
    await db.rpc('process_session_billing', { p_session_id: session.id });
    const mid = await bal('customers', cust.id);
    console.log(`\n  (customer now at ₹${mid}, one more minute costs ₹${RATE})\n`);

    await db.from('chat_sessions')
      .update({ next_billing_at: new Date(Date.now() - 1000).toISOString() }).eq('id', session.id);
    const { data: r3 } = await db.rpc('process_session_billing', { p_session_id: session.id });
    const end = await bal('customers', cust.id);

    if (mid < RATE) {
      check('returns falsy when the customer cannot afford the minute', !r3,
        `returned ${JSON.stringify(r3)} with only ₹${mid} available`);
      check('never drives the balance negative', end >= 0, `balance is ₹${end}`);
      check('charges nothing on a refused cycle', end === mid, `₹${mid} -> ₹${end}`);
    } else {
      note(`balance ₹${mid} still covers a minute — insufficient-funds path not exercised`);
    }

    // ── idempotency / double-billing ─────────────────────────────────────
    // sessionManager can legitimately call this twice for one minute if a tick
    // overlaps a retry. Billing the same minute twice is a real risk.
    await db.from('customers').update({ wallet_balance: 100 }).eq('id', cust.id);
    await db.from('chat_sessions')
      .update({ next_billing_at: new Date(Date.now() - 1000).toISOString() }).eq('id', session.id);
    await db.rpc('process_session_billing', { p_session_id: session.id });
    const afterFirst = await bal('customers', cust.id);
    // Immediately again, WITHOUT resetting next_billing_at — the minute is not due yet.
    await db.rpc('process_session_billing', { p_session_id: session.id });
    const afterSecond = await bal('customers', cust.id);
    if (afterSecond === afterFirst) {
      check('will not bill a minute that is not yet due', true);
    } else {
      fail++;
      console.log(`  FAIL  bills again even though next_billing_at is in the future ` +
        `(₹${afterFirst} -> ₹${afterSecond}) — a retry or overlapping tick double-charges the customer`);
    }
  } catch (err) {
    fail++;
    console.log(`  ERROR ${err.message}`);
  } finally {
    if (session) await db.from('chat_sessions').delete().eq('id', session.id);
    if (cust) {
      await db.from('wallet_transactions').delete().eq('user_id', cust.id);
      await db.from('customers').delete().eq('id', cust.id);
    }
    if (astro) {
      await db.from('vendor_wallet_transactions').delete().eq('vendor_id', astro.id);
      await db.from('astrologers').delete().eq('id', astro.id);
    }
    console.log('\nteardown: throwaway rows removed');
  }

  console.log(`\n${pass} passed, ${fail} failed, ${warn} skipped`);
  if (fail) {
    console.log('\nThis function is not in the repository, so a failure here cannot be diffed');
    console.log('against a reviewed source. Export it first (see the header of this file).');
  }
  process.exit(fail ? 1 : 0);
})();
