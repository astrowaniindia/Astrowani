// One-time merge of 3 customer rows that all share mobile 7877724833 (a signup race
// condition — no UNIQUE constraint existed on customers.mobile at the time). See
// DATABASE_HARDENING_HANDOFF.md and today's session notes. NOT idempotent — run once.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SURVIVOR_ID = 'e45d8d79-1ae0-4cfc-9440-04226185a6ec';
const DUP_IDS = ['0922754e-6e5d-4379-a79b-98c36ec7d1c7', '0d35fe40-14bc-4385-8412-eef18684abe4'];

const REKEY_TARGETS = [
  ['chat_sessions', 'caller_id'],
  ['wallet_transactions', 'user_id'],
  ['call_requests', 'customer_id'],
  ['chat_requests', 'caller_id'],
  ['notifications', 'customer_id'],
];

async function main() {
  for (const dupId of DUP_IDS) {
    for (const [table, col] of REKEY_TARGETS) {
      const { error, count } = await db.from(table).update({ [col]: SURVIVOR_ID }).eq(col, dupId).select('id', { count: 'exact' });
      if (error) { console.error(`FAILED re-keying ${table}.${col} for ${dupId}:`, error.message); process.exit(1); }
      console.log(`re-keyed ${table}.${col}: ${dupId} -> ${SURVIVOR_ID} (${count ?? '?'} rows)`);
    }
  }

  const { data: survivorBefore } = await db.from('customers').select('wallet_balance').eq('id', SURVIVOR_ID).single();
  let addedBalance = 0;
  for (const dupId of DUP_IDS) {
    const { data: dup } = await db.from('customers').select('wallet_balance').eq('id', dupId).single();
    addedBalance += Number(dup?.wallet_balance) || 0;
  }
  const newBalance = Number(survivorBefore.wallet_balance) + addedBalance;
  const { error: balErr } = await db.from('customers').update({ wallet_balance: newBalance }).eq('id', SURVIVOR_ID);
  if (balErr) { console.error('FAILED updating survivor balance:', balErr.message); process.exit(1); }
  console.log(`survivor balance: ${survivorBefore.wallet_balance} + ${addedBalance} = ${newBalance}`);

  for (const dupId of DUP_IDS) {
    const { error } = await db.from('customers').delete().eq('id', dupId);
    if (error) { console.error(`FAILED deleting duplicate ${dupId}:`, error.message); process.exit(1); }
    console.log(`deleted duplicate customer ${dupId}`);
  }

  console.log('\nMerge complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
