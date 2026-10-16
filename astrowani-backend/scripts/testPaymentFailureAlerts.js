#!/usr/bin/env node
/**
 * Tests for failed-payment alerting.
 *
 *   node --env-file=.env scripts/testPaymentFailureAlerts.js
 *
 * index.js is NEVER booted — it would start sessionManager's billing worker against
 * the live database. The webhook is mounted on a bare Express app instead.
 *
 * No email is ever sent: mailer.sendAlertEmail is stubbed. No Razorpay call is made:
 * razorpay.listPayments is stubbed. The one real side effect is the digest's state
 * row in app_settings, which the last test writes and then deletes, asserting it is
 * gone.
 *
 * Every "it does NOT alert" case is paired with a case that DOES, because a
 * classifier that returns 'digest' for everything would pass a negative-only suite.
 */
const express = require('express');
const crypto = require('crypto');
const http = require('http');

// LOCAL ONLY. Node 20 has no global WebSocket and @supabase/realtime-js throws at
// import without one. The VPS runs a newer Node, so this belongs in the test runner
// and must never be added to src/ — see the `local-backend-bills-production` note.
// Nothing here uses Realtime; this only gets the client past construction.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');

process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_secret_for_local_only';
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const mailer = require('../src/mailer');
const razorpay = require('../src/razorpay');
const alerts = require('../src/paymentFailureAlerts');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── stubs ───────────────────────────────────────────────────────────────────
let outbox = [];
mailer.sendAlertEmail = async ({ subject, html }) => {
  outbox.push({ subject, html });
  return { sent: true, id: `stub_${outbox.length}` };
};
mailer.isConfigured = () => true;

const failedPayment = (over = {}) => ({
  id: 'pay_TEST1', order_id: 'order_TEST1', amount: 5100, status: 'failed',
  method: 'upi', contact: '+919999999999',
  error_source: 'customer', error_reason: 'payment_timed_out',
  error_description: 'Payment was not completed on time.', ...over,
});

