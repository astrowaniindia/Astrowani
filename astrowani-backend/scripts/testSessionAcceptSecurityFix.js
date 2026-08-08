// Verifies the 2026-08-08 fix for the wallet-theft IDOR in /api/session/accept + /reject
// (see security-audit-2026-08-08.md). Confirms:
//   1. A vendor with NO real pending request cannot create a session at all.
//   2. A vendor cannot accept another astrologer's pending request by guessing/replaying
//      its roomId/requestId (ownership filter now enforced).
//   3. A vendor with ONE legitimate pending request cannot swap in an arbitrary victim's
//      callerId — the session's caller_id must come from the real request row.
//   4. The legitimate accept/reject paths (own real requests) still work — regression check.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4501';

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
  const tag = `secfix-${Date.now()}`;
  let victim, attacker, legitAstro, legitCustomer;
  const sessionIdsToClean = [];
  const callReqIdsToClean = [];
  const chatReqIdsToClean = [];

  try {
    const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
    const mk = async (table, extra) => {
      const row = table === 'customers'
        ? { name: tag, mobile: `9${randDigits(9)}`, wallet_balance: 500 }
        : { first_name: tag, phone_number: `8${randDigits(9)}`, call_charge_per_minute: 15, chat_charge_per_minute: 8 };
      const { data, error } = await db.from(table).insert([{ ...row, ...extra }]).select('id').single();
      if (error) throw error;
      return data;
    };

    victim = await mk('customers');           // the customer whose wallet must NOT be touched
    legitCustomer = await mk('customers');     // a customer who genuinely rang the attacker
    attacker = await mk('astrologers');        // malicious vendor account
    legitAstro = await mk('astrologers');      // an unrelated, legitimate astrologer

    const attackerToken = jwt.sign({ id: attacker.id, astroId: attacker.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── Exploit attempt 1: no requestId/roomId at all, arbitrary callerId ──────────
    const exploit1 = await request('POST', '/api/session/accept', {
      token: attackerToken,
      body: { table: 'call_requests', callerId: victim.id, callType: 'call' },
    });
    check('exploit1: rejected (ok:false)', exploit1.body?.ok === false);
    check('exploit1: no sessionId returned', !exploit1.body?.sessionId);
    const { count: c1 } = await db.from('chat_sessions').select('id', { count: 'exact', head: true }).eq('caller_id', victim.id);
    check('exploit1: no session row created for victim', (c1 || 0) === 0);

    // ── Exploit attempt 2: replay another astrologer's real pending roomId ─────────
    const roomId = crypto.randomUUID();
    const { data: legitCallReq } = await db.from('call_requests').insert([{
      customer_id: legitCustomer.id, astrologer_id: legitAstro.id, customer_name: tag,
      call_type: 'audio', status: 'pending', room_id: roomId,
    }]).select('id').single();
    callReqIdsToClean.push(legitCallReq.id);

    const exploit2 = await request('POST', '/api/session/accept', {
      token: attackerToken, // attacker, NOT legitAstro
      body: { table: 'call_requests', roomId, callerId: legitCustomer.id, callType: 'audio' },
    });
    check('exploit2: attacker cannot steal another astrologer\'s request (ok:false)', exploit2.body?.ok === false);
    check('exploit2: reason not_found', exploit2.body?.reason === 'not_found');
    const { data: untouchedReq } = await db.from('call_requests').select('status').eq('id', legitCallReq.id).single();
    check('exploit2: victim astrologer\'s request row untouched (still pending)', untouchedReq?.status === 'pending');

    // ── Exploit attempt 3: real pending request, but swap in an arbitrary callerId ─
    const { data: attackerReq } = await db.from('chat_requests').insert([{
      caller_id: legitCustomer.id, receiver_id: attacker.id, status: 'pending',
      request_type: 'chat', caller_name: tag,
    }]).select('id').single();
    chatReqIdsToClean.push(attackerReq.id);

    const exploit3 = await request('POST', '/api/session/accept', {
      token: attackerToken,
      body: { table: 'chat_requests', requestId: attackerReq.id, callerId: victim.id, callType: 'chat' }, // callerId spoofed to victim
    });
    check('exploit3: accept succeeds (it is a real owned request)', exploit3.body?.ok === true);
    if (exploit3.body?.sessionId) sessionIdsToClean.push(exploit3.body.sessionId);
    check('exploit3: returned callerId is the REAL caller, not the spoofed victim', exploit3.body?.navigationParams?.callerId === legitCustomer.id);
    if (exploit3.body?.sessionId) {
      const { data: sessRow } = await db.from('chat_sessions').select('caller_id').eq('id', exploit3.body.sessionId).single();
      check('exploit3: session.caller_id is the REAL caller (legitCustomer), not victim', sessRow?.caller_id === legitCustomer.id);
      check('exploit3: session.caller_id is NOT the spoofed victim id', sessRow?.caller_id !== victim.id);
    }

    // ── Regression: legitimate accept still works end-to-end ───────────────────────
    const roomId2 = crypto.randomUUID();
    const { data: legitCallReq2 } = await db.from('call_requests').insert([{
      customer_id: legitCustomer.id, astrologer_id: attacker.id, customer_name: tag,
      call_type: 'video', status: 'pending', room_id: roomId2,
    }]).select('id').single();
    callReqIdsToClean.push(legitCallReq2.id);

    const legitAccept = await request('POST', '/api/session/accept', {
      token: attackerToken, // attacker accepting THEIR OWN legitimate incoming request
      body: { table: 'call_requests', roomId: roomId2, callerId: legitCustomer.id, callType: 'video' },
    });
    check('regression: legitimate own-request accept still works', legitAccept.body?.ok === true);
    if (legitAccept.body?.sessionId) sessionIdsToClean.push(legitAccept.body.sessionId);

    // ── Regression: reject still works, and can't be used to grief another astrologer ──
    const roomId3 = crypto.randomUUID();
    const { data: otherAstroReq } = await db.from('call_requests').insert([{
      customer_id: legitCustomer.id, astrologer_id: legitAstro.id, customer_name: tag,
      call_type: 'audio', status: 'pending', room_id: roomId3,
    }]).select('id').single();
    callReqIdsToClean.push(otherAstroReq.id);

    const griefAttempt = await request('POST', '/api/session/reject', {
      token: attackerToken,
      body: { table: 'call_requests', roomId: roomId3, callerId: legitCustomer.id },
    });
    check('reject-grief: attacker cannot reject another astrologer\'s request', griefAttempt.body?.ok === false);
    const { data: stillPending } = await db.from('call_requests').select('status').eq('id', otherAstroReq.id).single();
    check('reject-grief: other astrologer\'s request still pending', stillPending?.status === 'pending');

    // ── Unauthorized: no token ──────────────────────────────────────────────────────
    const noAuth = await request('POST', '/api/session/accept', { body: { table: 'chat_requests' } });
    check('accept: no token -> 401', noAuth.status === 401);
  } finally {
    for (const id of sessionIdsToClean) await db.from('chat_sessions').delete().eq('id', id);
    for (const id of callReqIdsToClean) await db.from('call_requests').delete().eq('id', id);
    for (const id of chatReqIdsToClean) await db.from('chat_requests').delete().eq('id', id);
    if (victim) await db.from('customers').delete().eq('id', victim.id);
    if (legitCustomer) await db.from('customers').delete().eq('id', legitCustomer.id);
    if (attacker) await db.from('astrologers').delete().eq('id', attacker.id);
    if (legitAstro) await db.from('astrologers').delete().eq('id', legitAstro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
