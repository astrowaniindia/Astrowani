// Verifies the 2026-11-13 socket relay authorisation in index.js.
//
//   PORT=4597 node --env-file=.env scripts/devServer.js      (in another terminal)
//   SOCKET_URL=http://localhost:4597 node --env-file=.env scripts/socketRelayAuthCheck.js
//
// NEVER point this at a backend whose index.js was booted directly — devServer.js keeps
// the billing worker off (ENABLE_SESSION_MANAGER unset). Tokens are signed with the
// LOCAL JWT_SECRET, so against production they are simply refused.
//
// Uses only the store-reviewer accounts (9999999999 is both a customer and an
// astrologer). It creates ONE call_requests row (status 'cancelled', so no sweep or
// ring touches it) and ONE chat_sessions row (is_active false, rate 0, billing a day
// away), and deletes both at the end and asserts it.
//
// Every "was NOT delivered" check is paired with a positive control that the same
// listener DOES receive a legitimate event, or a dead socket would pass them all.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SOCKET_URL || 'http://localhost:4597';
if (/astrowani\.com/.test(URL)) { console.error('Refusing to run against production.'); process.exit(2); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CUST = '2e23b19d-3221-42bd-b967-2dcc9dd8cbbd';
const ASTRO = '1f70210e-6234-4f49-a764-13e851968e1e';
const custTok = jwt.sign({ id: CUST, userId: CUST, phone: '9999999999', role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '10m' });
const astroTok = jwt.sign({ id: ASTRO, userId: ASTRO, phone: '9999999999', role: 'astrologer' }, process.env.JWT_SECRET, { expiresIn: '10m' });

let pass = 0; let fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, extra ?? ''); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(URL, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const recorder = (sock, events) => {
  const got = {};
  for (const e of events) sock.on(e, (d) => { (got[e] = got[e] || []).push(d); });
  return { got, clear: () => { for (const k of Object.keys(got)) delete got[k]; } };
};
const joinSession = (sock, sid) => new Promise((resolve) => sock.emit('join_session', sid, resolve));

(async () => {
  let reqId = null; let sessId = null; const socks = [];
  try {
    const victim = await connect(custTok); socks.push(victim);
    const astro = await connect(astroTok); socks.push(astro);
    const anon = await connect(null); socks.push(anon);
    const custRec = recorder(victim, ['webrtc_offer', 'webrtc_ready', 'webrtc_ice_candidate', 'call_accepted',
      'call_rejected', 'live_offer', 'live_gift', 'live_ended', 'chat_typing', 'video_paused']);
    const astroRec = recorder(astro, ['call_cancelled', 'incoming_call', 'webrtc_answer']);
    victim.emit('join_room', CUST);
    astro.emit('join_room', ASTRO);
    await sleep(1500);

    console.log('\n— before any request exists between them');
    anon.emit('webrtc_offer', { sessionId: CUST, sdp: 'PROBE' });
    anon.emit('webrtc_ice_candidate', { sessionId: CUST, candidate: 'PROBE' });
    anon.emit('live_offer', { viewerId: CUST, sessionId: '00000000-0000-0000-0000-000000000000', offer: 'PROBE' });
    anon.emit('chat_typing', { sessionId: CUST, isTyping: true });
    anon.emit('video_paused', { sessionId: CUST, paused: true });
    astro.emit('accept_call', { customer_id: CUST, sessionId: 'PROBE' });
    astro.emit('reject_call', { customer_id: CUST, requestId: 'PROBE' });
    victim.emit('cancel_call', { astrologer_id: ASTRO, requestId: 'PROBE' });
    victim.emit('initiate_call', { astrologer_id: ASTRO, callerName: 'PROBE' });
    await sleep(2500);
    ok('no-login socket cannot inject webrtc_offer into a user room', !custRec.got.webrtc_offer);
    ok('no-login socket cannot inject ICE candidates', !custRec.got.webrtc_ice_candidate);
    ok('no-login socket cannot send live_offer', !custRec.got.live_offer);
    ok('no-login socket cannot fake "typing"', !custRec.got.chat_typing);
    ok('no-login socket cannot fake "video paused"', !custRec.got.video_paused);
    ok('astrologer with NO request cannot send "call accepted"', !custRec.got.call_accepted);
    ok('astrologer with NO request cannot send "astrologer busy"', !custRec.got.call_rejected);
    ok('customer with NO request cannot cancel an astrologer\'s incoming call', !astroRec.got.call_cancelled);
    ok('customer with NO request cannot ring an astrologer', !astroRec.got.incoming_call);

    console.log('\n— live stream: viewer joins, outsiders try to fake gifts / end it');
    const LIVE = '00000000-0000-4000-8000-000000000001';
    victim.emit('live_join', { sessionId: LIVE, astrologerId: ASTRO, viewerId: CUST });
    await sleep(800);
    anon.emit('live_gift', { sessionId: LIVE, name: 'PROBE', giftName: 'Crown', amount: 5000 });
    victim.emit('end_live', { sessionId: LIVE });
    anon.emit('end_live', { sessionId: LIVE });
    await sleep(1500);
    ok('nobody can broadcast a fake gift', !custRec.got.live_gift);
    ok('a non-host cannot end a stream for its viewers', !custRec.got.live_ended);

    console.log('\n— a real request now exists between them (positive controls)');
    const { data: rq, error: rqErr } = await db.from('call_requests').insert([{
      customer_id: CUST, astrologer_id: ASTRO, call_type: 'audio', status: 'cancelled',
      customer_name: 'socketRelayAuthCheck',
    }]).select('id').single();
    if (rqErr) throw rqErr;
    reqId = rq.id;
    astro.emit('accept_call', { customer_id: CUST, sessionId: 'CONTROL' });
    astro.emit('reject_call', { customer_id: CUST, requestId: 'CONTROL' });
    await sleep(2500);
    ok('CONTROL the requested astrologer CAN send "call accepted"', (custRec.got.call_accepted || []).length === 1, custRec.got.call_accepted);
    ok('CONTROL the requested astrologer CAN send "busy"', (custRec.got.call_rejected || []).length === 1);

    console.log('\n— inside a real session');
    const { data: se, error: seErr } = await db.from('chat_sessions').insert([{
      caller_id: CUST, vendor_id: ASTRO, is_active: false, per_minute_charge: 0,
      next_billing_at: new Date(Date.now() + 86400000).toISOString(), started_at: new Date().toISOString(),
    }]).select('id').single();
    if (seErr) throw seErr;
    sessId = se.id;
    const j = await joinSession(victim, sessId);
    ok('CONTROL the customer joins its own session', j && j.ok, j);
    custRec.clear();
    // The astrologer has NOT joined yet — the normal race at call start.
    astro.emit('webrtc_ready', { sessionId: sessId });
    await sleep(2000);
    ok('CONTROL a participant that has not joined yet still reaches the other side', (custRec.got.webrtc_ready || []).length === 1);
    astro.emit('webrtc_offer', { sessionId: sessId, sdp: 'CONTROL' });
    astro.emit('chat_typing', { sessionId: sessId, isTyping: true });
    await sleep(1500);
    ok('CONTROL participant webrtc_offer delivered', (custRec.got.webrtc_offer || []).length === 1);
    ok('CONTROL participant typing delivered', (custRec.got.chat_typing || []).length === 1);
    victim.emit('webrtc_answer', { sessionId: sessId, sdp: 'CONTROL' });
    // the astrologer only receives session-room events once it is in the room; the
    // webrtc_ready above joined it through the slow path.
    await sleep(1500);
    ok('CONTROL the answer reaches the astrologer', (astroRec.got.webrtc_answer || []).length === 1);

    custRec.clear();
    anon.emit('webrtc_offer', { sessionId: sessId, sdp: 'PROBE' });
    const outsider = await connect(jwt.sign({ id: '00000000-0000-4000-8000-0000000000aa', userId: '00000000-0000-4000-8000-0000000000aa', phone: '9000000001' }, process.env.JWT_SECRET));
    socks.push(outsider);
    outsider.emit('webrtc_offer', { sessionId: sessId, sdp: 'PROBE' });
    outsider.emit('webrtc_ice_candidate', { sessionId: sessId, candidate: 'PROBE' });
    await sleep(2000);
    ok('no-login socket cannot inject into a real session', !custRec.got.webrtc_offer);
    ok('a logged-in NON-participant cannot inject into a real session', !custRec.got.webrtc_offer && !custRec.got.webrtc_ice_candidate);
  } catch (e) {
    fail++; console.log('  FAIL threw:', e.message || e);
  } finally {
    for (const s of socks) { try { s.disconnect(); } catch (_) {} }
    if (sessId) await db.from('chat_sessions').delete().eq('id', sessId);
    if (reqId) await db.from('call_requests').delete().eq('id', reqId);
    const [{ data: a }, { data: b }] = await Promise.all([
      sessId ? db.from('chat_sessions').select('id').eq('id', sessId) : { data: [] },
      reqId ? db.from('call_requests').select('id').eq('id', reqId) : { data: [] },
    ]);
    ok('teardown: fixtures removed', !(a || []).length && !(b || []).length);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
