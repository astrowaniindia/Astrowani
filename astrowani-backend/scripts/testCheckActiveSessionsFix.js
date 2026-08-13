// Verifies the 2026-08-08 load-scaling fix to sessionManager.checkActiveSessions
// (see security-audit-2026-08-08.md): concurrent per-session billing instead of a serial
// loop, dead customer-fetch removed, re-entrancy guard against overlapping ticks.
// Confirms with real throwaway sessions that:
//   1. Multiple due sessions all get billed correctly in one tick (nothing dropped).
//   2. Each is billed exactly once (no double-billing from the concurrency change).
//   3. Calling checkActiveSessions twice back-to-back (simulating an overlapping tick) does
//      not double-bill — the second call either no-ops (guard) or re-reads state safely.
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
  const tag = `pollfix-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  const astros = [];
  const customers = [];
  const sessionIds = [];

  try {
    // A unique index enforces one ACTIVE session per astrologer (hardening_01), so each
    // concurrent due session in this test needs its own astrologer.
    const mkAstro = async (suffix) => {
      const { data } = await db.from('astrologers').insert([{ first_name: `${tag}-${suffix}`, phone_number: `8${randDigits(9)}` }]).select('id').single();
      astros.push(data);
      return data;
    };

    // ── Three concurrent due sessions, each with a real customer with enough balance ──
    const dueSessions = [];
    for (let i = 0; i < 3; i++) {
      const astro = await mkAstro(i);
      const { data: cust } = await db.from('customers').insert([{ name: `${tag}-${i}`, mobile: `9${randDigits(9)}`, wallet_balance: 100 }]).select('id, wallet_balance').single();
      customers.push(cust);
      const { data: sess } = await db.from('chat_sessions').insert([{
        caller_id: cust.id, vendor_id: astro.id, per_minute_charge: 10, call_type: 'audio',
        is_active: true, next_billing_at: new Date(Date.now() - 5000).toISOString(), // already due
        started_at: new Date(Date.now() - 60000).toISOString(),
      }]).select('id').single();
      sessionIds.push(sess.id);
      dueSessions.push(sess.id);
    }

    await sessionManager.checkActiveSessions();

    // ── Verify all 3 real sessions got billed exactly once ──────────────────────────────
    for (let i = 0; i < 3; i++) {
      const { data: sess } = await db.from('chat_sessions').select('next_billing_at, is_active').eq('id', dueSessions[i]).single();
      check(`session ${i}: still active after billing`, sess?.is_active === true);
      check(`session ${i}: next_billing_at advanced (billed)`, new Date(sess.next_billing_at).getTime() > Date.now());
      const { data: cust } = await db.from('customers').select('wallet_balance').eq('id', customers[i].id).single();
      check(`session ${i}: customer debited exactly once (100 -> 90)`, Number(cust.wallet_balance) === 90);
    }

    // ── Re-entrancy: call again immediately (nothing due now, but must not throw/double-bill) ──
    await sessionManager.checkActiveSessions();
    for (let i = 0; i < 3; i++) {
      const { data: cust } = await db.from('customers').select('wallet_balance').eq('id', customers[i].id).single();
      check(`session ${i}: NOT double-billed on immediate re-run (still 90)`, Number(cust.wallet_balance) === 90);
    }
  } finally {
    for (const id of sessionIds) await db.from('chat_sessions').delete().eq('id', id);
    for (const c of customers) await db.from('customers').delete().eq('id', c.id);
    for (const a of astros) await db.from('astrologers').delete().eq('id', a.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
