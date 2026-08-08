// Verifies the 2026-08-08 fix for the chat room-membership injection (see
// security-audit-2026-08-08.md, "a logged-in user can inject a message into a chat room they
// are not part of"). Before this fix:
//   - socket.on('join_session', sessionId) had zero ownership check — any socket could join
//     any session's room by guessing/enumerating its id and silently receive
//     new_chat_message/chat_typing/signal_connection/session_ended events meant for others.
//   - POST /api/chat/message never checked that the authenticated sender was actually
//     caller_id or vendor_id on the target session, so an attacker with any valid account
//     could insert (and live-broadcast) a message into a session between two other people.
//
// Confirms both are now closed, and that the two legitimate participants are unaffected.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');
const { io: ioClient } = require('socket.io-client');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4504';

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

function connect(token) {
  return new Promise((resolve) => {
    const socket = ioClient(BASE_URL, { transports: ['websocket'], auth: token ? { token } : {} });
    socket.on('connect', () => resolve(socket));
  });
}

function waitForEvent(socket, event, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
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

async function main() {
  const tag = `roommembership-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let customer, astro, attacker, sessionRow;
  const sockets = [];

  try {
    const { data: cust } = await db.from('customers').insert([{ name: `${tag}-cust`, mobile: `9${randDigits(9)}` }]).select('id').single();
    customer = cust;
    const { data: ast } = await db.from('astrologers').insert([{ first_name: `${tag}-astro`, phone_number: `8${randDigits(9)}` }]).select('id').single();
    astro = ast;
    const { data: atk } = await db.from('customers').insert([{ name: `${tag}-attacker`, mobile: `9${randDigits(9)}` }]).select('id').single();
    attacker = atk;
    const { data: sess } = await db.from('chat_sessions').insert([{
      caller_id: customer.id, vendor_id: astro.id, per_minute_charge: 10, call_type: 'chat',
      is_active: false, next_billing_at: null,
    }]).select('id').single();
    sessionRow = sess;

    const customerToken = jwt.sign({ id: customer.id, userId: customer.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });
    const attackerToken = jwt.sign({ id: attacker.id, userId: attacker.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });

    const customerSocket = await connect(customerToken);
    sockets.push(customerSocket);
    customerSocket.emit('join_session', sessionRow.id);

    const attackerSocket = await connect(attackerToken);
    sockets.push(attackerSocket);
    attackerSocket.emit('join_session', sessionRow.id); // attacker has a real account, but is not in this session
    await new Promise((r) => setTimeout(r, 300));

    // ── 1. Injection via HTTP: attacker POSTs a message into someone else's session ──
    const injectResp = await postJson('/api/chat/message', {
      roomId: 'room-x', sessionId: sessionRow.id, receiverId: customer.id, message: 'INJECTED',
    }, attackerToken);
    check('attacker POST to a session they are not part of is rejected (403)', injectResp.status === 403);
    check('attacker POST response indicates non-participant', injectResp.body?.success === false);

    const { count: injectedCount } = await db.from('chat_messages')
      .select('id', { count: 'exact', head: true }).eq('session_id', sessionRow.id).eq('message', 'INJECTED');
    check('no INJECTED row was persisted', (injectedCount || 0) === 0);

    // ── 2. Eavesdrop via socket: attacker's join_session should not have seated them in the room ──
    const attackerEavesdropWait = waitForEvent(attackerSocket, 'new_chat_message');
    const legitSendResp = await postJson('/api/chat/message', {
      roomId: 'room-x', sessionId: sessionRow.id, receiverId: astro.id, message: 'Real message',
    }, customerToken);
    check('legitimate participant can still send', legitSendResp.status === 200 && legitSendResp.body?.success === true);
    const attackerHeard = await attackerEavesdropWait;
    check('attacker (joined but not a participant) does NOT receive the real message', attackerHeard === null);

    // ── 3. Regression: the legit customer socket DOES receive it (real path unaffected) ──
    // (customerSocket sent the message itself, so instead verify it can receive messages
    // by having the astrologer side reply through a properly-joined socket.)
    const astroToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
    const astroSocket = await connect(astroToken);
    sockets.push(astroSocket);
    astroSocket.emit('join_session', sessionRow.id);
    await new Promise((r) => setTimeout(r, 300));

    const customerHearsReplyWait = waitForEvent(customerSocket, 'new_chat_message');
    await postJson('/api/chat/message', { roomId: 'room-x', sessionId: sessionRow.id, receiverId: customer.id, message: 'Vendor reply' }, astroToken);
    const customerHeard = await customerHearsReplyWait;
    check('legit customer DOES receive the vendor reply (real path unaffected)', customerHeard?.message === 'Vendor reply');
  } finally {
    sockets.forEach((s) => { try { s.disconnect(); } catch (_) {} });
    if (sessionRow) {
      await db.from('chat_messages').delete().eq('session_id', sessionRow.id);
      await db.from('chat_sessions').delete().eq('id', sessionRow.id);
    }
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (attacker) await db.from('customers').delete().eq('id', attacker.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
