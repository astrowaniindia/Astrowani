// A free call that dropped before it was a conversation must leave the offer OPEN.
//
// Regression check for 2026-11-15: closeFreeCallBooking releases an instant booking whose
// call lasted under MIN_REAL_CALL_SECONDS (status stays 'booked', call_session_id NULL),
// and instantGate honoured that — but GET /api/free-call/offer did not, so it answered
// eligible:false and Home hid the gift bubble. Then, once the 30-minute sweep cancelled
// the row, isNewCustomer() counted the failed FREE session and the customer was "not new"
// for good. 449 customers hit this in the 30 days before the fix.
//
// Drives the REAL route over HTTP with a real JWT against the live database, on a bare
// Express app (index.js is never booted — it would start the billing worker against
// production). Every "blocked" case is paired with an "open" control.
//
//   node --env-file=.env scripts/freeCallReleasedOfferCheck.js [path-to-routes-module]
//
// The optional argument runs the same suite against another copy of freeCallRoutes
// (e.g. HEAD's), which is how this suite was shown to fail on the original bug.
global.WebSocket = global.WebSocket || require('ws');
process.env.FREE_CALL_LOCAL_TEST = 'false';

const express = require('express');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const ROUTES = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '../src/freeCallRoutes');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MOBILE = '9123450004';
const VENDOR_ID = '1f70210e-6234-4f49-a764-13e851968e1e'; // store-reviewer astrologer (hidden)

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

(async () => {
  const { data: existing } = await db.from('customers').select('id').eq('mobile', MOBILE);
  if (existing && existing.length) throw new Error(`QA number ${MOBILE} already has a row — refusing to run`);

  const { data: cust, error: ce } = await db.from('customers')
    .insert({ mobile: MOBILE, name: 'Released Offer QA' }).select('id').single();
  if (ce) throw ce;
  const CID = cust.id;
  const made = { sessions: [], bookings: [] };

  const app = express();
  app.use(express.json());
  require(ROUTES)(app);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const token = jwt.sign({ userId: CID }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const offer = async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/free-call/offer?platform=android`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  };
  const session = async (isFree) => {
    const now = new Date();
    const { data, error } = await db.from('chat_sessions').insert({
      caller_id: CID, vendor_id: VENDOR_ID, is_active: false, is_free: isFree,
      per_minute_charge: 0, call_type: 'audio',
      started_at: new Date(now - 60000).toISOString(), ended_at: now.toISOString(),
    }).select('id').single();
    if (error) throw error;
    made.sessions.push(data.id);
    return data.id;
  };
  const booking = async (patch) => {
    const now = Date.now();
    const { data, error } = await db.from('free_call_bookings').insert({
      customer_id: CID, kind: 'instant', status: 'booked', duration_minutes: 7,
      slot_start: new Date(now).toISOString(), slot_end: new Date(now + 7 * 60000).toISOString(),
      customer_name: 'Released Offer QA', customer_phone: MOBILE, call_attempts: 1, ...patch,
    }).select('id').single();
    if (error) throw error;
    made.bookings.push(data.id);
    return data.id;
  };
  const setBooking = (id, patch) => db.from('free_call_bookings').update(patch).eq('id', id);

  try {
    let o = await offer();
    ok(o.enabled === true, `offer is on in production (mode instant), got enabled=${o.enabled}`);
    ok(o.eligible === true, 'CONTROL: a brand-new customer is eligible');

    // The reported case: a free call that connected and dropped in under 30 seconds.
    const sid = await session(true);
    const bid = await booking({ call_session_id: null, call_attempts: 1 });
    o = await offer();
    ok(o.eligible === true, `a RELEASED free call (dropped, <90s) keeps the offer open, got eligible=${o.eligible}`);
    ok(o.booking === null, `and is not reported as a booking, got ${JSON.stringify(o.booking)}`);

    await setBooking(bid, { call_attempts: 10 });
    o = await offer();
    ok(o.eligible === false, 'out of ring attempts -> closed (the ring would refuse them)');
    await setBooking(bid, { call_attempts: 1 });

    // A call that DID happen: still spends it.
    await setBooking(bid, { call_session_id: sid, status: 'completed', call_duration_seconds: 300 });
    o = await offer();
    ok(o.eligible === false, 'a COMPLETED free call closes the offer');
    ok(!!o.booking, 'and is reported as the booking');

    // After the 30-minute sweep cancels the released row: only the free session is left.
    await setBooking(bid, { call_session_id: null, status: 'cancelled', call_duration_seconds: null });
    o = await offer();
    ok(o.eligible === true, `cancelled + only a FREE session -> still "new", got eligible=${o.eligible}`);

    // Control for isNewCustomer: a real paid consultation still makes them not new.
    await session(false);
    o = await offer();
    ok(o.eligible === false, 'CONTROL: a PAID session still means not a new customer');
  } finally {
    await new Promise((r) => server.close(r));
    if (made.bookings.length) await db.from('free_call_bookings').delete().in('id', made.bookings);
    if (made.sessions.length) await db.from('chat_sessions').delete().in('id', made.sessions);
    await db.from('free_call_invites').delete().eq('customer_id', CID);
    await db.from('customers').delete().eq('id', CID);
    const { data: left } = await db.from('customers').select('id').eq('mobile', MOBILE);
    const { data: lb } = await db.from('free_call_bookings').select('id').eq('customer_id', CID);
    const { data: ls } = await db.from('chat_sessions').select('id').eq('caller_id', CID);
    ok(!left?.length && !lb?.length && !ls?.length, 'teardown: no synthetic rows left');
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message || e); process.exit(2); });
