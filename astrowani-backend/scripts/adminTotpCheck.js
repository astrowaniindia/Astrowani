// End-to-end check of admin two-factor login (src/adminTotp.js + adminRoutes).
//
//   PORT=4597 node --env-file=.env scripts/devServer.js
//   BASE=http://localhost:4597 node --env-file=.env scripts/adminTotpCheck.js
//
// Creates ONE throwaway admin (random email on the .invalid TLD, random password),
// drives setup -> enable -> login -> disable over real HTTP, then deletes it and asserts
// it is gone. Makes ~8 login calls, inside the 10-per-15-minutes login limiter.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const totp = require('../src/adminTotp');

const BASE = process.env.BASE || 'http://localhost:4597';
if (/astrowani\.com/.test(BASE)) { console.error('Refusing to run against production.'); process.exit(2); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let pass = 0; let fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ', n); } else { fail++; console.log('  FAIL', n, x ?? ''); } };
const post = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
};

(async () => {
  const email = `totp-check-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
  const password = crypto.randomBytes(18).toString('base64');
  let adminId = null;
  try {
    const { data, error } = await db.from('admins')
      .insert([{ email, name: 'TOTP check (temporary)', password_hash: bcrypt.hashSync(password, 10) }]).select('id').single();
    if (error) throw error;
    adminId = data.id;

    const plain = await post('/api/admin/login', { email, password });
    ok('CONTROL password-only login works before 2FA is on', plain.status === 200 && !!plain.body?.token, plain.status);
    const token = plain.body.token;

    const setup = await post('/api/admin/2fa/setup', {}, token);
    ok('setup returns a secret and an otpauth URL', !!setup.body?.secret && /^otpauth:\/\/totp\//.test(setup.body?.otpauthUrl || ''));
    const half = await post('/api/admin/login', { email, password });
    ok('a half-finished setup does NOT turn 2FA on', half.status === 200, half.status);

    const bad = await post('/api/admin/2fa/enable', { code: '000000' }, token);
    ok('enable refuses a wrong code', bad.status === 400);
    const step = totp.currentStep();
    const en = await post('/api/admin/2fa/enable', { code: totp.codeAt(setup.body.secret, step) }, token);
    ok('enable accepts a correct code', en.status === 200 && en.body?.enabled === true, en.body);

    const need = await post('/api/admin/login', { email, password });
    ok('password alone is no longer enough (TOTP_REQUIRED)', need.status === 401 && need.body?.code === 'TOTP_REQUIRED', need.body);
    const wrongPw = await post('/api/admin/login', { email, password: 'wrong', totp: '123456' });
    ok('a wrong password says nothing about 2FA', wrongPw.status === 401 && !wrongPw.body?.code, wrongPw.body);
    const replay = await post('/api/admin/login', { email, password, totp: totp.codeAt(setup.body.secret, step) });
    ok('the code used to enable cannot be replayed', replay.status === 401 && replay.body?.code === 'TOTP_INVALID', replay.body);
    const next = totp.codeAt(setup.body.secret, step + 1);
    const good = await post('/api/admin/login', { email, password, totp: next });
    ok('password + valid code logs in', good.status === 200 && !!good.body?.token, good.body);
    const exp = good.body?.token ? JSON.parse(Buffer.from(good.body.token.split('.')[1], 'base64')) : {};
    ok('admin token now lasts 24h, not 7 days', exp.exp - exp.iat === 86400, exp.exp - exp.iat);
    const again = await post('/api/admin/login', { email, password, totp: next });
    ok('the same code cannot log in twice', again.status === 401, again.status);

    const offBad = await post('/api/admin/2fa/disable', { code: '000000' }, good.body.token);
    ok('disable refuses without a valid code', offBad.status === 400);
    const { data: row } = await db.from('admins').select('totp_secret').eq('id', adminId).single();
    ok('the secret is stored server-side only', !!row.totp_secret && !JSON.stringify(good.body).includes(row.totp_secret));
  } catch (e) {
    fail++; console.log('  FAIL threw:', e.message);
  } finally {
    if (adminId) await db.from('admins').delete().eq('id', adminId);
    const { data: left } = await db.from('admins').select('id').eq('email', email);
    ok('teardown: temporary admin removed', !(left || []).length);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