(async () => {
  console.log('\nFailed-payment alerts\n' + '='.repeat(60));

  // ── 1. classification ─────────────────────────────────────────────────────
  console.log('\nclassifyFailure');
  ok('customer timeout -> digest', alerts.classifyFailure(failedPayment()) === 'digest');
  ok('customer invalid pin -> digest',
    alerts.classifyFailure(failedPayment({ error_reason: 'invalid_pin' })) === 'digest');
  ok('business -> digest', alerts.classifyFailure(failedPayment({ error_source: 'business' })) === 'digest');
  // the positive controls — without these the above prove nothing
  ok('gateway -> urgent', alerts.classifyFailure(failedPayment({ error_source: 'gateway' })) === 'urgent');
  ok('bank -> urgent', alerts.classifyFailure(failedPayment({ error_source: 'bank' })) === 'urgent');
  ok('internal -> urgent', alerts.classifyFailure(failedPayment({ error_source: 'internal' })) === 'urgent');
  ok('CUSTOMER (case) -> digest', alerts.classifyFailure(failedPayment({ error_source: 'CUSTOMER' })) === 'digest');
  // unknown must fail TOWARDS telling you
  ok('missing source -> urgent', alerts.classifyFailure({}) === 'urgent');
  ok('unknown source -> urgent', alerts.classifyFailure(failedPayment({ error_source: 'martian' })) === 'urgent');

  console.log('\ndescribeFailure');
  ok('reads like the dashboard',
    alerts.describeFailure(failedPayment()) === 'Customer - payment timed out',
    alerts.describeFailure(failedPayment()));
  ok('falls back to error_code',
    alerts.describeFailure({ error_source: 'gateway', error_code: 'GATEWAY_ERROR' }) === 'Gateway - GATEWAY ERROR');

  // ── 2. immediate alert ────────────────────────────────────────────────────
  console.log('\nhandlePaymentFailed');
  outbox = [];
  let r = await alerts.handlePaymentFailed(failedPayment({ error_source: 'gateway', error_reason: 'payment_failed', method: 'wallet' }));
  ok('gateway failure emails immediately', r.emailed === true && outbox.length === 1);
  ok('subject names the reason and amount',
    outbox[0] && /Gateway/.test(outbox[0].subject) && /51\.00/.test(outbox[0].subject), outbox[0]?.subject);
  ok('body carries the payment id', outbox[0] && outbox[0].html.includes('pay_TEST1'));
  ok('body carries the customer', outbox[0] && outbox[0].html.includes('+919999999999'));

  outbox = [];
  r = await alerts.handlePaymentFailed(failedPayment());
  ok('customer failure sends NO email', r.emailed === false && outbox.length === 0);

  outbox = [];
  mailer.sendAlertEmail = async () => { throw new Error('resend exploded'); };
  r = await alerts.handlePaymentFailed(failedPayment({ error_source: 'gateway' }));
  ok('a throwing mailer never propagates', r.emailed === false && typeof r.error === 'string');
  mailer.sendAlertEmail = async ({ subject, html }) => { outbox.push({ subject, html }); return { sent: true }; };

  // ── 3. IST day maths ──────────────────────────────────────────────────────
  console.log('\nIST day handling');
  // 2026-10-16T18:40Z is 2026-10-17T00:10 IST — the NEXT day in India.
  ok('late-evening UTC is already tomorrow in IST',
    alerts.istDateKey(new Date('2026-10-16T18:40:00Z')) === '2026-10-17',
    alerts.istDateKey(new Date('2026-10-16T18:40:00Z')));
  ok('midday UTC is the same IST day',
    alerts.istDateKey(new Date('2026-10-16T06:00:00Z')) === '2026-10-16');
  const b = alerts.istDayBounds('2026-10-15');
  ok('day starts 00:00 IST = 18:30Z previous day',
    new Date(b.fromUnix * 1000).toISOString() === '2026-10-14T18:30:00.000Z',
    new Date(b.fromUnix * 1000).toISOString());
  ok('window is exactly 24h', b.toUnix - b.fromUnix === 86400);

  // ── 4. digest content ─────────────────────────────────────────────────────
  console.log('\ndigestEmail');
  const d = alerts.digestEmail('2026-10-14', [
    failedPayment({ amount: 5000 }),
    failedPayment({ amount: 5000 }),
    failedPayment({ amount: 10100, error_source: 'gateway', error_reason: 'payment_failed' }),
    failedPayment({ amount: 10000, error_reason: 'invalid_pin' }),
  ]);
  ok('subject counts them all', /4/.test(d.subject), d.subject);
  ok('subject totals the value', /301\.00/.test(d.subject), d.subject);
  ok('groups by reason', /Customer - payment timed out/.test(d.html));
  ok('keeps gateway separate', /Gateway - payment failed/.test(d.html));
  ok('counts the repeated reason as 2', />2</.test(d.html));
  ok('says nobody was charged', /No customer was charged/.test(d.html));

  // The heartbeat. A quiet day MUST still email, or silence is ambiguous between
  // "nothing failed" and "the alerting is dead" — the failure shape this whole
  // week started with.
  const quiet = alerts.digestEmail('2026-10-14', []);
  ok('quiet day still produces an email', Boolean(quiet.subject && quiet.html));
  ok('quiet subject says none', /none/i.test(quiet.subject), quiet.subject);
  ok('quiet body explains a missing email is the alarm',
    /sent every day/i.test(quiet.html) && /has broken/i.test(quiet.html));

  // ── amount mismatch ──────────────────────────────────────────────────────
  console.log('\nalertAmountMismatch');
  outbox = [];
  let mm = await alerts.alertAmountMismatch({
    kind: 'recharge', orderId: 'order_MM', paymentId: 'pay_MM', amountPaise: 12345,
    customerId: 'cust-123',
  });
  ok('recharge mismatch emails', mm.emailed === true && outbox.length === 1);
  ok('subject flags it as needing action', /ACTION NEEDED/.test(outbox[0].subject), outbox[0]?.subject);
  ok('subject carries the charged amount', /123\.45/.test(outbox[0].subject), outbox[0]?.subject);
  ok('body says the customer WAS charged', /has NOT been credited/.test(outbox[0].html));
  ok('body carries the customer id', /cust-123/.test(outbox[0].html));
  ok('body omits the order row it does not have', !/Our order row/.test(outbox[0].html));

  outbox = [];
  mm = await alerts.alertAmountMismatch({
    kind: 'order', orderId: 'order_MM2', paymentId: 'pay_MM2', amountPaise: 50000,
    internalRef: 'row-abc',
  });
  ok('shop mismatch emails', mm.emailed === true && outbox.length === 1);
  ok('shop mismatch names the shop', /Wani Shop order/.test(outbox[0].html));
  ok('shop mismatch carries our order row', /row-abc/.test(outbox[0].html));
  ok('shop mismatch omits the customer id it does not have', !/Customer ID/.test(outbox[0].html));

  // ── 5. the webhook route, over real HTTP ─────────────────────────────────
  console.log('\nPOST /api/razorpay/webhook');
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.startsWith('/api/razorpay/webhook')) req.rawBody = buf;
    },
  }));
  require('../src/razorpayWebhookRoutes')(app);
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;

  const post = async (bodyObj, { sign = true, path = '/api/razorpay/webhook', secret = SECRET } = {}) => {
    const body = JSON.stringify(bodyObj);
    const headers = { 'Content-Type': 'application/json' };
    if (sign) headers['x-razorpay-signature'] = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers, body });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const ALERTS = require('../src/razorpayWebhookRoutes').ALERTS_PATH;
  const failedEvent = (over) => ({ event: 'payment.failed', payload: { payment: { entity: failedPayment(over) } } });

  outbox = [];
  let res = await post(failedEvent({ error_source: 'gateway' }));
  ok('gateway failure -> 200', res.status === 200, JSON.stringify(res.json));
  ok('gateway failure -> classified urgent', res.json.alert === 'urgent', JSON.stringify(res.json));
  ok('gateway failure -> one email', outbox.length === 1);

  outbox = [];
  res = await post(failedEvent());
  ok('customer failure -> 200', res.status === 200);
  ok('customer failure -> classified digest', res.json.alert === 'digest');
  ok('customer failure -> no email', outbox.length === 0);

  outbox = [];
  res = await post(failedEvent({ error_source: 'gateway' }), { sign: false });
  ok('unsigned failure event refused 400', res.status === 400, JSON.stringify(res.json));
  ok('unsigned failure event sends nothing', outbox.length === 0);

  // positive control: the pre-existing path must still work. Without this, the
  // whole suite would pass even if adding payment.failed broke crediting.
  res = await post({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_NOPE', order_id: 'order_NOPE', amount: 100 } } } });
  ok('payment.captured still handled (unknown order acknowledged)',
    res.status === 200 && res.json.ok === true, JSON.stringify(res.json));

  res = await post({ event: 'refund.created', payload: {} });
  ok('unrelated event acknowledged, not alerted',
    res.status === 200 && res.json.ignored === 'refund.created', JSON.stringify(res.json));

  // ── the separate alerts webhook ──────────────────────────────────────────
  // It exists so payment.failed could be subscribed WITHOUT editing the money
  // webhook, whose edit form re-presents the secret blank.
  console.log('\nPOST /api/razorpay/webhook/alerts');
  ok('path is the expected one', ALERTS === '/api/razorpay/webhook/alerts', ALERTS);

  outbox = [];
  res = await post(failedEvent({ error_source: 'gateway' }), { path: ALERTS });
  ok('alerts path accepts the shared secret', res.status === 200 && res.json.alert === 'urgent', JSON.stringify(res.json));
  ok('alerts path emails', outbox.length === 1);

  outbox = [];
  res = await post(failedEvent(), { path: ALERTS });
  ok('alerts path digests a customer failure', res.status === 200 && res.json.alert === 'digest');
  ok('alerts path sends no email for that', outbox.length === 0);

  outbox = [];
  res = await post(failedEvent({ error_source: 'gateway' }), { path: ALERTS, sign: false });
  ok('alerts path refuses an unsigned call', res.status === 400);
  ok('alerts path sends nothing when unsigned', outbox.length === 0);

  // Its own secret, when Razorpay's create form was given a fresh one.
  process.env.RAZORPAY_WEBHOOK_SECRET_ALERTS = 'a_different_secret_entirely';
  outbox = [];
  res = await post(failedEvent({ error_source: 'gateway' }), { path: ALERTS, secret: 'a_different_secret_entirely' });
  ok('alerts path accepts its OWN secret when set', res.status === 200 && res.json.alert === 'urgent', JSON.stringify(res.json));
  res = await post(failedEvent({ error_source: 'gateway' }), { path: ALERTS, secret: SECRET });
  ok('alerts path then REJECTS the money secret', res.status === 400, JSON.stringify(res.json));
  // the money webhook must be unaffected by that variable existing at all
  res = await post({ event: 'refund.created', payload: {} }, { secret: SECRET });
  ok('money webhook still uses its own secret', res.status === 200, JSON.stringify(res.json));
  res = await post({ event: 'refund.created', payload: {} }, { secret: 'a_different_secret_entirely' });
  ok('money webhook rejects the alerts secret', res.status === 400);
  delete process.env.RAZORPAY_WEBHOOK_SECRET_ALERTS;

  res = await post(failedEvent({ error_source: 'gateway' }), { path: ALERTS, secret: SECRET });
  ok('falls back to the shared secret when unset again', res.status === 200, JSON.stringify(res.json));

  server.close();

  // ── 6. digest scheduling ─────────────────────────────────────────────────
  console.log('\nrunDigestIfDue');
  mailer.isConfigured = () => false;
  r = await alerts.runDigestIfDue(new Date('2026-10-16T06:00:00Z'));
  ok('silent when email is not configured', r.ran === false && r.reason === 'not_configured');
  mailer.isConfigured = () => true;

  // The local .env has no Razorpay keys (they live only on the VPS), so without this
  // the configured-check short-circuits and the hour test would pass for the wrong
  // reason — it would never reach the hour check at all.
  const realRzpConfigured = razorpay.isConfigured;
  razorpay.isConfigured = () => true;

  // 02:00Z = 07:30 IST, before the 09:00 IST send hour. Getting 'too_early' rather
  // than 'not_configured' is itself the proof that it cleared the configured gate.
  r = await alerts.runDigestIfDue(new Date('2026-10-16T02:00:00Z'));
  ok('does not send before 09:00 IST', r.ran === false && r.reason === 'too_early', JSON.stringify(r));

  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const cleanup = async () => { await db.from('app_settings').delete().eq('key', alerts.DIGEST_STATE_KEY); };
  await cleanup();

  const realList = razorpay.listPayments;
  razorpay.listPayments = async () => ([
    { id: 'p1', status: 'failed', amount: 5000, error_source: 'customer', error_reason: 'payment_timed_out' },
    { id: 'p2', status: 'captured', amount: 9900 },
    { id: 'p3', status: 'failed', amount: 10100, error_source: 'gateway', error_reason: 'payment_failed' },
  ]);
  razorpay.isConfigured = () => true;

  outbox = [];
  // 05:00Z = 10:30 IST, after the send hour
  r = await alerts.runDigestIfDue(new Date('2026-10-16T05:00:00Z'));
  ok('sends after 09:00 IST', r.ran === true && r.emailed === true, JSON.stringify(r));
  ok('counts only the failed ones', r.failures === 2, JSON.stringify(r));
  ok('digest email went out', outbox.length === 1);
  ok('digest covers the previous IST day', outbox[0] && /2026-10-15/.test(outbox[0].subject), outbox[0]?.subject);

  outbox = [];
  r = await alerts.runDigestIfDue(new Date('2026-10-16T05:30:00Z'));
  ok('does not send twice for the same day', r.ran === false && r.reason === 'already_sent', JSON.stringify(r));
  ok('no second email', outbox.length === 0);

  // A day with NOTHING to report must still send — the heartbeat, end to end.
  await cleanup();
  razorpay.listPayments = async () => ([{ id: 'p9', status: 'captured', amount: 100 }]);
  outbox = [];
  r = await alerts.runDigestIfDue(new Date('2026-10-16T05:00:00Z'));
  ok('quiet day still runs', r.ran === true && r.failures === 0, JSON.stringify(r));
  ok('quiet day STILL emails', r.emailed === true && outbox.length === 1, JSON.stringify(r));
  ok('quiet email says none', /none/i.test(outbox[0].subject), outbox[0]?.subject);

  razorpay.listPayments = realList;
  razorpay.isConfigured = realRzpConfigured;
  await cleanup();
  const { data: left } = await db.from('app_settings').select('key').eq('key', alerts.DIGEST_STATE_KEY);
  ok('teardown removed the test state row', !left || left.length === 0);

  console.log('\n' + '='.repeat(60));
  console.log(`${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
