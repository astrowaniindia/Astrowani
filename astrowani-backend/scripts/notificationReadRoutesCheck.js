// Verifies the 2026-11-13 notification read routes that let hardening_25 revoke anon
// SELECT on `notifications`. Run: node --env-file=.env scripts/notificationReadRoutesCheck.js
//
// index.js is NEVER booted (it starts the billing worker against production). Only the
// two notification route modules are mounted, in index.js's order, on an ephemeral port.
// Read-only: it writes nothing, so there is nothing to tear down.
//
// Every number is compared against a direct service-role query of the same rows, so a
// route that returned an empty list would FAIL rather than pass "nothing leaked".
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const live = (n) => !n.expires_at || new Date(n.expires_at).getTime() > Date.now();

async function pickOwner(column) {
  const { data } = await db.from('notifications').select(column).not(column, 'is', null)
    .eq('is_read', false).order('created_at', { ascending: false }).limit(200);
  const counts = {};
  for (const r of data || []) counts[r[column]] = (counts[r[column]] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
async function truth(column, id) {
  const { data } = await db.from('notifications').select('id, is_read, expires_at, customer_id, astrologer_id')
    .eq(column, id).order('created_at', { ascending: false }).limit(100);
  const rows = (data || []).filter(live);
  const { data: un } = await db.from('notifications').select('expires_at').eq(column, id).eq('is_read', false).limit(1000);
  return { rows, unread: (un || []).filter(live).length };
}

(async () => {
  const app = express();
  app.use(express.json());
  app.locals.io = null;
  require('../src/notificationRoutes')(app);
  require('../src/notifications/routes')(app);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`  (bare Express on ${base} — index.js never booted)`);
  const get = async (path, token) => {
    const r = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    let body = null; try { body = await r.json(); } catch (_) {}
    return { status: r.status, body };
  };

  const custId = await pickOwner('customer_id');
  const astroId = await pickOwner('astrologer_id');
  ok('found a customer with unread notifications (positive control)', !!custId);
  ok('found an astrologer with unread notifications (positive control)', !!astroId);
  const { data: cust } = await db.from('customers').select('id, mobile').eq('id', custId).maybeSingle();
  const custTok = jwt.sign({ id: cust.id, userId: cust.id, phone: cust.mobile }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const astroTok = jwt.sign({ id: astroId, astroId, role: 'astrologer' }, process.env.JWT_SECRET, { expiresIn: '5m' });

  console.log('\n— customer');
  const ct = await truth('customer_id', custId);
  const cl = await get('/api/notifications/list?limit=100', custTok);
  ok('customer list 200', cl.status === 200, cl.status);
  ok('customer list non-empty', (cl.body?.data || []).length > 0);
  ok('customer list matches the database row-for-row',
    JSON.stringify((cl.body?.data || []).map((n) => n.id)) === JSON.stringify(ct.rows.map((n) => n.id)),
    { got: cl.body?.data?.length, want: ct.rows.length });
  ok('customer list holds only this customer\'s rows', (cl.body?.data || []).every((n) => !('customer_id' in n) || n.customer_id === custId));
  const cc = await get('/api/notifications/unread-count', custTok);
  ok('customer unread count 200', cc.status === 200, cc.status);
  ok('customer unread count matches the database', cc.body?.unread === ct.unread, { got: cc.body?.unread, want: ct.unread });
  ok('customer unread count is positive (control)', ct.unread > 0);

  console.log('\n— astrologer');
  const at = await truth('astrologer_id', astroId);
  const al = await get('/api/vendor/notifications/list?limit=100', astroTok);
  ok('astrologer list 200', al.status === 200, al.status);
  ok('astrologer list non-empty', (al.body?.data || []).length > 0);
  ok('astrologer list matches the database row-for-row',
    JSON.stringify((al.body?.data || []).map((n) => n.id)) === JSON.stringify(at.rows.map((n) => n.id)),
    { got: al.body?.data?.length, want: at.rows.length });
  const ac = await get('/api/vendor/notifications/unread-count', astroTok);
  ok('astrologer unread count matches the database', ac.body?.unread === at.unread, { got: ac.body?.unread, want: at.unread });

  console.log('\n— refusals');
  for (const p of ['/api/notifications/list', '/api/notifications/unread-count', '/api/vendor/notifications/list', '/api/vendor/notifications/unread-count']) {
    ok(`${p} without a token -> 401`, (await get(p)).status === 401);
    ok(`${p} with a forged token -> 401`, (await get(p, jwt.sign({ id: custId, astroId, role: 'astrologer', phone: cust.mobile }, 'not-the-secret-' + 'x'.repeat(40)))).status === 401);
  }
  ok('an ASTROLOGER token cannot read the customer list', (await get('/api/notifications/list', astroTok)).status === 401);
  ok('an ASTROLOGER token cannot read the customer count', (await get('/api/notifications/unread-count', astroTok)).status === 401);
  ok('a CUSTOMER token cannot read the astrologer list', (await get('/api/vendor/notifications/list', custTok)).status === 401);
  ok('a CUSTOMER token cannot read the astrologer count', (await get('/api/vendor/notifications/unread-count', custTok)).status === 401);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
