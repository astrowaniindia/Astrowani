// Verification for customer-side blocking of an astrologer (sql/astrologer_blocks.sql,
// src/customerModeration.js, src/moderationRoutes.js).
//
// Run:  node --env-file=.env scripts/chatModerationCheck.js
//
// index.js is NEVER booted here. Booting it starts sessionManager's 30s billing worker
// against the LIVE production database (CLAUDE.md standing rules, and the
// local-backend-bills-production memory). This mounts ONLY the moderation routes on a
// bare Express app on an ephemeral port, so there is no port to clash over and no
// EADDRINUSE to mistake for a product failure.
//
// It drives the REAL routes over HTTP with real signed JWTs, because a harness that only
// calls the module proves the module, not the delivery path (CLAUDE.md BN). Every refusal
// is preceded by a POSITIVE CONTROL, so a route that refused everything could not pass.
const express = require('express');
const jwt = require('jsonwebtoken');

// Node 20 has no global WebSocket, which @supabase/realtime-js needs at import time, so
// merely REQUIRING anything that builds a Supabase client throws. Shimmed here, in a
// local-only script, and deliberately NOT in src/ — the VPS's Node does not need it.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fails loudly below */ }
}

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const moderation = require('../src/customerModeration');

// The store-reviewer pair, which exist on production and own no real consultations.
const CUSTOMER_PHONE = '9999999999';
const ASTROLOGER_ID = '1f70210e-6234-4f49-a764-13e851968e1e';

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing - run with --env-file=.env');

  const { data: cust } = await db
    .from('customers').select('id, mobile').eq('mobile', CUSTOMER_PHONE).maybeSingle();
  if (!cust) throw new Error('reviewer customer ' + CUSTOMER_PHONE + ' not found');
  const CUSTOMER_ID = cust.id;

  // Refuse to run if a real block already exists for this pair: the teardown deletes it,
  // and deleting something a person actually set would be worse than not testing.
  const { data: pre } = await db.from('astrologer_blocks').select('id')
    .eq('customer_id', CUSTOMER_ID).eq('astrologer_id', ASTROLOGER_ID);
  if (pre && pre.length) throw new Error('a block already exists for this pair - refusing to run');

  const app = express();
  app.use(express.json());
  require('../src/moderationRoutes')(app);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const customerToken = jwt.sign({ userId: CUSTOMER_ID, phone: CUSTOMER_PHONE }, process.env.JWT_SECRET);
  const vendorToken = jwt.sign({ astroId: ASTROLOGER_ID, role: 'astrologer' }, process.env.JWT_SECRET);

  const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
      ),
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON */ }
    return { status: res.status, json };
  };

  const rows = async () => {
    const { data } = await db.from('astrologer_blocks').select('id, reason')
      .eq('customer_id', CUSTOMER_ID).eq('astrologer_id', ASTROLOGER_ID);
    return data || [];
  };

  try {
    console.log('\n-- positive controls first --');
    const notYet = await moderation.isBlockedByCustomer(CUSTOMER_ID, ASTROLOGER_ID);
    check('not blocked before we start', notYet === false, String(notYet));
    const contactOpenBefore = await moderation.isContactBlocked(ASTROLOGER_ID, CUSTOMER_ID);
    check('contact is allowed before the block', contactOpenBefore === false, String(contactOpenBefore));

    const blocked = await call('POST', '/api/astrologers/block', customerToken,
      { astrologerId: ASTROLOGER_ID, reason: 'harassment' });
    check('block returns 200', blocked.status === 200, String(blocked.status));
    check('block reports success', blocked.json && blocked.json.success === true);
    check('exactly one row written', (await rows()).length === 1);
    check('reason stored', (await rows())[0] && (await rows())[0].reason === 'harassment');

    console.log('\n-- the block actually bites --');
    const nowBlocked = await moderation.isBlockedByCustomer(CUSTOMER_ID, ASTROLOGER_ID);
    check('isBlockedByCustomer is true', nowBlocked === true);
    // The one that matters: the three contact paths in index.js call isContactBlocked,
    // so a customer-side block that this missed would be recorded and then ignored.
    const contactBlocked = await moderation.isContactBlocked(ASTROLOGER_ID, CUSTOMER_ID);
    check('isContactBlocked sees a CUSTOMER-side block', contactBlocked === true);
    // And the astrologer-side direction must be untouched by any of this.
    const astroSide = await moderation.isBlocked(ASTROLOGER_ID, CUSTOMER_ID);
    check('astrologer-side block still false (directions independent)', astroSide === false);

    console.log('\n-- idempotency --');
    const again = await call('POST', '/api/astrologers/block', customerToken,
      { astrologerId: ASTROLOGER_ID, reason: 'harassment' });
    check('second block returns 200', again.status === 200, String(again.status));
    check('second block reports alreadyBlocked', again.json && again.json.alreadyBlocked === true);
    check('still exactly one row', (await rows()).length === 1);

    console.log('\n-- the list is scoped to the caller --');
    const list = await call('GET', '/api/astrologers/blocked', customerToken);
    check('list returns 200', list.status === 200, String(list.status));
    const entry = (list.json && list.json.blocked || []).find((b) => b.astrologerId === ASTROLOGER_ID);
    check('list contains the block', !!entry);
    check('list resolves a name', !!(entry && entry.name && entry.name !== 'Astrologer'), entry && entry.name);

    console.log('\n-- refusals (each one had a positive control above) --');
    const noAuth = await call('POST', '/api/astrologers/block', null, { astrologerId: ASTROLOGER_ID });
    check('unauthenticated block refused 401', noAuth.status === 401, String(noAuth.status));

    // The trap this exists for: 9999999999 is BOTH a customer and an astrologer, and the
    // lookup works by phone, so an astrologer token must be refused before any lookup or
    // it would act in the customer's name. Same trap as /api/requests/:kind/:id/status.
    const asVendor = await call('POST', '/api/astrologers/block', vendorToken, { astrologerId: ASTROLOGER_ID });
    check('astrologer token refused 401', asVendor.status === 401, String(asVendor.status));
    const vendorList = await call('GET', '/api/astrologers/blocked', vendorToken);
    check('astrologer token cannot read the list', vendorList.status === 401, String(vendorList.status));

    const noId = await call('POST', '/api/astrologers/block', customerToken, {});
    check('missing astrologerId refused 400', noId.status === 400, String(noId.status));

    const badReason = await call('POST', '/api/astrologers/block', customerToken,
      { astrologerId: ASTROLOGER_ID, reason: 'not-a-real-reason' });
    check('unknown reason refused 400', badReason.status === 400, String(badReason.status));
    check('a refused call wrote nothing', (await rows()).length === 1);

    console.log('\n-- unblock --');
    const un = await call('POST', '/api/astrologers/unblock', customerToken, { astrologerId: ASTROLOGER_ID });
    check('unblock returns 200', un.status === 200, String(un.status));
    check('row removed', (await rows()).length === 0);
    check('contact allowed again', (await moderation.isContactBlocked(ASTROLOGER_ID, CUSTOMER_ID)) === false);

    const unAgain = await call('POST', '/api/astrologers/unblock', customerToken, { astrologerId: ASTROLOGER_ID });
    check('unblocking twice is a success, not a 404', unAgain.status === 200, String(unAgain.status));
  } finally {
    await db.from('astrologer_blocks').delete()
      .eq('customer_id', CUSTOMER_ID).eq('astrologer_id', ASTROLOGER_ID);
    const left = await rows();
    check('teardown left nothing behind', left.length === 0, String(left.length));
    server.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
