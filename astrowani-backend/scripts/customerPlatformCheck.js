#!/usr/bin/env node
// customers.platform / customers.signup_platform — against the LIVE database, over real
// HTTP, through the REAL mobile-otp-verify route.
//
//   PORT=4599 node --env-file=.env scripts/customerPlatformCheck.js
//
// ⚠ index.js IS NEVER BOOTED DIRECTLY. It is started through scripts/devServer.js, which
// refuses to run with ENABLE_SESSION_MANAGER=true — so sessionManager's 30s billing
// worker and the hourly earnings reset never touch production (CLAUDE.md,
// local-backend-bills-production). The boot log is ALSO checked for EADDRINUSE before a
// single assertion is trusted: a port clash silently tested the OLD code once before and
// reported 15 failures as if they were real (CLAUDE.md DH).
//
// WHY IT GOES THROUGH THE ROUTE AND NOT THE MODULE. normalizePlatform() returning 'ios'
// proves the whitelist, not that a login records anything. The delivery path is the
// mobile-otp-verify handler's two branches, and a harness that stops at its own helper is
// the mistake this project has now recorded five times (CLAUDE.md BN). So this drives the
// real endpoint with the real no-SMS QA bypass number and reads the row back from
// production. The ONE exception is section 1, which is a pure unit check of the helper
// including parity with the inline rule it replaced in vendorDevices.js.
//
// EVERY NEGATIVE CHECK IS PRECEDED BY A POSITIVE CONTROL. "The platform was not
// overwritten" is not a passing assertion unless something could have overwritten it —
// otherwise a write path that is simply dead reads as a passing test (CLAUDE.md).
//
// Uses QA_TEST_OTPS['9123450001'] (fixed OTP, no SMS credit spent, no real phone). That
// number held no customer row when this was written; the script refuses to run if it does,
// rather than mutating something real. Teardown is asserted at the end.
global.WebSocket = require('ws');

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const { normalizePlatform } = require('../src/devicePlatform');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PORT = Number(process.env.PORT || 4599);
const BASE = `http://127.0.0.1:${PORT}`;
const QA_PHONE = '9123450001';
const QA_OTP = '222222';

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

