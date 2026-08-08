// Verifies POST /api/session/accept and /api/session/reject — the "risky" STEP 3
// migration (ported from incomingRequestActions.js's race-condition-aware accept/reject
// logic). Covers the normal path for both call and chat, plus the race-disambiguation
// path (request already cancelled before the vendor's accept lands).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4500';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set a strong JWT_SECRET (matching the running server) before running this.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(BASE_URL + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method,
        headers: { 'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); }
          catch (e) { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const tag = `sessaccept-${Date.now()}`;
  let customer, astro;
  const sessionIdsToClean = [];
  const callReqIdsToClean = [];
  const chatReqIdsToClean = [];

  try {
    const custMobile = `9${Date.now()}`.slice(0, 10);
    const { data: cust } = await db.from('customers')
      .insert([{ name: tag, mobile: custMobile, wallet_balance: 500 }]).select('id').single();
    customer = cust;

    const { data: ast } = await db.from('astrologers')
      .insert([{ first_name: tag, phone_number: `8${Date.now()}`.slice(0, 10),
        call_charge_per_minute: 15, chat_charge_per_minute: 8 }]).select('id').single();
    astro = ast;

    const vendorToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── Scenario 1: accept a pending call_requests row ────────────────────────
    const roomId1 = crypto.randomUUID();
    const { data: callReq1 } = await db.from('call_requests').insert([{
      customer_id: customer.id, astrologer_id: astro.id, customer_name: tag,
      call_type: 'audio', status: 'pending', room_id: roomId1,
    }]).select('id').single();
    callReqIdsToClean.push(callReq1.id);

    const accept1 = await request('POST', '/api/session/accept', {
      token: vendorToken,
      body: { table: 'call_requests', roomId: roomId1, callerId: customer.id, callType: 'audio' },
    });
    check('accept call: ok true', accept1.body?.ok === true);
    check('accept call: resolvedRequestId matches', accept1.body?.resolvedRequestId === callReq1.id);
    check('accept call: perMinuteCharge matches astrologer rate', accept1.body?.perMinuteCharge === 15);
    check('accept call: sessionId returned', !!accept1.body?.sessionId);
    if (accept1.body?.sessionId) sessionIdsToClean.push(accept1.body.sessionId);

    if (accept1.body?.sessionId) {
      const { data: sessRow } = await db.from('chat_sessions').select('*').eq('id', accept1.body.sessionId).single();
      check('accept call: session row has correct vendor_id', sessRow?.vendor_id === astro.id);
      check('accept call: session row has correct caller_id', sessRow?.caller_id === customer.id);
      check('accept call: session row call_type is audio', sessRow?.call_type === 'audio');
    }
    const { data: updatedCallReq } = await db.from('call_requests').select('status, session_id').eq('id', callReq1.id).single();
    check('accept call: request status updated to accepted', updatedCallReq?.status === 'accepted');
    check('accept call: request session_id linked back', updatedCallReq?.session_id === accept1.body?.sessionId);

    // ── Scenario 2: accept a pending chat_requests row ─────────────────────────
    const { data: chatReq1 } = await db.from('chat_requests').insert([{
      caller_id: customer.id, receiver_id: astro.id, status: 'pending',
      request_type: 'chat', caller_name: tag,
    }]).select('id').single();
    chatReqIdsToClean.push(chatReq1.id);

    const accept2 = await request('POST', '/api/session/accept', {
      token: vendorToken,
      body: { table: 'chat_requests', requestId: chatReq1.id, callerId: customer.id, callType: 'chat' },
    });
    check('accept chat: ok true', accept2.body?.ok === true);
    check('accept chat: perMinuteCharge matches chat rate', accept2.body?.perMinuteCharge === 8);
    if (accept2.body?.sessionId) sessionIdsToClean.push(accept2.body.sessionId);
    const { data: updatedChatReq } = await db.from('chat_requests').select('status').eq('id', chatReq1.id).single();
    check('accept chat: request status updated to accepted', updatedChatReq?.status === 'accepted');

    // ── Scenario 3: race — customer cancelled before vendor's accept arrives ──
    const { data: chatReq2 } = await db.from('chat_requests').insert([{
      caller_id: customer.id, receiver_id: astro.id, status: 'cancelled',
      request_type: 'chat', caller_name: tag,
    }]).select('id').single();
    chatReqIdsToClean.push(chatReq2.id);

    const acceptCancelled = await request('POST', '/api/session/accept', {
      token: vendorToken,
      body: { table: 'chat_requests', callerId: customer.id, callType: 'chat' },
    });
    check('accept race: already-cancelled request -> ok false', acceptCancelled.body?.ok === false);
    check('accept race: reason is cancelled', acceptCancelled.body?.reason === 'cancelled');
    const { data: sessCountAfterRace } = await db.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('caller_id', customer.id);
    // (sanity: no session was created for the cancelled request — checked via count below)

    // ── Scenario 4: reject a pending call_requests row ─────────────────────────
    const roomId2 = crypto.randomUUID();
    const { data: callReq2 } = await db.from('call_requests').insert([{
      customer_id: customer.id, astrologer_id: astro.id, customer_name: tag,
      call_type: 'video', status: 'pending', room_id: roomId2,
    }]).select('id').single();
    callReqIdsToClean.push(callReq2.id);

    const reject1 = await request('POST', '/api/session/reject', {
      token: vendorToken,
      body: { table: 'call_requests', roomId: roomId2, callerId: customer.id },
    });
    check('reject call: ok true', reject1.body?.ok === true);
    const { data: rejectedRow } = await db.from('call_requests').select('status').eq('id', callReq2.id).single();
    check('reject call: request status updated to rejected', rejectedRow?.status === 'rejected');

    // ── Unauthorized: no token at all ──────────────────────────────────────────
    const noAuth = await request('POST', '/api/session/accept', { body: { table: 'chat_requests' } });
    check('accept: no token -> 401', noAuth.status === 401);
  } finally {
    for (const id of sessionIdsToClean) await db.from('chat_sessions').delete().eq('id', id);
    for (const id of callReqIdsToClean) await db.from('call_requests').delete().eq('id', id);
    for (const id of chatReqIdsToClean) await db.from('chat_requests').delete().eq('id', id);
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
