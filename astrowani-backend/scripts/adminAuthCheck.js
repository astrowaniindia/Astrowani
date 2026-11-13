// Regression check for the 2026-11-13 admin-takeover fix (src/adminAuth.js).
//
//   PORT=4597 node --env-file=.env scripts/devServer.js
//   BASE=http://localhost:4597 node --env-file=.env scripts/adminAuthCheck.js
//
// Tokens are signed with the LOCAL JWT_SECRET. Read-only except one OTP send/verify on
// the store-reviewer number, which sends no SMS. The only POST it makes to an admin
// route uses a FORGED token and must be refused before anything happens.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.BASE || 'http://localhost:4597';
if (/astrowani\.com/.test(BASE)) { console.error('Refusing to run against production.'); process.exit(2); }
const sign = (claims) => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '10m' });
let pass = 0; let fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, x ?? ''); } };
const call = async (method, path, token, body) => (await fetch(BASE + path, {
  method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
})).status;

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: admin } = await db.from('admins').select('id').limit(1).maybeSingle();
  ok('found the real admin (positive control fixture)', !!admin?.id);
  const CUST = '2e23b19d-3221-42bd-b967-2dcc9dd8cbbd';

  // 1. Login can no longer mint an admin token.
  await call('POST', '/api/users/mobile-otp-request', null, { phoneNumber: '9999999999' });
  const res = await fetch(BASE + '/api/users/mobile-otp-verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: '9999999999', otp: '123456', role: 'admin' }),
  }).then((r) => r.json());
  const role = res.token ? JSON.parse(Buffer.from(res.token.split('.')[1], 'base64')).role : null;
  ok('login asked for role "admin" is issued a customer token', role === 'customer', role);
  ok('that token cannot open the admin API', (await call('GET', '/api/admin/stats', res.token)) === 403);

  // 2. Tokens forged BEFORE the fix (customer id + role admin) are dead everywhere.
  const forged = sign({ id: CUST, userId: CUST, phone: '9999999999', role: 'admin' });
  const routes = [['GET', '/api/admin/stats'], ['GET', '/api/admin/customers'], ['GET', '/api/admin/withdrawals'],
    ['GET', '/api/admin/support/conversations'], ['GET', '/api/admin/notifications/history'],
    ['GET', '/api/admin/referral-popup/history'], ['POST', '/api/admin/app-prompts/notify']];
  for (const [m, p] of routes) ok(`forged admin token refused: ${m} ${p}`, (await call(m, p, forged, m === 'POST' ? {} : null)) === 403);
  ok('a random uuid with role admin is refused', (await call('GET', '/api/admin/stats', sign({ id: '00000000-0000-4000-8000-000000000000', role: 'admin' }))) === 403);
  ok('a non-uuid id with role admin is refused', (await call('GET', '/api/admin/stats', sign({ id: "x' or 1=1", role: 'admin' }))) === 403);

  // 3. Positive controls: the real admin keeps working on every module.
  const real = sign({ id: admin.id, role: 'admin' });
  for (const p of ['/api/admin/stats', '/api/admin/withdrawals', '/api/admin/support/conversations', '/api/admin/notifications/history']) {
    ok(`CONTROL real admin allowed: GET ${p}`, (await call('GET', p, real)) === 200);
  }
  ok('CONTROL a real admin id with the wrong role is still refused', (await call('GET', '/api/admin/stats', sign({ id: admin.id, role: 'customer' }))) === 403);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
