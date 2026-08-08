// Verifies the 2026-08-08 fix for the join_room impersonation gap (see
// security-audit-2026-08-08.md, "socket-level auth gap"). Before this fix, join_room(userId)
// trusted the client-supplied id with zero verification — anyone who knew/guessed a customer
// or astrologer UUID could join that user's personal room and silently receive their
// incoming_call/call_accepted/session_ended/new_notification/new_chat_message events.
//
// Probes against a REAL production code path (io.to(astrologerId).emit('incoming_call', ...)
// from /api/call/initiate) rather than a synthetic event, so this exercises exactly what an
// attacker would have exploited:
//   1. A socket with a valid token and its OWN real id still receives incoming_call
//      (legitimate flow unaffected — regression check).
//   2. A socket with NO auth token, claiming the astrologer's real id, receives nothing.
//   3. A socket holding an unrelated customer's real token, claiming the astrologer's id,
//      receives nothing (the eavesdrop this bug enabled is closed).
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

function waitForEvent(socket, event, timeoutMs = 3000) {
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
      (res) => { let raw = ''; res.on('data', (c) => (raw += c)); res.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve(raw); } }); },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const tag = `joinroomauth-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let astro, callerCustomer, outsiderCustomer;
  const sockets = [];

  try {
    const { data: ast } = await db.from('astrologers').insert([{
      first_name: tag, phone_number: `8${randDigits(9)}`,
      approval_status: 'approved', is_call_enabled: true, is_available: false,
      call_charge_per_minute: 1,
    }]).select('id').single();
    astro = ast;
    const { data: caller } = await db.from('customers').insert([{ name: `${tag}-caller`, mobile: `9${randDigits(9)}`, wallet_balance: 1000 }]).select('id').single();
    callerCustomer = caller;
    const { data: outsider } = await db.from('customers').insert([{ name: `${tag}-outsider`, mobile: `9${randDigits(9)}` }]).select('id').single();
    outsiderCustomer = outsider;

    const astroToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
    const outsiderToken = jwt.sign({ id: outsiderCustomer.id, userId: outsiderCustomer.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });
    const callerToken = jwt.sign({ id: callerCustomer.id, userId: callerCustomer.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });

    // Legit: the real astrologer, real token, real id.
    const legitSocket = await connect(astroToken);
    sockets.push(legitSocket);
    legitSocket.emit('join_room', astro.id);

    // Attack 1: no token at all, guessed the astrologer's real UUID.
    const noAuthSocket = await connect(null);
    sockets.push(noAuthSocket);
    noAuthSocket.emit('join_room', astro.id);

    // Attack 2: a real but unrelated customer's token, claiming the astrologer's id.
    const outsiderSocket = await connect(outsiderToken);
    sockets.push(outsiderSocket);
    outsiderSocket.emit('join_room', astro.id);

    await new Promise((r) => setTimeout(r, 300)); // let the joins land server-side

    const legitWait = waitForEvent(legitSocket, 'incoming_call');
    const noAuthWait = waitForEvent(noAuthSocket, 'incoming_call');
    const outsiderWait = waitForEvent(outsiderSocket, 'incoming_call');

    const initiateResp = await postJson('/api/call/initiate', { receiverId: astro.id, callType: 'audio', callerRole: 'customer' }, callerToken);
    check('call/initiate succeeded (sanity check on the test harness itself)',
      !!(initiateResp?.data?.roomId || initiateResp?.roomId));

    const [legitGot, noAuthGot, outsiderGot] = await Promise.all([legitWait, noAuthWait, outsiderWait]);

    check('astrologer with valid token + own id DOES receive incoming_call (legit path unaffected)', !!legitGot);
    check('socket with NO token does NOT receive incoming_call for the astrologer room', noAuthGot === null);
    check('socket with an unrelated customer token claiming the astrologer id does NOT receive incoming_call', outsiderGot === null);
  } finally {
    sockets.forEach((s) => { try { s.disconnect(); } catch (_) {} });
    if (astro) {
      await db.from('call_requests').delete().eq('astrologer_id', astro.id);
      await db.from('astrologers').delete().eq('id', astro.id);
    }
    if (callerCustomer) await db.from('customers').delete().eq('id', callerCustomer.id);
    if (outsiderCustomer) await db.from('customers').delete().eq('id', outsiderCustomer.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
