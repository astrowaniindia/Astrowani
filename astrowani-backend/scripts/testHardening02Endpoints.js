// Verifies the new backend endpoints added to make sql/hardening_02_access_control.sql
// safe to run (GET /api/vendor/profile, GET /api/vendor/wallet, POST /api/vendor/register,
// POST /api/customers/names) against real throwaway rows, created and deleted in this run.
// See DATABASE_HARDENING_HANDOFF.md §3.1/§3.2.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4500';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set a strong JWT_SECRET (matching the running server) before running this.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(BASE_URL + path);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); }
          catch (e) { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const tag = `htest-${Date.now()}`;
  let customer, astro;

  try {
    // ── Setup: throwaway customer + astrologer ────────────────────────────
    const custMobile = `9${Date.now()}`.slice(0, 10);
    const { data: cust, error: custErr } = await db
      .from('customers')
      .insert([{ name: tag, mobile: custMobile, wallet_balance: 123 }])
      .select('id').single();
    if (custErr) throw custErr;
    customer = cust;

    const { data: ast, error: astErr } = await db
      .from('astrologers')
      .insert([{
        first_name: tag, last_name: 'Vendor', phone_number: `8${Date.now()}`.slice(0, 10),
        wallet_balance: 456, bank_account_holder: 'Test Holder',
        bank_account_number: '000111222', bank_ifsc: 'TEST0001234',
      }])
      .select('id').single();
    if (astErr) throw astErr;
    astro = ast;

    const custToken = jwt.sign({ id: customer.id, userId: customer.id, phone: custMobile }, JWT_SECRET, { expiresIn: '1h' });
    const vendorToken = jwt.sign({ id: astro.id, userId: astro.id, astroId: astro.id }, JWT_SECRET, { expiresIn: '1h' });

    // ── GET /api/vendor/profile ────────────────────────────────────────────
    const profRes = await request('GET', '/api/vendor/profile', { token: vendorToken });
    check('vendor/profile: 200', profRes.status === 200);
    check('vendor/profile: returns correct id', profRes.body?.data?.id === astro.id);
    check('vendor/profile: includes bank details', profRes.body?.data?.bank_account_number === '000111222');

    // ── GET /api/vendor/wallet ─────────────────────────────────────────────
    const walletRes = await request('GET', '/api/vendor/wallet', { token: vendorToken });
    check('vendor/wallet: 200', walletRes.status === 200);
    check('vendor/wallet: correct balance', Number(walletRes.body?.data?.wallet_balance) === 456);
    check('vendor/wallet: has transactions array', Array.isArray(walletRes.body?.data?.transactions));

    // ── GET /api/wallet (customer, pre-existing endpoint, sanity check) ────
    const custWalletRes = await request('GET', '/api/wallet', { token: custToken });
    check('customer wallet: 200', custWalletRes.status === 200);
    check('customer wallet: correct balance', Number(custWalletRes.body?.data?.balance) === 123);

    // ── GET /api/users/profile (customer) ──────────────────────────────────
    const custProfRes = await request('GET', '/api/users/profile', { token: custToken });
    check('users/profile: 200', custProfRes.status === 200);
    check('users/profile: correct id', custProfRes.body?.data?.id === customer.id);
    check('users/profile: correct name', custProfRes.body?.data?.name === tag);

    // ── POST /api/customers/names ──────────────────────────────────────────
    const namesRes = await request('POST', '/api/customers/names', {
      token: vendorToken, body: { ids: [customer.id, '00000000-0000-0000-0000-000000000000'] },
    });
    check('customers/names: 200', namesRes.status === 200);
    check('customers/names: resolves real id', namesRes.body?.data?.[customer.id]?.name === tag);
    check('customers/names: skips unknown id', namesRes.body?.data?.['00000000-0000-0000-0000-000000000000'] === undefined);

    const namesEmptyRes = await request('POST', '/api/customers/names', { token: vendorToken, body: { ids: [] } });
    check('customers/names: empty ids → 200 with {}', namesEmptyRes.status === 200 && Object.keys(namesEmptyRes.body?.data || {}).length === 0);

    // ── POST /api/vendor/register ──────────────────────────────────────────
    const regPhone = `7${Date.now()}`.slice(0, 10);
    const preRegToken = jwt.sign({ id: `user_${Date.now()}`, phone: regPhone, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
    const regRes = await request('POST', '/api/vendor/register', {
      token: preRegToken,
      body: { first_name: tag, last_name: 'NewVendor', phone_number: '9999999999-SHOULD-BE-IGNORED', approval_status: 'pending' },
    });
    check('vendor/register: 200', regRes.status === 200);
    check('vendor/register: returns a token', typeof regRes.body?.token === 'string');
    check('vendor/register: new user id present', !!regRes.body?.user?.id);

    let regRow = null;
    if (regRes.body?.user?.id) {
      const { data } = await db.from('astrologers').select('phone_number').eq('id', regRes.body.user.id).single();
      regRow = data;
    }
    check('vendor/register: phone_number came from JWT, not body', regRow?.phone_number === regPhone);

    // Re-registering the same verified number must be rejected, not duplicated.
    const dupRes = await request('POST', '/api/vendor/register', { token: preRegToken, body: { first_name: 'Dup' } });
    check('vendor/register: duplicate phone → 409', dupRes.status === 409);

    // Cleanup the row this test created via the register endpoint.
    if (regRes.body?.user?.id) {
      await db.from('astrologers').delete().eq('id', regRes.body.user.id);
    }
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
