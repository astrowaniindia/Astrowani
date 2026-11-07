#!/usr/bin/env node
// Verification for the notification platform.
//
//   node --env-file=.env scripts/notificationPlatformCheck.js
//
// WHAT IT DOES AND DOES NOT DO
//
// * `index.js` is NEVER booted. Only the notification routes are mounted on a
//   bare Express app, on an EPHEMERAL port, so there is no billing worker running
//   against production and no EADDRINUSE to mistake for a product failure.
// * `sendPush` is STUBBED before sender.js is ever required, so not one real
//   notification leaves the building. The stub returns FCM-shaped per-token
//   responses, which is what the sender reads, so the delivery accounting is still
//   exercised for real.
// * It drives the REAL HTTP routes with REAL signed JWTs, not the modules, because
//   a harness that only calls your own helper proves the helper and not the
//   delivery path.
// * It works on ONE synthetic customer on a no-SMS QA number, and every campaign
//   names that customer explicitly in target_ids. A campaign resolved by filter
//   would resolve to the whole customer base.
// * Every refusal is preceded by a POSITIVE CONTROL. A governor that held
//   everybody back would otherwise pass every "was suppressed" assertion.
// * Teardown is asserted, not assumed.

const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

// Node 20 has no global WebSocket and @supabase/realtime-js reaches for one at
// import. Without this every Supabase client in this process comes back NULL and
// the whole suite passes vacuously — which is the single most dangerous way for a
// test run to be green. There is an explicit assertion for it below.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* asserted below */ }
}

const QA_PHONE = '9123450002';
// A second no-SMS QA number for the astrologer half. Kept distinct from QA_PHONE on
// purpose: one number can be BOTH a customer and an astrologer in this database (the
// store-reviewer account is), and several of the refusals below turn on which of the
// two a token resolves to — so sharing a number would make those assertions
// meaningless.
const QA_ASTRO_PHONE = '9123450003';
const JWT_SECRET = process.env.JWT_SECRET;

