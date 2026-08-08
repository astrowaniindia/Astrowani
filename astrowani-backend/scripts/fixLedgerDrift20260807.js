// One-time correction of the ₹5,865+ ledger drift found in the 2026-08-07 audit
// (DATABASE_HARDENING_HANDOFF.md §3.5/§7.4). NOT idempotent by design — run once.
//
// Direction of each fix was decided per-account from actual transaction history,
// not a blanket "trust the ledger" or "trust the balance" rule:
//   - Customer accounts: balance sits well ABOVE what the ledger accounts for,
//     across a real, heavily-used account. Truing the balance down to the ledger
//     would put a real account deep in the negative — implausible, and would
//     take real money from a real user over what's admittedly an incomplete
//     historical log (the exact "lost update" bug the audit found predates the
//     atomic wallet functions). Fix: backfill a labeled reconciliation ledger
//     entry to match the CURRENT balance. Balances are untouched.
//   - Astrologer account: ledger shows more earned than the wallet balance
//     reflects, on a real, heavily-used account — a legitimate credit that
//     never landed. Fix: bump the actual balance to match, since that money is
//     real and withdrawable. No new ledger row (the earning is already logged;
//     the balance update is what was lost).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CUSTOMER_FIXES = [
  { id: '550e8400-e29b-41d4-a716-446655440000', amount: 4870, note: 'Historical drift reconciliation (test/seed account, pre-hardening lost-ledger-entry bug, 2026-08-07 audit)' },
  { id: 'e45d8d79-1ae0-4cfc-9440-04226185a6ec', amount: 965, note: 'Historical drift reconciliation — pre-hardening lost-update bug (2026-08-07 audit); balance left untouched, ledger backfilled to match' },
  { id: '0922754e-6e5d-4379-a79b-98c36ec7d1c7', amount: 460, note: 'Historical drift reconciliation — duplicate signup row (no unique constraint on customers.mobile at the time), balance never logged to ledger' },
  { id: '0d35fe40-14bc-4385-8412-eef18684abe4', amount: 460, note: 'Historical drift reconciliation — duplicate signup row (no unique constraint on customers.mobile at the time), balance never logged to ledger' },
];

const ASTRO_FIX = { id: '5fcbcbd7-c0a6-45ad-99ca-b9a6bcbd98ec', amount: 30, note: 'Historical drift correction — legitimate earning per ledger that never landed in wallet_balance (2026-08-07 audit)' };

async function main() {
  for (const fix of CUSTOMER_FIXES) {
    const { data: before } = await db.from('customers').select('wallet_balance').eq('id', fix.id).single();
    const { error } = await db.from('wallet_transactions').insert([{
      user_id: fix.id, type: 'credit', amount: fix.amount, description: fix.note,
    }]);
    if (error) { console.error('FAILED customer', fix.id, error.message); continue; }
    console.log(`customer ${fix.id}: backfilled +${fix.amount} ledger entry. balance unchanged at ${before.wallet_balance}.`);
  }

  const { data: astroBefore } = await db.from('astrologers').select('wallet_balance').eq('id', ASTRO_FIX.id).single();
  const newBalance = Number(astroBefore.wallet_balance) + ASTRO_FIX.amount;
  const { error: updErr } = await db.from('astrologers').update({ wallet_balance: newBalance }).eq('id', ASTRO_FIX.id);
  if (updErr) { console.error('FAILED astrologer', ASTRO_FIX.id, updErr.message); }
  else console.log(`astrologer ${ASTRO_FIX.id}: balance ${astroBefore.wallet_balance} -> ${newBalance} (+${ASTRO_FIX.amount}, ${ASTRO_FIX.note})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
