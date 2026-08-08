// Verifies the 2026-08-08 load-scaling fix: POST /api/chat/message now relays the new
// message over the session's socket room (io.to(sessionId).emit('new_chat_message', data))
// instead of relying solely on a Supabase Realtime subscription, and 'chat_typing' is a
// plain socket passthrough — replacing two per-screen Supabase Realtime connections
// (ChatSessionScreen.js, VendorChatSession.js) with the socket both screens already hold
// for signal_connection/session_ended. See security-audit-2026-08-08.md.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');
const { io: ioClient } = require('socket.io-client');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4503';

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
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve(raw); } });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function waitForEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

async function main() {
  const tag = `chatrelay-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let customer, astro, sessionRow;
  let customerSocket, vendorSocket;

  try {
    const { data: cust } = await db.from('customers').insert([{ name: tag, mobile: `9${randDigits(9)}` }]).select('id').single();
    customer = cust;
    const { data: ast } = await db.from('astrologers').insert([{ first_name: tag, phone_number: `8${randDigits(9)}` }]).select('id').single();
    astro = ast;
    const { data: sess } = await db.from('chat_sessions').insert([{
      caller_id: customer.id, vendor_id: astro.id, per_minute_charge: 10, call_type: 'chat',
      is_active: false, next_billing_at: null,
    }]).select('id').single();
    sessionRow = sess;

    const customerToken = jwt.sign({ id: customer.id, userId: customer.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });
    const vendorToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    customerSocket = ioClient(BASE_URL, { transports: ['websocket'] });
    vendorSocket = ioClient(BASE_URL, { transports: ['websocket'] });
    await Promise.all([
      new Promise((r) => customerSocket.on('connect', r)),
      new Promise((r) => vendorSocket.on('connect', r)),
    ]);
    customerSocket.emit('join_session', sessionRow.id);
    vendorSocket.emit('join_session', sessionRow.id);
    await new Promise((r) => setTimeout(r, 300)); // let the join land server-side

    // ── Vendor sends a message via the real endpoint; customer should receive it over the socket ──
    const vendorMsgWait = waitForEvent(customerSocket, 'new_chat_message');
    const sendResp = await postJson('/api/chat/message', {
      roomId: 'room-x', sessionId: sessionRow.id, receiverId: customer.id, message: 'Hello from vendor',
    }, vendorToken);
    check('send: succeeded', sendResp?.success === true);
    const received = await vendorMsgWait;
    check('customer socket received new_chat_message', !!received);
    check('received message content matches', received?.message === 'Hello from vendor');
    check('received message sender_id is the vendor', received?.sender_id === astro.id);

    // ── Customer replies; vendor should receive it ──
    const customerMsgWait = waitForEvent(vendorSocket, 'new_chat_message');
    await postJson('/api/chat/message', {
      roomId: 'room-x', sessionId: sessionRow.id, receiverId: astro.id, message: 'Hi back',
    }, customerToken);
    const received2 = await customerMsgWait;
    check('vendor socket received the customer reply', !!received2);
    check('reply content matches', received2?.message === 'Hi back');

    // ── Typing relay: customer typing -> vendor sees it, NOT the customer's own socket ──
    const vendorTypingWait = waitForEvent(vendorSocket, 'chat_typing');
    const customerSelfEchoWait = waitForEvent(customerSocket, 'chat_typing', 1500);
    customerSocket.emit('chat_typing', { sessionId: sessionRow.id, isTyping: true });
    const [vendorSawTyping, customerSawOwnTyping] = await Promise.all([vendorTypingWait, customerSelfEchoWait]);
    check('vendor received chat_typing from customer', vendorSawTyping?.isTyping === true);
    check('customer does NOT receive an echo of their own typing event', customerSawOwnTyping === null);

    // ── DB row actually persisted (delivery relies on socket, but the write still happens) ──
    const { count } = await db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('session_id', sessionRow.id);
    check('both messages persisted to chat_messages', (count || 0) === 2);
  } finally {
    if (customerSocket) customerSocket.disconnect();
    if (vendorSocket) vendorSocket.disconnect();
    if (sessionRow) {
      await db.from('chat_messages').delete().eq('session_id', sessionRow.id);
      await db.from('chat_sessions').delete().eq('id', sessionRow.id);
    }
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