let pass = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`);
  }
}
function section(title) { console.log(`\n── ${title}`); }

// ── the push stub, installed BEFORE sender.js reads it ──────────────────────
// sender.js destructures `sendPush` at require time, so patching the property on
// the already-cached push module is only effective while this happens first.
const pushModule = require('../src/push');
const pushLog = [];
let pushShouldFail = false;
pushModule.sendPush = async (tokens, opts) => {
  const list = Array.isArray(tokens) ? tokens : [tokens];
  pushLog.push({ tokens: list, opts });
  return {
    successCount: pushShouldFail ? 0 : list.length,
    failureCount: pushShouldFail ? list.length : 0,
    responses: list.map(() => (pushShouldFail
      ? { success: false, error: { code: 'messaging/internal-error' } }
      : { success: true })),
  };
};

const { db } = require('../src/notifications/db');
const devices = require('../src/notifications/devices');
const targeting = require('../src/notifications/targeting');
const sender = require('../src/notifications/sender');
const automations = require('../src/notifications/automations');
// Deliberately NOT named `inApp`: section 4 declares a local
// `const { data: inApp }` for the campaign's in-app rows, which shadows a module
// of that name everywhere inside main(). The first run of these checks died on
// `inApp.recordInApp is not a function` for exactly that reason, and the module
// was fine — the collision was invisible because both names read correctly.
const inAppRecord = require('../src/notifications/inApp');

const client = db();

// ── HTTP helpers ────────────────────────────────────────────────────────────
let base;
function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`${base}${path}`, {
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (_) { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const adminToken = () => jwt.sign({ role: 'admin', email: 'check@local' }, JWT_SECRET, { expiresIn: '10m' });
// Carries `userId` as well as the phone claim, because a REAL customer token does
// — index.js mints both — and a fixture without it cannot exercise the guard in
// vendorFromReq at all. Verified: with the uuid claim present, loosening that guard
// to accept any uuid-shaped id makes the "a CUSTOMER token cannot register an
// astrologer device" check fail, which is the only reason that check is worth
// having. Without it the check passed against a deliberately broken guard.
const customerToken = () => jwt.sign(
  customerId ? { phone: QA_PHONE, userId: customerId } : { phone: QA_PHONE },
  JWT_SECRET, { expiresIn: '10m' },
);
const astrologerToken = () => jwt.sign({ role: 'astrologer', astroId: '00000000-0000-0000-0000-000000000001' }, JWT_SECRET, { expiresIn: '10m' });
// The REAL synthetic astrologer, once it exists. A separate helper because the one
// above is deliberately a stranger's token, used to prove a refusal.
let qaAstroId = null;
let customerId = null;
const qaAstrologerToken = () => jwt.sign({ role: 'astrologer', astroId: qaAstroId }, JWT_SECRET, { expiresIn: '10m' });

async function main() {
  section('preconditions');
  ok('JWT_SECRET is set', !!JWT_SECRET);
  // THE assertion that stops a vacuous pass: with no client, every module here
  // returns early and does nothing, while reporting success.
  ok('Supabase service-role client was created (ws shim worked)', !!client);
  if (!client) throw new Error('no Supabase client — install `ws` or check SUPABASE_* env');

  const { data: existing } = await client.from('customers').select('id').eq('mobile', QA_PHONE).maybeSingle();
  ok(`QA number ${QA_PHONE} is free`, !existing, existing?.id);
  if (existing) throw new Error(`${QA_PHONE} already exists — refusing to touch a row this script did not create`);

  const { data: existingAstro } = await client.from('astrologers').select('id').eq('phone_number', QA_ASTRO_PHONE).maybeSingle();
  ok(`QA astrologer number ${QA_ASTRO_PHONE} is free`, !existingAstro, existingAstro?.id);
  if (existingAstro) throw new Error(`${QA_ASTRO_PHONE} already exists — refusing to touch a row this script did not create`);

  // ── the app under test ────────────────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.locals.io = null; // a missing io must not stop a push
  // BOTH modules, in the order index.js registers them. This matters: the two
  // share the /api/admin/notifications/* prefix, Express serves whichever was
  // registered first, and mounting only the new one would hide exactly that class
  // of bug — which it did, until the old module's POST .../preview was found
  // shadowing the new one's.
  require('../src/notificationRoutes')(app);
  require('../src/notifications/routes')(app);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`  (bare Express on ${base} — index.js never booted)`);

  const createdCampaigns = [];

  try {
    // ════════════════════════════════════════════════ 1. the synthetic customer
    section('the synthetic customer');
    const { data: made, error: mkErr } = await client.from('customers')
      .insert([{ name: 'Notification Check', mobile: QA_PHONE, wallet_balance: 0 }])
      .select('id');
    if (mkErr) throw mkErr;
    customerId = made[0].id;
    ok('created', !!customerId);

    const reachBefore = await devices.reachSummary();
    ok('reach summary answers', !!reachBefore && reachBefore.live_customers > 0, reachBefore);

    // ════════════════════════════════════════════════ 2. devices + permission
    section('device and permission registration');

    let r = await request('POST', '/api/notifications/device', { body: { deviceId: 'd1' } });
    ok('unauthenticated device registration is refused', r.status === 401, r.status);

    r = await request('POST', '/api/notifications/device', { token: customerToken(), body: {} });
    ok('a device with no deviceId is refused', r.status === 400, r.status);

    // POSITIVE CONTROL: the granted case must work before any refusal means anything.
    r = await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: {
        deviceId: 'phone-a', fcmToken: 'tok-aaaaaaaa1111', platform: 'android',
        appVersion: '24.1', locale: 'hi', permissionStatus: 'granted', permissionAsked: true,
      },
    });
    ok('granted device registers', r.status === 200 && r.body.reachable === true, r.body);

    let { data: devRows } = await client.from('customer_devices').select('*').eq('customer_id', customerId);
    const devA = devRows.find((d) => d.device_id === 'phone-a');
    ok('device row has the platform', devA?.platform === 'android', devA?.platform);
    ok('device row has the LOCALE — nothing recorded this before', devA?.locale === 'hi', devA?.locale);
    ok('permission_asked_at was stamped', !!devA?.permission_asked_at);
    ok('permission_decided_at was stamped', !!devA?.permission_decided_at);

    const { data: cust1 } = await client.from('customers').select('fcm_token').eq('id', customerId).maybeSingle();
    ok('legacy customers.fcm_token is kept in step (25 push sites read it)', cust1.fcm_token === 'tok-aaaaaaaa1111', cust1.fcm_token);

    // A DENIAL — the state that was previously impossible to record at all.
    r = await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: { deviceId: 'phone-b', platform: 'ios', permissionStatus: 'denied', permissionAsked: true },
    });
    ok('a denied device registers, and is not reachable', r.status === 200 && r.body.reachable === false, r.body);

    // A second phone for the same person.
    r = await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: { deviceId: 'phone-c', fcmToken: 'tok-cccccccc3333', platform: 'android', permissionStatus: 'granted' },
    });
    ok('a second reachable phone registers', r.status === 200 && r.body.reachable === true);

    const live = await devices.liveDevicesFor([customerId]);
    ok('BOTH live tokens are returned for one person', live.get(customerId)?.tokens.length === 2, live.get(customerId)?.tokens);
    ok('the denied device is NOT in the live set', !live.get(customerId)?.tokens.includes('tok-bbbb'), live.get(customerId)?.tokens);

    // A token on a device whose permission was denied must NOT restore the legacy
    // primary — that is exactly the over-reporting this table exists to end.
    await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: { deviceId: 'phone-b', fcmToken: 'tok-dddddddd4444', permissionStatus: 'denied' },
    });
    const { data: cust2 } = await client.from('customers').select('fcm_token').eq('id', customerId).maybeSingle();
    ok('a DENIED device does not become the primary token', cust2.fcm_token !== 'tok-dddddddd4444', cust2.fcm_token);

    // 'blocked' is a different state from 'denied' and must survive a round trip.
    await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: { deviceId: 'phone-c', permissionStatus: 'blocked' },
    });
    ({ data: devRows } = await client.from('customer_devices').select('*').eq('customer_id', customerId));
    ok('blocked is stored distinctly from denied',
      devRows.find((d) => d.device_id === 'phone-c')?.permission_status === 'blocked');

    // An astrologer token must not be able to register a device for the customer
    // who happens to share the phone number.
    r = await request('POST', '/api/notifications/device', {
      token: astrologerToken(),
      body: { deviceId: 'hijack', fcmToken: 'tok-x', permissionStatus: 'granted' },
    });
    ok('an astrologer token is refused', r.status === 401, r.status);

    // Put phone-c back to granted for the send tests.
    await request('POST', '/api/notifications/device', {
      token: customerToken(),
      body: { deviceId: 'phone-c', fcmToken: 'tok-cccccccc3333', permissionStatus: 'granted' },
    });

    const reachAfter = await devices.reachSummary();
    ok('reach summary counts the new customer as reachable',
      reachAfter.reachable === reachBefore.reachable + 1, { before: reachBefore.reachable, after: reachAfter.reachable });
    ok('reach summary counts a Hindi reader',
      reachAfter.hindi_reachable === reachBefore.hindi_reachable + 1,
      { before: reachBefore.hindi_reachable, after: reachAfter.hindi_reachable });

    // ════════════════════════════════════════════════ 3. the audience engine
    section('audience filters');
    const inAudience = async (filters) => {
      const res = await targeting.resolveAudience({ audience: 'all_customers', filters });
      return res.recipients.some((x) => String(x.id) === String(customerId));
    };
    ok('matches an empty filter (everybody)', await inAudience({}));
    ok('matches hasDevice', await inAudience({ hasDevice: true }));
    ok('matches platform android', await inAudience({ platform: 'android' }));
    ok('does NOT match platform ios', !(await inAudience({ platform: 'ios' })));
    // phone-a reported 'hi'; phone-c is newer and reported no locale at all. The
    // non-null answer must win — a newer device that happens not to know the
    // language must not erase one that does.
    ok('matches locale hi', await inAudience({ locale: 'hi' }));
    ok('does NOT match locale en', !(await inAudience({ locale: 'en' })));
    ok('matches maxWalletBalance 20 (balance is 0)', await inAudience({ maxWalletBalance: 20 }));
    ok('does NOT match minWalletBalance 1', !(await inAudience({ minWalletBalance: 1 })));
    ok('matches maxConsultations 0 (never consulted)', await inAudience({ maxConsultations: 0 }));
    ok('does NOT match minConsultations 1', !(await inAudience({ minConsultations: 1 })));
    // The recency trap: never-consulted is NOT "999 days since the last session".
    ok('a never-consulted customer is NOT in a win-back window',
      !(await inAudience({ minDaysSinceSession: 14 })));
    ok('matches maxDaysSinceSignup 0 (signed up today)', await inAudience({ maxDaysSinceSignup: 0 }));
    ok('does NOT match minDaysSinceSignup 1', !(await inAudience({ minDaysSinceSignup: 1 })));
    ok('does NOT match birthdayToday (no dob)', !(await inAudience({ birthdayToday: true })));
    ok('does NOT match freeCallUnused (no invite)', !(await inAudience({ freeCallUnused: true })));

    // ════════════════════════════════════════════════ 4. send a real campaign
    section('sending a campaign (push stubbed)');
    const makeCampaign = async (over = {}) => {
      const res = await request('POST', '/api/admin/notifications/campaigns', {
        token: adminToken(),
        body: {
          mode: 'draft',
          audience: 'customer',
          target_ids: [customerId],
          category: 'promotional',
          title: 'Diwali offer',
          body: 'Recharge {name} and get a bonus',
          title_hi: 'दिवाली ऑफ़र',
          body_hi: 'रिचार्ज कीजिए {name}',
          image_url: 'https://example.invalid/pic.jpg',
          deep_link: 'Wallet',
          // OFF BY DEFAULT HERE, and this is a correctness point about the suite
          // rather than a convenience. The platform default quiet window is
          // 22:00–08:00 IST, so a suite run late at night had EVERY send
          // suppressed for quiet_hours and sixteen assertions failed at once
          // while the code was right. A test whose result depends on what time it
          // is run proves nothing either way. The quiet-hours case below turns it
          // back on explicitly, which is also the only place it is under test.
          respect_quiet_hours: false,
          ...over,
        },
      });
      if (res.body?.campaign?.id) createdCampaigns.push(res.body.campaign.id);
      return res;
    };

    r = await makeCampaign();
    ok('a campaign is created as a DRAFT by default (no mode = never send)',
      r.status === 200 && r.body.campaign.status === 'draft' && r.body.sent === false, r.body?.campaign?.status);
    const c1 = r.body.campaign.id;

    r = await request('POST', '/api/admin/notifications/campaigns', {
      token: adminToken(), body: { title: 'x', body: 'y' },
    });
    if (r.body?.campaign?.id) createdCampaigns.push(r.body.campaign.id);
    ok('a title with no body is refused', (await request('POST', '/api/admin/notifications/campaigns', {
      token: adminToken(), body: { title: 'only a title' },
    })).status === 400);

    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c1}/send`, { token: adminToken() });
    ok('the campaign sends', r.status === 200 && r.body.stats.sent === 1, r.body?.stats);
    ok('exactly one push call was made', pushLog.length === 1, pushLog.length);
    ok('the push carried BOTH of the person\'s tokens', pushLog[0]?.tokens.length === 2, pushLog[0]?.tokens);
    ok('the push carried the image', pushLog[0]?.opts?.imageUrl === 'https://example.invalid/pic.jpg', pushLog[0]?.opts?.imageUrl);
    ok('the push carried the deep link', pushLog[0]?.opts?.data?.deepLink === 'Wallet', pushLog[0]?.opts?.data?.deepLink);
    ok('the push carried the campaign id (the whole basis of tracking)',
      pushLog[0]?.opts?.data?.campaignId === c1, pushLog[0]?.opts?.data?.campaignId);
    // Hindi, because this device reported locale 'hi'. Falling back to English
    // would be silent and nobody would ever notice.
    ok('the HINDI copy was chosen for a Hindi reader', pushLog[0]?.opts?.title === 'दिवाली ऑफ़र', pushLog[0]?.opts?.title);
    ok('{name} was substituted', /Notification/.test(pushLog[0]?.opts?.body || '') || /रिचार्ज कीजिए Notification/.test(pushLog[0]?.opts?.body || ''), pushLog[0]?.opts?.body);

    const { data: sendRows } = await client.from('notification_sends').select('*').eq('campaign_id', c1);
    ok('one send row, marked sent', sendRows.length === 1 && sendRows[0].status === 'sent', sendRows.map((x) => x.status));
    ok('the send row records both devices', sendRows[0].device_count === 2, sendRows[0].device_count);
    ok('the send row links the in-app notification', !!sendRows[0].notification_id);

    const { data: inApp } = await client.from('notifications').select('*').eq('campaign_id', c1);
    ok('an in-app row was written', inApp.length === 1, inApp.length);
    ok('the in-app row carries the image', inApp[0]?.image_url === 'https://example.invalid/pic.jpg');
    ok('the in-app row carries the deep link — NULL on all 15,468 older rows', inApp[0]?.deep_link === 'Wallet');
    ok('the in-app row carries the campaign id', inApp[0]?.campaign_id === c1);

    // The claim guard.
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c1}/send`, { token: adminToken() });
    ok('a second send of the same campaign is refused', r.status === 409, r.status);
    ok('and it pushed nothing', pushLog.length === 0, pushLog.length);

    r = await request('PATCH', `/api/admin/notifications/campaigns/${c1}`, { token: adminToken(), body: { title: 'rewritten' } });
    ok('a SENT campaign cannot be edited', r.status === 409, r.status);

    // ════════════════════════════════════════════════ 5. tracking
    section('tracking');
    r = await request('POST', '/api/notifications/track', { body: { campaignId: c1, event: 'opened' } });
    ok('unauthenticated tracking is refused', r.status === 401, r.status);

    r = await request('POST', '/api/notifications/track', { token: customerToken(), body: { campaignId: c1, event: 'nonsense' } });
    ok('an unknown event is refused', r.status === 400, r.status);

    r = await request('POST', '/api/notifications/track', { token: customerToken(), body: { campaignId: c1, event: 'delivered' } });
    ok('delivered is recorded', r.status === 200 && r.body.matched === true, r.body);

    r = await request('POST', '/api/notifications/track', { token: customerToken(), body: { campaignId: c1, event: 'clicked' } });
    ok('clicked is recorded', r.status === 200 && r.body.matched === true);

    const { data: tracked } = await client.from('notification_sends').select('*').eq('campaign_id', c1);
    ok('all three timestamps are set (a click implies an open implies delivery)',
      !!tracked[0].delivered_at && !!tracked[0].opened_at && !!tracked[0].clicked_at, tracked[0]);

    let { data: camp } = await client.from('notification_campaigns')
      .select('delivered_count, opened_count, clicked_count').eq('id', c1).maybeSingle();
    ok('the campaign counters rolled up once each',
      camp.delivered_count === 1 && camp.opened_count === 1 && camp.clicked_count === 1, camp);

    // Repeats must not push a rate over 100%.
    await request('POST', '/api/notifications/track', { token: customerToken(), body: { campaignId: c1, event: 'opened' } });
    await request('POST', '/api/notifications/track', { token: customerToken(), body: { campaignId: c1, event: 'opened' } });
    ({ data: camp } = await client.from('notification_campaigns').select('opened_count').eq('id', c1).maybeSingle());
    ok('a second open does NOT double-count the campaign', camp.opened_count === 1, camp.opened_count);
    const { data: reopened } = await client.from('notification_sends').select('open_count').eq('campaign_id', c1);
    ok('but open_count carries the repeats', reopened[0].open_count >= 2, reopened[0].open_count);

    // An astrologer token is now ACCEPTED by this endpoint — the astrologer app
    // reports its own opens since the vendor half was built — so the property under
    // test is no longer "it is refused" but "it cannot claim somebody else's row".
    // Asserted against the customer's counter rather than the HTTP status, because
    // that is the thing a bug here would actually corrupt.
    const beforeSteal = (await client.from('notification_campaigns')
      .select('opened_count').eq('id', c1).maybeSingle()).data?.opened_count;
    r = await request('POST', '/api/notifications/track', { token: astrologerToken(), body: { campaignId: c1, event: 'opened' } });
    ok('an astrologer token cannot claim a CUSTOMER open', r.body?.matched === false, r.body);
    const afterSteal = (await client.from('notification_campaigns')
      .select('opened_count').eq('id', c1).maybeSingle()).data?.opened_count;
    ok('and the campaign counter did not move', afterSteal === beforeSteal, { beforeSteal, afterSteal });

    // ════════════════════════════════════════════════ 6. the governor
    section('the governor — and a positive control for every refusal');

    // BACK-DATE the first campaign ten days. Its SEND is still inside the 24-hour
    // window, so it must still count towards the cap — and under the original
    // implementation it did not: categories were read from campaigns CREATED in
    // the last 3 days, so a campaign scheduled far in advance counted towards
    // nobody and silently defeated the cap. This is the assertion that proves the
    // fix rather than the shape of it.
    await client.from('notification_campaigns')
      .update({ created_at: new Date(Date.now() - 10 * 86400000).toISOString() })
      .eq('id', c1);

    // The frequency cap should already bite, because a promotional campaign went
    // out to this person a moment ago. That is the control for the cap itself.
    r = await makeCampaign({ title: 'Second promo', body: 'again' });
    const c2 = r.body.campaign.id;
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c2}/send`, { token: adminToken() });
    ok('a SECOND promotional campaign the same day is capped',
      r.body?.stats?.sent === 0 && r.body?.stats?.suppressionBreakdown?.frequency_cap === 1, r.body?.stats);
    ok('and nothing was pushed', pushLog.length === 0, pushLog.length);

    // Transactional ignores the cap — the rule the whole design turns on.
    r = await makeCampaign({ title: 'Your order shipped', body: 'On its way', category: 'transactional' });
    const c3 = r.body.campaign.id;
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c3}/send`, { token: adminToken() });
    ok('a TRANSACTIONAL campaign ignores the cap and goes out', r.body?.stats?.sent === 1, r.body?.stats);
    ok('and it really pushed', pushLog.length === 1, pushLog.length);

    // Quiet hours: a window covering the whole clock, so this does not depend on
    // what time the suite happens to run.
    await request('PATCH', '/api/notifications/preferences', {
      token: customerToken(), body: { quiet_start: 0, quiet_end: 23, promotional: true },
    });
    r = await makeCampaign({ title: 'Quiet test', body: 'should be held', category: 'engagement', respect_quiet_hours: true });
    const c4 = r.body.campaign.id;
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c4}/send`, { token: adminToken() });
    ok('quiet hours hold an engagement campaign back',
      r.body?.stats?.suppressionBreakdown?.quiet_hours === 1, r.body?.stats);

    // ...and the SAME campaign shape goes out once quiet hours are off. Without
    // this, a governor that blocked everything would pass the check above.
    // A ZERO-WIDTH window, not null. Null falls back to the PLATFORM default of
    // 22:00–08:00, so a suite run at 3am would still find itself inside quiet
    // hours and this control would fail while the code was right — which is what
    // happened on the first run of this check. start === end is how a customer
    // says "no quiet hours", and it is the same answer at every hour of the day.
    await request('PATCH', '/api/notifications/preferences', { token: customerToken(), body: { quiet_start: 0, quiet_end: 0 } });
    r = await makeCampaign({ title: 'Quiet control', body: 'should go', category: 'engagement', respect_quiet_hours: true });
    const c5 = r.body.campaign.id;
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c5}/send`, { token: adminToken() });
    ok('CONTROL: the same campaign goes out with quiet hours off', r.body?.stats?.sent === 1, r.body?.stats);

    // Opting out of a category.
    await request('PATCH', '/api/notifications/preferences', { token: customerToken(), body: { engagement: false } });
    r = await makeCampaign({ title: 'Opt-out test', body: 'held', category: 'engagement' });
    const c6 = r.body.campaign.id;
    r = await request('POST', `/api/admin/notifications/campaigns/${c6}/send`, { token: adminToken() });
    ok('an engagement opt-out holds an engagement campaign back',
      r.body?.stats?.suppressionBreakdown?.opted_out === 1, r.body?.stats);

    // ...but a transactional one still arrives. This is the assertion that stands
    // between a preference centre and a customer missing a paid consultation.
    r = await makeCampaign({ title: 'Astrologer replied', body: 'open the chat', category: 'transactional' });
    const c7 = r.body.campaign.id;
    r = await request('POST', `/api/admin/notifications/campaigns/${c7}/send`, { token: adminToken() });
    ok('an opt-out NEVER holds back a transactional notification', r.body?.stats?.sent === 1, r.body?.stats);

    await request('PATCH', '/api/notifications/preferences', { token: customerToken(), body: { engagement: true } });

    // Nobody reachable.
    await client.from('customer_devices').update({ permission_status: 'denied' }).eq('customer_id', customerId);
    r = await makeCampaign({ title: 'No device', body: 'held', category: 'transactional' });
    const c8 = r.body.campaign.id;
    r = await request('POST', `/api/admin/notifications/campaigns/${c8}/send`, { token: adminToken() });
    ok('with no reachable device the reason is recorded as no_device, not dropped',
      r.body?.stats?.suppressionBreakdown?.no_device === 1, r.body?.stats);
    await client.from('customer_devices').update({ permission_status: 'granted' })
      .eq('customer_id', customerId).neq('device_id', 'phone-b');

    // Expiry.
    r = await makeCampaign({ title: 'Expired', body: 'nope', category: 'transactional' });
    const c9 = r.body.campaign.id;
    await client.from('notification_campaigns')
      .update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', c9);
    pushLog.length = 0;
    r = await request('POST', `/api/admin/notifications/campaigns/${c9}/send`, { token: adminToken() });
    ok('an expired campaign is cancelled rather than sent late', r.status === 409 || r.body?.skipped === 'expired', { s: r.status, b: r.body });
    ok('and it pushed nothing', pushLog.length === 0, pushLog.length);

    // A failed push must be recorded as failed, not as sent.
    r = await makeCampaign({ title: 'Failing push', body: 'x', category: 'transactional' });
    const c10 = r.body.campaign.id;
    pushShouldFail = true;
    r = await request('POST', `/api/admin/notifications/campaigns/${c10}/send`, { token: adminToken() });
    pushShouldFail = false;
    ok('a rejected push is counted as failed, not sent',
      r.body?.stats?.failed === 1 && r.body?.stats?.sent === 0, r.body?.stats);

    // ════════════════════════════════════════════════ 7. preview == send
    section('preview matches the send, and the two modules do not shadow each other');

    // The OLD route must still answer in its OLD shape — it is what the live
    // Quick Push page calls, and nothing here is allowed to break it.
    r = await request('POST', '/api/admin/notifications/preview', {
      token: adminToken(), body: { audience: 'all_customers' },
    });
    ok('the legacy preview still answers in its own shape',
      r.status === 200 && typeof r.body.recipientCount === 'number' && typeof r.body.withPushToken === 'number',
      r.body);
    ok('and the legacy history still answers',
      (await request('GET', '/api/admin/notifications/history', { token: adminToken() })).status === 200);

    // ...and the NEW one is reachable on its own path rather than being shadowed.
    r = await request('POST', '/api/admin/notifications/audience-preview', {
      token: adminToken(), body: { audience: 'all_customers', filters: { hasDevice: true }, category: 'promotional' },
    });
    ok('the new audience preview is NOT shadowed by the legacy route',
      r.status === 200 && typeof r.body.wouldReach === 'number' && !!r.body.breakdown, r.body);
    r = await request('POST', '/api/admin/notifications/audience-preview', {
      token: adminToken(),
      body: { audience: 'customer', targetIds: [customerId], category: 'transactional' },
    });
    ok('preview reports this person as reachable', r.body?.wouldReach === 1, r.body);
    r = await request('POST', '/api/admin/notifications/audience-preview', {
      token: adminToken(),
      body: { audience: 'all_customers', filters: { platform: 'ios', hasDevice: true }, category: 'promotional' },
    });
    ok('preview with an iOS filter does not include this Android customer',
      typeof r.body?.wouldReach === 'number', r.body?.wouldReach);
    r = await request('POST', '/api/admin/notifications/audience-preview', { body: {} });
    ok('preview requires an admin', r.status === 401, r.status);

    // ════════════════════════════════════════════════ 8. preferences endpoint
    section('the preference centre');
    r = await request('GET', '/api/notifications/preferences', { token: customerToken() });
    ok('preferences are served with defaults', r.status === 200 && r.body.defaults?.quiet_start != null, r.body);
    r = await request('PATCH', '/api/notifications/preferences', { token: customerToken(), body: { quiet_start: 99 } });
    ok('an out-of-range quiet hour is ignored rather than stored',
      r.status === 200 && r.body.preferences.quiet_start !== 99, r.body?.preferences?.quiet_start);
    r = await request('GET', '/api/notifications/preferences', {});
    ok('preferences require a login', r.status === 401, r.status);

    // ════════════════════════════════════════════════ 9. the in-app list
    section('the in-app list');
    r = await request('GET', '/api/notifications/list', { token: customerToken() });
    ok('the list is served', r.status === 200 && Array.isArray(r.body.data), r.status);
    ok('it includes the campaign notification with its deep link',
      r.body.data.some((n) => n.campaign_id === c1 && n.deep_link === 'Wallet'), r.body.data?.length);

    // An expired in-app row must disappear from the list.
    await client.from('notifications')
      .update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('campaign_id', c1);
    r = await request('GET', '/api/notifications/list', { token: customerToken() });
    ok('an expired notification is hidden from the list',
      !r.body.data.some((n) => n.campaign_id === c1), r.body.data?.length);

    // ════════════════════════════════════════════════ 10. automations
    section('automations');
    r = await request('GET', '/api/admin/notifications/automations', { token: adminToken() });
    ok('automations are listed', r.status === 200 && r.body.data.length >= 10, r.body?.data?.length);
    ok('every seeded automation is OFF', r.body.data.every((a) => a.enabled === false));
    ok('each one reports how many people it would reach now',
      r.body.data.filter((a) => a.trigger_type !== 'event').every((a) => typeof a.audienceNow === 'number'));

    const horoscope = r.body.data.find((a) => a.key === 'weekly_horoscope');
    r = await request('POST', `/api/admin/notifications/automations/${horoscope.id}/run`, { token: adminToken(), body: {} });
    ok('a manual run without confirm:true is refused', r.status === 400, r.status);

    // nextRunFor, as arithmetic rather than as a side effect.
    const mondayNine = automations.nextRunFor({ schedule_time: '09:00', schedule_days: [1] }, new Date('2026-11-07T04:00:00Z'));
    ok('Monday 09:00 IST resolves to a Monday', mondayNine.getUTCDay() === 1, mondayNine?.toISOString());
    ok('and to 03:30 UTC (09:00 IST)',
      mondayNine.getUTCHours() === 3 && mondayNine.getUTCMinutes() === 30, mondayNine?.toISOString());
    const later = automations.nextRunFor({ schedule_time: '09:00' }, new Date('2026-11-07T05:00:00Z'));
    ok('a time already past today rolls to tomorrow', later > new Date('2026-11-07T05:00:00Z'));
    ok('every daily slot is strictly in the future',
      [0, 6, 12, 18, 23].every((h) => {
        const from = new Date(Date.UTC(2026, 10, 7, h, 17));
        return automations.nextRunFor({ schedule_time: '10:00' }, from) > from;
      }));

    // ════════════════════════════════════════════════ 11. limits + analytics
    section('limits and analytics');
    r = await request('GET', '/api/admin/notifications/limits', { token: adminToken() });
    ok('limits are served with defaults', r.status === 200 && r.body.limits.promoPerDay >= 0, r.body?.limits);
    r = await request('GET', '/api/admin/notifications/analytics?days=7', { token: adminToken() });
    ok('analytics answers', r.status === 200 && r.body.totals.campaigns >= 1, r.body?.totals);
    ok('analytics carries the reach summary too', !!r.body.reach?.live_customers);
    r = await request('GET', '/api/admin/notifications/reach', {});
    ok('reach requires an admin', r.status === 401, r.status);

    // ════════════════════════════════════════════════ 12. quiet-hour maths
    section('quiet-hour window maths');
    ok('22→8 contains 23:00', targeting.hourInWindow(23, 22, 8));
    ok('22→8 contains 02:00', targeting.hourInWindow(2, 22, 8));
    ok('22→8 does NOT contain 12:00', !targeting.hourInWindow(12, 22, 8));
    ok('9→17 contains 12:00', targeting.hourInWindow(12, 9, 17));
    ok('9→17 does NOT contain 02:00', !targeting.hourInWindow(2, 9, 17));
    ok('a zero-width window means no quiet hours', !targeting.hourInWindow(5, 5, 5));
    ok('a null window means no quiet hours', !targeting.hourInWindow(5, null, null));

    // ════════════════════════════════════════════════ 13. the astrologer side
    section('astrologers — reachability is an earnings problem here');

    // Created NOT suspended and WITH a service toggle on, because that is the only
    // shape `unreachable_online` is about. Kept out of every customer-facing list
    // by approval_status 'pending' AND hidden_from_customers — either alone would
    // do it, and both are set because a synthetic astrologer a real customer could
    // ring is not an acceptable test fixture.
    const { data: madeAstro, error: astroErr } = await client.from('astrologers')
      .insert([{
        first_name: 'Notification', last_name: 'Check',
        phone_number: QA_ASTRO_PHONE,
        approval_status: 'pending',
        hidden_from_customers: true,
        is_suspended: false,
        is_chat_enabled: true,
      }]).select('id');
    if (astroErr) throw astroErr;
    qaAstroId = madeAstro[0].id;
    ok('synthetic astrologer created', !!qaAstroId);

    const { data: hiddenCheck } = await client.from('astrologers')
      .select('hidden_from_customers, approval_status').eq('id', qaAstroId).maybeSingle();
    ok('and it really is hidden from customers and unapproved',
      hiddenCheck?.hidden_from_customers === true && hiddenCheck?.approval_status === 'pending', hiddenCheck);

    const astroReach0 = await devices.astrologerReachSummary();
    ok('astrologer reach summary answers', !!astroReach0 && astroReach0.live_astrologers > 0, astroReach0);

    // With a service on and no device at all it must show up as open-but-unreachable.
    // This is the POSITIVE CONTROL for the listing: a function that always returned
    // nothing would otherwise read as good news.
    let unreachable = await devices.unreachableAstrologers(500);
    ok('an available astrologer with no device is listed as unreachable',
      unreachable.some((a) => String(a.astrologer_id) === String(qaAstroId)), unreachable.length);
    ok('and the listing says it has no device at all',
      unreachable.find((a) => String(a.astrologer_id) === String(qaAstroId))?.permission === 'none');

    // ── registration ──
    r = await request('POST', '/api/vendor/notification-device', { body: { deviceId: 'vd1' } });
    ok('unauthenticated astrologer device registration is refused', r.status === 401, r.status);

    // The INVERSE of the trap guarded on the customer side: a customer token must
    // not be able to register a device against an astrologer.
    r = await request('POST', '/api/vendor/notification-device', {
      token: customerToken(), body: { deviceId: 'vd1', permissionStatus: 'granted' },
    });
    ok('a CUSTOMER token cannot register an astrologer device', r.status === 401, r.status);

    r = await request('POST', '/api/vendor/notification-device', { token: qaAstrologerToken(), body: {} });
    ok('an astrologer device with no deviceId is refused', r.status === 400, r.status);

    r = await request('POST', '/api/vendor/notification-device', {
      token: qaAstrologerToken(),
      body: {
        deviceId: 'vd-phone-a', fcmToken: 'vtok-aaaaaaaa1111', platform: 'android',
        appVersion: '6.6', locale: 'hi', permissionStatus: 'granted', permissionAsked: true,
      },
    });
    ok('a granted astrologer device registers and is reachable',
      r.status === 200 && r.body.recorded === true && r.body.reachable === true, r.body);

    let vdRows = (await client.from('vendor_devices').select('*').eq('astrologer_id', qaAstroId)).data || [];
    const vdA = vdRows.find((d) => d.device_id === 'vd-phone-a');
    ok('the vendor device row records the permission', vdA?.permission_status === 'granted', vdA?.permission_status);
    ok('and the language — vendor_devices never held one before', vdA?.locale === 'hi', vdA?.locale);
    ok('and stamps when it was asked', !!vdA?.permission_asked_at);
    ok('and when it was decided', !!vdA?.permission_decided_at);

    // permission_asked_at must not move on a later call. Compared by getTime(),
    // never by string equality.
    const askedAtFirst = new Date(vdA.permission_asked_at).getTime();
    await request('POST', '/api/vendor/notification-device', {
      token: qaAstrologerToken(),
      body: { deviceId: 'vd-phone-a', fcmToken: 'vtok-aaaaaaaa1111', permissionStatus: 'granted', permissionAsked: true },
    });
    vdRows = (await client.from('vendor_devices').select('*').eq('astrologer_id', qaAstroId)).data || [];
    ok('permission_asked_at keeps the FIRST sighting',
      new Date(vdRows.find((d) => d.device_id === 'vd-phone-a').permission_asked_at).getTime() === askedAtFirst);

    // A DENIED device — the state that could not be recorded at all before.
    r = await request('POST', '/api/vendor/notification-device', {
      token: qaAstrologerToken(),
      body: { deviceId: 'vd-phone-b', platform: 'android', permissionStatus: 'denied', permissionAsked: true },
    });
    ok('a denied astrologer device registers, and reachable stays TRUE because the other phone works',
      r.status === 200 && r.body.reachable === true, r.body);

    // A second working phone.
    await request('POST', '/api/vendor/notification-device', {
      token: qaAstrologerToken(),
      body: { deviceId: 'vd-phone-c', fcmToken: 'vtok-cccccccc3333', platform: 'android', permissionStatus: 'granted' },
    });
    const liveAstro = await devices.liveAstrologerDevicesFor([qaAstroId]);
    ok('BOTH live astrologer tokens come back for a campaign',
      liveAstro.get(qaAstroId)?.tokens.length === 2, liveAstro.get(qaAstroId)?.tokens);

    // Now reachable, so it must LEAVE the unreachable listing. The other half of the
    // control: the listing has to be able to stop reporting somebody.
    unreachable = await devices.unreachableAstrologers(500);
    ok('once reachable it drops off the unreachable listing',
      !unreachable.some((a) => String(a.astrologer_id) === String(qaAstroId)), unreachable.length);

    const astroReach1 = await devices.astrologerReachSummary();
    ok('astrologer reach counts it as reachable now',
      astroReach1.reachable === astroReach0.reachable + 1,
      { before: astroReach0.reachable, after: astroReach1.reachable });
    ok('and the open-but-unreachable count went back down',
      astroReach1.unreachable_online === astroReach0.unreachable_online - 1,
      { before: astroReach0.unreachable_online, after: astroReach1.unreachable_online });

    // ── a campaign to an astrologer ──
    r = await request('POST', '/api/admin/notifications/campaigns', {
      token: adminToken(),
      body: {
        mode: 'draft', audience: 'astrologer', target_ids: [qaAstroId],
        category: 'transactional',
        title: 'Payout approved', body: 'Your withdrawal has been approved',
        title_hi: 'पेआउट मंज़ूर', body_hi: 'आपकी निकासी मंज़ूर हो गई',
        deep_link: 'Wallet', respect_quiet_hours: false,
      },
    });
    const ac1 = r.body.campaign.id;
    createdCampaigns.push(ac1);
    pushLog.length = 0;
    r = await request('POST', '/api/admin/notifications/campaigns/' + ac1 + '/send', { token: adminToken() });
    ok('a campaign to an astrologer sends', r.body?.stats?.sent === 1, r.body?.stats);
    ok('and it used BOTH vendor_devices tokens, not the single legacy column',
      pushLog[0]?.tokens.length === 2 && pushLog[0].tokens.includes('vtok-cccccccc3333'), pushLog[0]?.tokens);
    ok('the astrologer got the HINDI copy from their device locale',
      pushLog[0]?.opts?.title === 'पेआउट मंज़ूर', pushLog[0]?.opts?.title);

    const aSends = (await client.from('notification_sends').select('*').eq('campaign_id', ac1)).data || [];
    ok('the send row is keyed on astrologer_id, not customer_id',
      aSends.length === 1 && String(aSends[0].astrologer_id) === String(qaAstroId) && aSends[0].customer_id === null,
      aSends[0]);

    const aNotif = (await client.from('notifications').select('*').eq('campaign_id', ac1)).data || [];
    ok('an in-app row was written for the astrologer',
      aNotif.length === 1 && String(aNotif[0].astrologer_id) === String(qaAstroId), aNotif.length);

    // ── tracking from the astrologer app ──
    r = await request('POST', '/api/notifications/track', {
      token: qaAstrologerToken(), body: { campaignId: ac1, event: 'clicked' },
    });
    ok('an astrologer can report a tap', r.status === 200 && r.body.matched === true, r.body);
    const aTracked = (await client.from('notification_sends').select('*').eq('campaign_id', ac1)).data || [];
    ok('the tap landed on the astrologer row', !!aTracked[0].clicked_at && !!aTracked[0].opened_at);

    // A customer must not be able to claim it. The customer HAS send rows of their
    // own from earlier, so this proves the OWNER COLUMN is being used rather than
    // just that the campaign id is unknown.
    r = await request('POST', '/api/notifications/track', {
      token: customerToken(), body: { campaignId: ac1, event: 'opened' },
    });
    ok('a customer cannot claim an astrologer campaign', r.body?.matched === false, r.body);

    // Astrologers are deliberately NOT governed by the preference centre: their
    // notifications are overwhelmingly "a customer is waiting", and an opt-out would
    // cost them earnings. There are no astrologer preference rows at all.
    r = await request('POST', '/api/admin/notifications/audience-preview', {
      token: adminToken(), body: { audience: 'astrologer', targetIds: [qaAstroId], category: 'promotional' },
    });
    ok('an astrologer is reachable even for a promotional preview (not governed)',
      r.body?.wouldReach === 1, r.body);

    // The admin endpoint behind the new panel.
    r = await request('GET', '/api/admin/notifications/astrologer-reach?limit=20', { token: adminToken() });
    ok('the astrologer-reach endpoint answers',
      r.status === 200 && typeof r.body.reach?.live_astrologers === 'number' && Array.isArray(r.body.unreachable),
      r.status);
    r = await request('GET', '/api/admin/notifications/astrologer-reach', {});
    ok('astrologer-reach requires an admin', r.status === 401, r.status);

    // ════════════════════════════════════════════ 14. the in-app record
    section('the in-app list carries the OTHER notification types');

    // The gap this closes: `notifications` held three types in 15,468 rows while
    // the backend pushed fifteen others — order updates, delivered reports,
    // support replies, "your astrologer is free now", referral rewards, missed
    // sessions. Each existed only for the seconds it sat in the phone's tray.
    let r14 = await inAppRecord.recordInApp({
      type: 'order_update',
      customerId,
      title: 'Your order has shipped',
      body: 'It is on its way.',
      data: { orderId: 'abc-123', status: 'shipped' },
    });
    ok('an order update is recorded', r14.ok === true && !!r14.id, r14);

    let { data: rec } = await client.from('notifications').select('*').eq('id', r14.id).maybeSingle();
    ok('it carries the category', rec?.category === 'transactional', rec?.category);
    ok('it carries a destination the app can route', rec?.deep_link === 'MyOrders', rec?.deep_link);
    ok('it carries the ids the screen needs', rec?.data?.orderId === 'abc-123', rec?.data);
    ok('and the type, so the list can group it', rec?.type === 'order_update', rec?.type);

    // An UNKNOWN type must write NOTHING. Inserting it with no category and no
    // destination would put a row in front of a customer that goes nowhere when
    // tapped, which is the state this module exists to end.
    const before14 = (await client.from('notifications').select('id').eq('customer_id', customerId)).data.length;
    r14 = await inAppRecord.recordInApp({ type: 'not_a_real_type', customerId, title: 'x', body: 'y' });
    ok('an unknown type is refused', r14.ok === false && r14.reason === 'unknown_type', r14);
    r14 = await inAppRecord.recordInApp({ type: 'order_update', title: 'x', body: 'y' });
    ok('no recipient is refused', r14.ok === false && r14.reason === 'no_recipient', r14);
    r14 = await inAppRecord.recordInApp({ type: 'order_update', customerId });
    ok('no copy is refused', r14.ok === false && r14.reason === 'no_copy', r14);
    const after14 = (await client.from('notifications').select('id').eq('customer_id', customerId)).data.length;
    ok('and none of those three wrote a row', after14 === before14, { before14, after14 });

    // The astrologer direction, keyed on the right column.
    r14 = await inAppRecord.recordInApp({
      type: 'report_update', audience: 'astrologer', astrologerId: qaAstroId,
      title: 'Update on your report', body: 'Resolved.', data: { reportId: 'r-1' },
    });
    ok('an astrologer record is keyed on astrologer_id', r14.ok === true, r14);
    ({ data: rec } = await client.from('notifications').select('*').eq('id', r14.id).maybeSingle());
    ok('and carries no customer_id', rec?.customer_id === null && String(rec?.astrologer_id) === String(qaAstroId));

    // THE ASSERTION THAT PROVES THE FIX: the app's own list endpoint now returns a
    // type that is not a campaign and not an admin broadcast.
    r = await request('GET', '/api/notifications/list', { token: customerToken() });
    const listed = (r.body.data || []).find((n) => n.type === 'order_update');
    ok('the app list serves the order update', !!listed, (r.body.data || []).map((n) => n.type).join(','));
    ok('with its destination intact', listed?.deep_link === 'MyOrders', listed?.deep_link);

    // The two-hour expiry on "they're free now", which is the one type where a
    // stale row is worse than none.
    r14 = await inAppRecord.recordInApp({
      type: 'astrologer_free', customerId,
      title: "They're free now!", body: 'Tap to connect.',
      data: { astrologerId: qaAstroId },
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    });
    ok('an astrologer_free record is written', r14.ok === true, r14);
    r = await request('GET', '/api/notifications/list', { token: customerToken() });
    ok('an already-expired one is hidden from the list',
      !(r.body.data || []).some((n) => n.type === 'astrologer_free'),
      (r.body.data || []).map((n) => n.type).join(','));

    // And the live code really does route it from `type` rather than needing a
    // deep link, because those destinations need an id.
    ok('astrologer_free deliberately carries no deep_link',
      inAppRecord.TYPES.astrologer_free.deepLink === null);
    ok('support_reply deliberately carries no deep_link',
      inAppRecord.TYPES.support_reply.deepLink === null);
    ok('every other known type names a destination',
      Object.entries(inAppRecord.TYPES)
        .filter(([k]) => !['astrologer_free', 'support_reply', 'report_update'].includes(k))
        .every(([, v]) => typeof v.deepLink === 'string' && v.deepLink.length > 0),
      JSON.stringify(inAppRecord.TYPES));
  } finally {
    // ════════════════════════════════════════════════ teardown, asserted
    section('teardown');
    try {
      for (const id of createdCampaigns) {
        await client.from('notification_sends').delete().eq('campaign_id', id);
        await client.from('notifications').delete().eq('campaign_id', id);
        await client.from('notification_campaigns').delete().eq('id', id);
      }
      if (customerId) {
        await client.from('notification_preferences').delete().eq('customer_id', customerId);
        await client.from('customer_devices').delete().eq('customer_id', customerId);
        await client.from('notifications').delete().eq('customer_id', customerId);
        await client.from('customers').delete().eq('id', customerId);
      }
      if (qaAstroId) {
        await client.from('vendor_devices').delete().eq('astrologer_id', qaAstroId);
        await client.from('notifications').delete().eq('astrologer_id', qaAstroId);
        await client.from('astrologers').delete().eq('id', qaAstroId);
      }

      const { data: leftCust } = await client.from('customers').select('id').eq('mobile', QA_PHONE);
      ok('the synthetic customer is gone', (leftCust || []).length === 0, leftCust);
      const { data: leftDev } = await client.from('customer_devices').select('id').eq('customer_id', customerId || '00000000-0000-0000-0000-000000000000');
      ok('its devices are gone', (leftDev || []).length === 0, leftDev);
      let leftCamp = 0;
      for (const id of createdCampaigns) {
        const { data } = await client.from('notification_campaigns').select('id').eq('id', id);
        leftCamp += (data || []).length;
      }
      ok('every campaign this script made is gone', leftCamp === 0, leftCamp);
      const { data: leftAstro } = await client.from('astrologers').select('id').eq('phone_number', QA_ASTRO_PHONE);
      ok('the synthetic astrologer is gone', (leftAstro || []).length === 0, leftAstro);
      const { data: leftVd } = await client.from('vendor_devices').select('id')
        .eq('astrologer_id', qaAstroId || '00000000-0000-0000-0000-000000000000');
      ok('its vendor devices are gone', (leftVd || []).length === 0, leftVd);
      const { data: autos } = await client.from('notification_automations').select('key').eq('enabled', true);
      ok('no automation was left enabled', (autos || []).length === 0, autos);
    } catch (err) {
      ok('teardown completed', false, err.message);
    }
    server.close();
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('failed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
