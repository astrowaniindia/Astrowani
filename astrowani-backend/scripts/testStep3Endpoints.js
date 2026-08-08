// Verifies the STEP 3 endpoints (moving call_requests/chat_requests/chat_messages
// inserts server-side) against real throwaway rows, created and deleted in this run.
// See DATABASE_HARDENING_HANDOFF.md STEP 3.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');

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
      {
        hostname: url.hostname, port: url.port, path: url.pathname, method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
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
  const tag = `step3test-${Date.now()}`;
  let customer, astro, callRequestId, chatRequestId, messageId;

  try {
    const custMobile = `9${Date.now()}`.slice(0, 10);
    const { data: cust, error: custErr } = await db
      .from('customers').insert([{ name: tag, mobile: custMobile, wallet_balance: 500 }]).select('id').single();
    if (custErr) throw custErr;
    customer = cust;

    const { data: ast, error: astErr } = await db
      .from('astrologers').insert([{
        first_name: tag, last_name: 'Vendor', phone_number: `8${Date.now()}`.slice(0, 10),
        is_call_enabled: true, is_chat_enabled: true, call_charge_per_minute: 10, chat_charge_per_minute: 5,
      }]).select('id').single();
    if (astErr) throw astErr;
    astro = ast;

    const custToken = jwt.sign({ id: customer.id, userId: customer.id, phone: custMobile }, JWT_SECRET, { expiresIn: '1h' });
    const vendorToken = jwt.sign({ id: astro.id, userId: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── POST /api/call/initiate now creates call_requests itself ──────────────
    const callRes = await request('POST', '/api/call/initiate', {
      token: custToken, body: { receiverId: astro.id, callType: 'audio' },
    });
    check('call/initiate: 200', callRes.status === 200);
    check('call/initiate: returns requestId', !!callRes.body?.data?.requestId);
    callRequestId = callRes.body?.data?.requestId;

    if (callRequestId) {
      const { data: row } = await db.from('call_requests').select('*').eq('id', callRequestId).single();
      check('call/initiate: row actually exists in call_requests', !!row);
      check('call/initiate: row has correct customer_id', row?.customer_id === customer.id);
      check('call/initiate: row has correct astrologer_id', row?.astrologer_id === astro.id);
      check('call/initiate: row status is pending', row?.status === 'pending');
    }

    // Clear the still-pending call_requests row from the previous step first — otherwise
    // the busy-check correctly (not a bug) sees this astrologer as occupied.
    if (callRequestId) {
      await db.from('call_requests').update({ status: 'cancelled' }).eq('id', callRequestId);
    }

    // ── POST /api/chat/initiate creates chat_requests ──────────────────────────
    const chatRes = await request('POST', '/api/chat/initiate', {
      token: custToken, body: { astrologerId: astro.id },
    });
    check('chat/initiate: 200', chatRes.status === 200);
    check('chat/initiate: returns requestId', !!chatRes.body?.requestId);
    check('chat/initiate: returns callerId matching real customer id', chatRes.body?.callerId === customer.id);
    chatRequestId = chatRes.body?.requestId;

    if (chatRequestId) {
      const { data: row } = await db.from('chat_requests').select('*').eq('id', chatRequestId).single();
      check('chat/initiate: row actually exists in chat_requests', !!row);
      check('chat/initiate: row has correct caller_id', row?.caller_id === customer.id);
      check('chat/initiate: row has correct receiver_id', row?.receiver_id === astro.id);
    }

    // Re-request while the first is still pending should 409 (busy — pending chat request)
    const dupChatRes = await request('POST', '/api/chat/initiate', {
      token: custToken, body: { astrologerId: astro.id },
    });
    check('chat/initiate: second request while pending -> 409 busy', dupChatRes.status === 409);

    // ── POST /api/chat/message creates chat_messages, works for both roles ────
    const roomId = require('crypto').randomUUID();
    const custMsgRes = await request('POST', '/api/chat/message', {
      token: custToken, body: { roomId, receiverId: astro.id, message: 'hello from customer' },
    });
    check('chat/message (customer token): 200', custMsgRes.status === 200);
    check('chat/message (customer token): returns created row', !!custMsgRes.body?.data?.id);
    check('chat/message (customer token): sender_id is real customer id', custMsgRes.body?.data?.sender_id === customer.id);
    messageId = custMsgRes.body?.data?.id;

    const vendorMsgRes = await request('POST', '/api/chat/message', {
      token: vendorToken, body: { roomId, receiverId: customer.id, message: 'hello from vendor' },
    });
    check('chat/message (vendor token): 200', vendorMsgRes.status === 200);
    check('chat/message (vendor token): sender_id is real astrologer id (not misresolved as customer)', vendorMsgRes.body?.data?.sender_id === astro.id);

    // Cleanup the extra vendor message too
    if (vendorMsgRes.body?.data?.id) {
      await db.from('chat_messages').delete().eq('id', vendorMsgRes.body.data.id);
    }
  } finally {
    if (messageId) await db.from('chat_messages').delete().eq('id', messageId);
    if (chatRequestId) await db.from('chat_requests').delete().eq('id', chatRequestId);
    if (callRequestId) await db.from('call_requests').delete().eq('id', callRequestId);
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
