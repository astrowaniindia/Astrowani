// Verifies the 2026-08-08 fix: an astrologer currently broadcasting live is now treated as
// busy — calls/chats to them are rejected with reason:'live' instead of silently succeeding
// (previously they could accept an incoming call mid-broadcast without the live session ever
// ending). Also verifies /api/vendor/wallet's new customerName/callType enrichment.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4506';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET (matching the running local server) before running this.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

function postJson(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE_URL + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => { let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); } catch (e) { resolve({ status: res.statusCode, body: raw }); } }); },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => { let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); } catch (e) { resolve({ status: res.statusCode, body: raw }); } }); },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const tag = `livebusy-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let astro, caller, liveSession, session, txn;

  try {
    const { data: ast } = await db.from('astrologers').insert([{
      first_name: `${tag}-astro`, last_name: 'Test', phone_number: `8${randDigits(9)}`,
      email: `${tag}@example.com`, profile_pic_url: 'https://example.com/x.jpg', languages: ['Hindi'],
      experience: 5, gender: 'male', approval_status: 'approved', is_call_enabled: true, is_chat_enabled: true, call_charge_per_minute: 1,
    }]).select('id').single();
    astro = ast;
    const { data: cust } = await db.from('customers').insert([{ name: `${tag}-cust`, mobile: `9${randDigits(9)}`, wallet_balance: 500 }]).select('id').single();
    caller = cust;

    const { data: live } = await db.from('live_sessions').insert([{ astrologer_id: astro.id, title: 'test', is_active: true }]).select('id').single();
    liveSession = live;
    await db.from('astrologers').update({ is_live: true }).eq('id', astro.id);

    const callerToken = jwt.sign({ id: caller.id, userId: caller.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });
    const vendorToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── 1. call/initiate to a live astrologer must 409 with reason:'live' ──
    const callResp = await postJson('/api/call/initiate', { receiverId: astro.id, callType: 'audio', callerRole: 'customer' }, callerToken);
    check('call/initiate to a LIVE astrologer -> 409', callResp.status === 409);
    check('409 body has reason:live', callResp.body?.reason === 'live');
    check('409 message mentions live', /live/i.test(callResp.body?.message || ''));

    // ── 2. chat/check-availability to a live astrologer must 409 with reason:'live' ──
    const chatResp = await postJson('/api/chat/check-availability', { astrologerId: astro.id }, callerToken);
    check('chat/check-availability for a LIVE astrologer -> 409', chatResp.status === 409);
    check('chat 409 body has reason:live', chatResp.body?.reason === 'live');

    // ── 3. astrologer list reflects isBusy + busyReason:'live' ──
    const listResp = await getJson('/api/astrologers', callerToken);
    const row = (listResp.body?.data || []).find((r) => r.id === astro.id || r.userId === astro.id);
    check('astrologer list row found', !!row);
    check('list row isBusy true', row?.isBusy === true);
    check('list row busyReason live', row?.busyReason === 'live');

    // ── 4. ending the live session frees the astrologer for new calls ──
    await db.from('live_sessions').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', liveSession.id);
    await db.from('astrologers').update({ is_live: false }).eq('id', astro.id);
    const callResp2 = await postJson('/api/call/initiate', { receiverId: astro.id, callType: 'audio', callerRole: 'customer' }, callerToken);
    check('call/initiate after live ends -> succeeds', callResp2.status === 200);

    // Clean up the call_requests row this created before it lingers as pending.
    if (callResp2.body?.data?.requestId || callResp2.body?.requestId) {
      const reqId = callResp2.body?.data?.requestId || callResp2.body?.requestId;
      await db.from('call_requests').delete().eq('id', reqId);
    }

    // ── 5. vendor wallet transaction enrichment (customerName + callType) ──
    const { data: sess } = await db.from('chat_sessions').insert([{
      caller_id: caller.id, vendor_id: astro.id, per_minute_charge: 12, call_type: 'chat',
      is_active: false, next_billing_at: null, started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    }]).select('id').single();
    session = sess;
    const { data: t } = await db.from('vendor_wallet_transactions').insert([{
      vendor_id: astro.id, type: 'credit', amount: 12, description: 'Automated chat earning', session_id: session.id,
    }]).select('id').single();
    txn = t;

    const walletResp = await getJson('/api/vendor/wallet', vendorToken);
    const foundTxn = (walletResp.body?.data?.transactions || []).find((x) => x.id === txn.id);
    check('wallet transaction found', !!foundTxn);
    check('wallet transaction enriched with real customer name', foundTxn?.customerName === `${tag}-cust`);
    check('wallet transaction enriched with call type', foundTxn?.callType === 'chat');
  } finally {
    if (txn) await db.from('vendor_wallet_transactions').delete().eq('id', txn.id);
    if (session) await db.from('chat_sessions').delete().eq('id', session.id);
    if (liveSession) await db.from('live_sessions').delete().eq('id', liveSession.id);
    if (astro) {
      await db.from('call_requests').delete().eq('astrologer_id', astro.id);
      await db.from('astrologers').delete().eq('id', astro.id);
    }
    if (caller) await db.from('customers').delete().eq('id', caller.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
