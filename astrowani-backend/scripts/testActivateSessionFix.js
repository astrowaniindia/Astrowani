// Verifies the 2026-08-08 fix for sessionManager.activateSession resurrecting an already-
// terminated session (see security-audit-2026-08-08.md). Exercises the function directly
// against real (throwaway) chat_sessions rows in production — no HTTP layer needed since
// this is pure DB logic.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sessionManager = require('../src/sessionManager');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

async function main() {
  const tag = `actfix-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let customer, astro;
  const sessionIds = [];

  try {
    const { data: cust } = await db.from('customers').insert([{ name: tag, mobile: `9${randDigits(9)}`, wallet_balance: 500 }]).select('id').single();
    customer = cust;
    const { data: ast } = await db.from('astrologers').insert([{ first_name: tag, phone_number: `8${randDigits(9)}`, call_charge_per_minute: 15 }]).select('id').single();
    astro = ast;

    // ── Scenario 1: session already ended — activateSession must be a no-op ────────
    const { data: endedSession } = await db.from('chat_sessions').insert([{
      caller_id: customer.id, vendor_id: astro.id, per_minute_charge: 15, call_type: 'audio',
      is_active: false, next_billing_at: null, started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    }]).select('id').single();
    sessionIds.push(endedSession.id);

    const replayResult = await sessionManager.activateSession(endedSession.id);
    check('replay against ended session: returns false', replayResult === false);
    const { data: afterReplay } = await db.from('chat_sessions').select('is_active, next_billing_at').eq('id', endedSession.id).single();
    check('replay against ended session: is_active still false', afterReplay?.is_active === false);
    check('replay against ended session: next_billing_at still null (billing not restarted)', afterReplay?.next_billing_at === null);

    // ── Scenario 2: fresh, never-activated session — should activate normally ──────
    const { data: freshSession } = await db.from('chat_sessions').insert([{
      caller_id: customer.id, vendor_id: astro.id, per_minute_charge: 15, call_type: 'audio',
      is_active: false, next_billing_at: null, started_at: new Date().toISOString(),
    }]).select('id').single();
    sessionIds.push(freshSession.id);

    const freshResult = await sessionManager.activateSession(freshSession.id);
    check('fresh session: activation returns true', freshResult === true);
    const { data: afterFresh } = await db.from('chat_sessions').select('is_active, next_billing_at').eq('id', freshSession.id).single();
    check('fresh session: is_active now true', afterFresh?.is_active === true);
    check('fresh session: next_billing_at now set', !!afterFresh?.next_billing_at);

    // ── Scenario 3: nonexistent session id — should fail gracefully, not throw ─────
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const fakeResult = await sessionManager.activateSession(fakeId);
    check('nonexistent session: returns false, no throw', fakeResult === false);
  } finally {
    for (const id of sessionIds) await db.from('chat_sessions').delete().eq('id', id);
    if (customer) await db.from('customers').delete().eq('id', customer.id);
    if (astro) await db.from('astrologers').delete().eq('id', astro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
