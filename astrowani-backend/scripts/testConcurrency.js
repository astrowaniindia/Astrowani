// Load/concurrency test: fires many simultaneous /api/call/initiate and
// /api/chat/initiate requests at ONE throwaway astrologer to check whether the
// busy-check-then-insert in index.js (checkAstrologerBusy, then a separate
// .insert()) is actually atomic under concurrency, or just looks safe in
// single-request testing. Creates its own throwaway astrologer + customers and
// deletes everything (including any call_requests/chat_requests rows it
// creates) in the finally block. Touches no real account.
// Run: node --env-file=.env scripts/testConcurrency.js
const { spawn } = require('child_process');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const PORT = 4598;
const BASE = `http://127.0.0.1:${PORT}`;
const CONCURRENCY = 20;
const JWT_SECRET = crypto.randomBytes(48).toString('base64url');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const child = spawn(process.execPath, ['--env-file=.env', 'index.js'], {
  cwd: require('path').join(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), JWT_SECRET, DISABLE_SESSION_MANAGER: '1' },
});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${extra}`)); };

(async () => {
  const TAG = `conctest-${Date.now()}`;
  let astro = null;
  const customers = [];
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/astrologers`)).ok) break; } catch (_) {}
      await sleep(500);
    }
    check('backend booted', log.includes('running on http'), log.slice(-400));

    const { data: astroRow, error: aErr } = await db.from('astrologers')
      .insert([{ first_name: TAG, phone_number: `${TAG}-astro`, approval_status: 'approved', is_available: true }])
      .select().single();
    if (aErr) throw new Error('could not create test astrologer: ' + aErr.message);
    astro = astroRow;

    for (let i = 0; i < CONCURRENCY; i++) {
      const { data: c, error } = await db.from('customers')
        .insert([{ name: `${TAG}-c${i}`, mobile: `${TAG}-c${i}`, wallet_balance: 500 }])
        .select().single();
      if (error) throw new Error('could not create test customer: ' + error.message);
      customers.push(c);
    }
    const tokens = customers.map((c) => jwt.sign({ userId: c.id, phone: c.mobile }, JWT_SECRET));

    // ── round 1: N concurrent /api/call/initiate at the SAME astrologer ─────
    const callResults = await Promise.all(tokens.map((t) => fetch(`${BASE}/api/call/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ receiverId: astro.id, callType: 'audio' }),
    }).then((r) => r.status)));
    const callAccepted = callResults.filter((s) => s === 200).length;
    const callRejected = callResults.filter((s) => s === 409).length;
    const { data: pendingCalls } = await db.from('call_requests').select('id').eq('astrologer_id', astro.id).eq('status', 'pending');
    console.log(`  call/initiate: ${callAccepted} accepted, ${callRejected} got 409, ${pendingCalls.length} pending row(s) in DB`);
    check('at most ONE call_requests row ended up pending for this astrologer', pendingCalls.length <= 1,
      `got ${pendingCalls.length} pending rows from ${callAccepted} "successful" requests — busy-gate race under concurrency`);

    // clean up round 1's rows before round 2 so the busy-check starts fresh
    await db.from('call_requests').delete().eq('astrologer_id', astro.id);

    // ── round 2: N concurrent /api/chat/initiate at the SAME astrologer ─────
    const chatResults = await Promise.all(tokens.map((t) => fetch(`${BASE}/api/chat/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ astrologerId: astro.id }),
    }).then((r) => r.status)));
    const chatAccepted = chatResults.filter((s) => s === 200).length;
    const chatRejected = chatResults.filter((s) => s === 409).length;
    const { data: pendingChats } = await db.from('chat_requests').select('id').eq('receiver_id', astro.id).eq('status', 'pending');
    console.log(`  chat/initiate: ${chatAccepted} accepted, ${chatRejected} got 409, ${pendingChats.length} pending row(s) in DB`);
    check('at most ONE chat_requests row ended up pending for this astrologer', pendingChats.length <= 1,
      `got ${pendingChats.length} pending rows from ${chatAccepted} "successful" requests — busy-gate race under concurrency`);

    // ── round 3: process_session_billing called TWICE at once for the SAME
    // due session — this is the scenario a second sessionManager instance
    // (e.g. an accidental PM2 cluster/2 deploys overlapping) or an overlapping
    // setInterval tick racing past the in-process isCheckingSessions guard
    // would produce. verifyBillingRpc.js already proves sequential re-calls
    // are refused (next_billing_at not yet due); this proves the TRULY
    // concurrent case, which a re-entrancy flag inside one Node process
    // cannot protect against.
    const RATE = 10;
    const { data: billCust } = await db.from('customers').insert([{ name: `${TAG}-bc`, mobile: `${TAG}-bc`, wallet_balance: 100 }]).select().single();
    const { data: billAstro } = await db.from('astrologers').insert([{ first_name: `${TAG}-ba`, phone_number: `${TAG}-ba`, wallet_balance: 0, today_earnings: 0, total_earnings: 0 }]).select().single();
    const { data: session } = await db.from('chat_sessions').insert([{
      caller_id: billCust.id, vendor_id: billAstro.id, per_minute_charge: RATE, call_type: 'chat',
      is_active: true, started_at: new Date().toISOString(), next_billing_at: new Date(Date.now() - 1000).toISOString(),
    }]).select().single();
    try {
      const [r1, r2] = await Promise.all([
        db.rpc('process_session_billing', { p_session_id: session.id }),
        db.rpc('process_session_billing', { p_session_id: session.id }),
      ]);
      const billedCount = [r1, r2].filter((r) => !r.error && r.data).length;
      const finalBalance = Number((await db.from('customers').select('wallet_balance').eq('id', billCust.id).single()).data.wallet_balance);
      console.log(`  billing RPC fired twice concurrently: ${billedCount} call(s) report "billed", customer 100 -> ${finalBalance}`);
      check('two truly concurrent billing calls for one due minute charge only once', finalBalance === 100 - RATE,
        `expected ₹${100 - RATE}, got ₹${finalBalance} (${billedCount} of 2 concurrent calls billed) — process_session_billing lacks row locking against concurrent invocation`);
    } finally {
      await db.from('chat_sessions').delete().eq('id', session.id);
      await db.from('wallet_transactions').delete().eq('user_id', billCust.id);
      await db.from('vendor_wallet_transactions').delete().eq('vendor_id', billAstro.id);
      await db.from('customers').delete().eq('id', billCust.id);
      await db.from('astrologers').delete().eq('id', billAstro.id);
    }
  } catch (err) {
    fail++;
    console.log('  ERROR', err.message);
    console.log(log.slice(-1500));
  } finally {
    if (astro) {
      await db.from('call_requests').delete().eq('astrologer_id', astro.id);
      await db.from('chat_requests').delete().eq('receiver_id', astro.id);
      await db.from('astrologers').delete().eq('id', astro.id);
    }
    for (const c of customers) await db.from('customers').delete().eq('id', c.id);
    console.log(`\nteardown: deleted 1 astrologer, ${customers.length} customers, and any leftover request rows`);
    child.kill();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