// ── HTTP ────────────────────────────────────────────────────────────────────────
function post(pathname, body, token) {
  return request('POST', pathname, body, token);
}
function get(pathname, token) {
  return request('GET', pathname, null, token);
}
function request(method, pathname, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: pathname,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch (_) { parsed = { raw: data.slice(0, 400) }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
}

const readRow = async () => {
  const { data } = await db
    .from('customers')
    .select('id, mobile, platform, signup_platform')
    .eq('mobile', QA_PHONE)
    .maybeSingle();
  return data || null;
};

// A fresh signup each time, so the CREATE branch can be exercised more than once.
const removeQaCustomer = async () => {
  const row = await readRow();
  if (!row) return;
  // welcomePromise.grantOnSignup writes one of these on every account creation.
  await db.from('free_call_invites').delete().eq('customer_id', row.id);
  await db.from('customers').delete().eq('id', row.id);
};

// Verify through the real route. `platformField` of undefined omits the field entirely,
// which is what an installed build predating the app-side change does.
const verify = async (platformField, opts = {}) => {
  const body = { phoneNumber: QA_PHONE, otp: QA_OTP, role: 'customer' };
  if (platformField !== undefined) body.devicePlatform = platformField;
  if (opts.fcmToken) body.fcmToken = opts.fcmToken;
  if (opts.termsAccepted) body.termsAccepted = true;
  // Each verify consumes the stored OTP, so request a new one first. The QA number is on
  // the fixed-OTP no-SMS bypass, so this spends nothing.
  await post('/api/users/mobile-otp-request', { phoneNumber: QA_PHONE, role: 'customer' });
  return post('/api/users/mobile-otp-verify', body);
};

(async () => {
  // ── Boot ──────────────────────────────────────────────────────────────────────
  if (process.env.ENABLE_SESSION_MANAGER === 'true') {
    console.error('REFUSING: ENABLE_SESSION_MANAGER=true would bill production.');
    process.exit(1);
  }

  const existing = await readRow();
  if (existing) {
    console.error(
      `REFUSING: ${QA_PHONE} already has a customer row (${existing.id}). This script `
      + 'creates and deletes that account; it will not touch a row it did not make.',
    );
    process.exit(1);
  }

  console.log(`Booting devServer on :${PORT} …`);
  const server = spawn(
    process.execPath,
    [`--env-file=${path.join(__dirname, '..', '.env')}`, path.join(__dirname, 'devServer.js')],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        // Production parity. FREE_CALL_LOCAL_TEST forces the instant free-call offer on
        // and bypasses eligibility for the test customer; it has invalidated an
        // assertion in this project before (CLAUDE.md, 2026-10-05) and the signup path
        // under test here creates a free-call invite.
        FREE_CALL_LOCAL_TEST: 'false',
        ENABLE_SESSION_MANAGER: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let bootLog = '';
  server.stdout.on('data', (d) => { bootLog += d.toString(); });
  server.stderr.on('data', (d) => { bootLog += d.toString(); });

  const shutdown = () => { try { server.kill(); } catch (_) {} };
  process.on('exit', shutdown);

  // Wait for the port to answer, then check HOW it came up. The real index.js subscribes
  // several Realtime channels and registers every route group before it listens, so this
  // is slower than it looks — a short window here reads as "never answered".
  let up = false;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (/running on http/i.test(bootLog)) {
      const res = await get('/api/astrologers');
      if (res.status > 0) { up = true; break; }
    }
    if (server.exitCode !== null) break;
  }

  // THE CHECK THAT STOPS A FALSE RESULT. If something else already holds this port, every
  // request below silently hits THAT process — which is how a previous session tested
  // stale code and believed the failures were real.
  if (/EADDRINUSE/i.test(bootLog)) {
    console.error(`\nREFUSING: port ${PORT} is already in use — every assertion would hit `
      + 'the other process. Re-run with a free PORT=.');
    shutdown();
    process.exit(1);
  }
  if (!up) {
    console.error('\nServer never answered. Boot log:\n', bootLog.slice(-2000));
    shutdown();
    process.exit(1);
  }
  console.log('devServer is up, no port clash.\n');

  try {
    // ── 1. The helper, including parity with the line it replaced ───────────────
    section('1. normalizePlatform');
    ok(normalizePlatform('ios') === 'ios', "'ios' stays 'ios'");
    ok(normalizePlatform('android') === 'android', "'android' stays 'android'");
    ok(normalizePlatform('windows') === 'unknown', 'an unshipped platform is unknown');
    ok(normalizePlatform('../../etc/passwd') === 'unknown', 'a path-ish string is unknown');
    ok(normalizePlatform('x'.repeat(500)) === 'unknown', '500 chars is unknown, not stored raw');
    ok(normalizePlatform(42) === 'unknown', 'a number is unknown');
    ok(normalizePlatform({}) === 'unknown', 'an object is unknown');
    // The distinction the whole design rests on.
    ok(normalizePlatform(undefined) === null, 'ABSENT is null, never unknown');
    ok(normalizePlatform(null) === null, 'null is null, never unknown');
    ok(normalizePlatform('') === null, 'an empty string is absent, not unknown');
    ok(normalizePlatform('   ') === null, 'whitespace only is absent, not unknown');
    // More tolerant than the inline rule it replaced in vendorDevices.js, which recorded
    // these as 'unknown'. Neither app sends them, so nothing live changes.
    ok(normalizePlatform('iOS') === 'ios', 'casing is tolerated');
    ok(normalizePlatform(' android ') === 'android', 'whitespace is trimmed');
    // Parity with the old inline rule for every value either app actually sends.
    const oldRule = (p) => (p ? (['ios', 'android'].includes(p) ? p : 'unknown') : undefined);
    const sameForRealInputs = ['ios', 'android'].every((p) => oldRule(p) === normalizePlatform(p));
    ok(sameForRealInputs, 'identical to the replaced inline rule for the values the apps send');

    // ── 2. CREATE branch, Android — the POSITIVE CONTROL ───────────────────────
    // Everything after this is "X did not change". If this fails, nothing below means
    // anything, because no write path would be proven to work at all.
    section('2. Signup on Android (control — proves the write path works)');
    const r2 = await verify('android', { termsAccepted: true, fcmToken: 'harness-token-1' });
    ok(r2.status === 200 && r2.body?.success, `signup answered 200 (got ${r2.status})`);
    const row2 = await readRow();
    ok(!!row2, 'the account was created');
    ok(row2?.platform === 'android', `platform is android (got ${row2?.platform})`);
    ok(row2?.signup_platform === 'android', `signup_platform is android (got ${row2?.signup_platform})`);

    // ── 3. CREATE branch, iOS — the case that does not exist today ─────────────
    section('3. Signup on iPhone');
    await removeQaCustomer();
    ok((await readRow()) === null, 'teardown between cases actually removed the row');
    const r3 = await verify('ios', { termsAccepted: true });
    ok(r3.status === 200 && r3.body?.success, `iOS signup answered 200 (got ${r3.status})`);
    const row3 = await readRow();
    ok(row3?.platform === 'ios', `platform is ios (got ${row3?.platform})`);
    ok(row3?.signup_platform === 'ios', `signup_platform is ios (got ${row3?.signup_platform})`);
    // An iPhone has no Play Install Referrer, so this is the ONLY platform signal it gives.
    ok(row3?.id !== row2?.id, 'this is a genuinely new account, not the previous row');

    // ── 4. LOGIN branch — current platform moves, signup platform does NOT ─────
    section('4. Same account, now logging in from Android');
    const r4 = await verify('android', { fcmToken: 'harness-token-2' });
    ok(r4.status === 200 && r4.body?.success, `login answered 200 (got ${r4.status})`);
    const row4 = await readRow();
    ok(row4?.id === row3?.id, 'still the same account (login, not a second signup)');
    ok(row4?.platform === 'android', `platform followed the device (got ${row4?.platform})`);
    // The whole reason there are two columns.
    ok(row4?.signup_platform === 'ios', `signup_platform is STILL ios (got ${row4?.signup_platform})`);

    // ── 5. LOGIN with no fcmToken — the hole the patch object closes ───────────
    // The write used to be gated on `if (fcmToken)`, so a customer who never granted
    // notification permission would have had no platform recorded, ever.
    section('5. Login with NO fcmToken still records the platform');
    await db.from('customers').update({ platform: null }).eq('id', row3.id);
    ok((await readRow())?.platform === null, 'control: platform really was cleared first');
    const r5 = await verify('ios');
    ok(r5.status === 200 && r5.body?.success, `login answered 200 (got ${r5.status})`);
    const row5 = await readRow();
    ok(row5?.platform === 'ios', `platform recorded without a push token (got ${row5?.platform})`);
    ok(row5?.signup_platform === 'ios', 'signup_platform untouched');

    // ── 6. An older build that sends nothing must not overwrite ────────────────
    section('6. A build that sends no devicePlatform changes nothing');
    const before6 = await readRow();
    ok(before6?.platform === 'ios', 'control: a real value is in place to be overwritten');
    const r6 = await verify(undefined, { fcmToken: 'harness-token-3' });
    ok(r6.status === 200 && r6.body?.success, `login answered 200 (got ${r6.status})`);
    const row6 = await readRow();
    ok(row6?.platform === 'ios', `platform left alone, NOT set to unknown (got ${row6?.platform})`);
    ok(row6?.signup_platform === 'ios', 'signup_platform left alone');

    // ── 7. A garbage value is whitelisted, never stored raw ───────────────────
    section('7. An unrecognised platform is stored as unknown');
    const r7 = await verify('windows');
    ok(r7.status === 200 && r7.body?.success, `login answered 200 (got ${r7.status})`);
    const row7 = await readRow();
    ok(row7?.platform === 'unknown', `platform is unknown (got ${row7?.platform})`);
    ok(row7?.platform !== 'windows', 'the raw client string did NOT reach the column');
    ok(row7?.signup_platform === 'ios', 'signup_platform still not rewritten by a login');

    // ── 8. The database CHECK is the real backstop ─────────────────────────────
    section('8. The column rejects anything outside the three values');
    const { error: checkErr } = await db
      .from('customers').update({ platform: 'windows' }).eq('id', row3.id);
    ok(!!checkErr, 'a direct write of an invalid platform is REJECTED by the CHECK');
    const { error: okErr } = await db
      .from('customers').update({ platform: 'ios' }).eq('id', row3.id);
    ok(!okErr, 'control: a valid value is still accepted');

    // ── 9. The admin route actually serves the fields ──────────────────────────
    section('9. GET /api/admin/customers');
    const adminToken = jwt.sign({ role: 'admin', id: 'harness' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const unauth = await get('/api/admin/customers');
    ok(unauth.status === 401, `an unauthenticated read is refused (got ${unauth.status})`);
    const admin = await get('/api/admin/customers', adminToken);
    ok(admin.status === 200, `the admin read answered 200 (got ${admin.status})`);
    const list = admin.body?.data || [];
    // Positive control: the endpoint is not passing on an empty list.
    ok(list.length > 100, `the list is populated (got ${list.length} customers)`);
    const mine = list.find((c) => c.id === row3.id);
    ok(!!mine, 'the harness customer is in the list');
    ok(mine?.platform === 'ios', `the route serves platform (got ${mine?.platform})`);
    ok(mine?.signup_platform === 'ios', `the route serves signup_platform (got ${mine?.signup_platform})`);
    // The column set is valid against the live schema — this is what would 400 the whole
    // query and render the page empty if a column were missing or misspelled.
    const withPlatform = list.filter((c) => c.platform).length;
    ok(withPlatform >= 1, `at least the harness row reports a platform (got ${withPlatform})`);

    // ── 10. The fallback chain, proven rather than assumed ─────────────────────
    // The tier mechanism exists so a backend deployed BEFORE the migration still renders
    // rows. Simulated by selecting a column that genuinely does not exist, which is
    // exactly what PostgREST would say about `platform` on an un-migrated database.
    section('10. A missing column 400s the whole query (why the tiers exist)');
    const { error: bogusErr } = await db
      .from('customers').select('id, name, no_such_column_xyz').limit(1);
    ok(!!bogusErr, 'control: naming an unknown column DOES error');
    ok(
      /does not exist|42703|PGRST204/i.test(`${bogusErr?.message} ${bogusErr?.code} ${bogusErr?.details}`),
      `the error is recognised by isMissingColumn (got code ${bogusErr?.code}: ${bogusErr?.message})`,
    );
    const { data: stillOk, error: stillErr } = await db
      .from('customers').select('id, name, platform, signup_platform').limit(1);
    ok(!stillErr && stillOk?.length === 1, 'the real tier-1 column set selects cleanly');
  } finally {
    // ── Teardown, asserted ────────────────────────────────────────────────────
    section('Teardown');
    await removeQaCustomer();
    const leftover = await readRow();
    ok(leftover === null, 'the harness customer row is gone');
    const { count: inviteCount } = await db
      .from('free_call_invites').select('id', { count: 'exact', head: true })
      .eq('invited_by', 'welcome_promise');
    const { data: orphan } = await db
      .from('customers').select('id').eq('mobile', QA_PHONE).maybeSingle();
    ok(!orphan, 'no account remains on the QA number');
    console.log(`  (free_call_invites from welcome_promise now: ${inviteCount ?? 'n/a'})`);

    const { count: total } = await db
      .from('customers').select('id', { count: 'exact', head: true });
    console.log(`  (customers in production: ${total})`);

    console.log(`\n${pass} passed, ${fail} failed`);
    shutdown();
    process.exit(fail ? 1 : 0);
  }
})();
