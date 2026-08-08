// Verifies the 2026-08-08 fix for the 3 unauthenticated push-notification endpoints (see
// security-audit-2026-08-08.md, "someone could push a fake incoming-call/chat notification").
// Before this fix, /api/push/notify-chat-message, /api/push/notify-chat-request, and
// /api/push/notify-chat-cancelled had no auth at all — anyone could POST an arbitrary
// customerId/vendorId and trigger a real push under a fabricated name/message to that
// person's phone, or falsely dismiss a real pending request notification.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');

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
  const tag = `pushauth-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let customer, astro;

  try {
    const { data: cust } = await db.from('customers').insert([{ name: `${tag}-cust`, mobile: `9${randDigits(9)}` }]).select('id').single();
    customer = cust;
    const { data: ast } = await db.from('astrologers').insert([{ first_name: `${tag}-astro`, phone_number: `8${randDigits(9)}` }]).select('id').single();
    astro = ast;

    const customerToken = jwt.sign({ id: customer.id, userId: customer.id, phone: 'n/a' }, JWT_SECRET, { expiresIn: '1h' });
    const vendorToken = jwt.sign({ id: astro.id, astroId: astro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── notify-chat-message: requires SOME valid signed JWT (forging one needs JWT_SECRET) ──
    const msgNoAuth = await postJson('/api/push/notify-chat-message', { customerId: customer.id, astrologerId: astro.id, message: 'hi' }, null);
    check('notify-chat-message: no token -> 401', msgNoAuth.status === 401);
    const msgBadToken = await postJson('/api/push/notify-chat-message', { customerId: customer.id, message: 'hi' }, 'not-a-real-jwt');
    check('notify-chat-message: garbage token -> 401', msgBadToken.status === 401);
    const msgWithVendor = await postJson('/api/push/notify-chat-message', { customerId: customer.id, message: 'hi' }, vendorToken);
    check('notify-chat-message: valid vendor token -> 200', msgWithVendor.status === 200);

    // ── notify-chat-request: requires SOME valid signed JWT ──
    const reqNoAuth = await postJson('/api/push/notify-chat-request', { vendorId: astro.id, callerId: customer.id, callerName: 'Fake Name' }, null);
    check('notify-chat-request: no token -> 401', reqNoAuth.status === 401);
    const reqBadToken = await postJson('/api/push/notify-chat-request', { vendorId: astro.id }, 'not-a-real-jwt');
    check('notify-chat-request: garbage token -> 401', reqBadToken.status === 401);
    const reqWithCustomer = await postJson('/api/push/notify-chat-request', { vendorId: astro.id }, customerToken);
    check('notify-chat-request: valid customer token -> 200', reqWithCustomer.status === 200);

    // ── notify-chat-cancelled: requires SOME valid signed JWT ──
    const cancelNoAuth = await postJson('/api/push/notify-chat-cancelled', { vendorId: astro.id, callerId: customer.id }, null);
    check('notify-chat-cancelled: no token -> 401', cancelNoAuth.status === 401);
    const cancelBadToken = await postJson('/api/push/notify-chat-cancelled', { vendorId: astro.id }, 'not-a-real-jwt');
    check('notify-chat-cancelled: garbage token -> 401', cancelBadToken.status === 401);
    const cancelWithCustomer = await postJson('/api/push/notify-chat-cancelled', { vendorId: astro.id }, customerToken);
    check('notify-chat-cancelled: valid customer token -> 200', cancelWithCustomer.status === 200);
  } finally {
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
