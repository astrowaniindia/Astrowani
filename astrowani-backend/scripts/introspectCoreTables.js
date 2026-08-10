// READ-ONLY: samples one row from each core ad-hoc table (the ones with no
// sql/*.sql schema file, per the 2026-08-07 data-layer audit) to learn real
// column names + infer reasonable types, so a local dev mirror can be built.
// Does not write anything.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TABLES = [
  'customers', 'astrologers', 'chat_sessions', 'chat_requests',
  'call_requests', 'chat_messages', 'wallet_transactions', 'vendor_wallet_transactions',
];

function inferType(value) {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'numeric' : 'numeric';
  if (typeof value === 'object') return 'jsonb';
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'uuid';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'timestamptz';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    return 'text';
  }
  return 'text';
}

async function main() {
  const schema = {};
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select('*').limit(1);
    if (error) {
      console.log(`-- ${table}: ERROR (${error.message})`);
      continue;
    }
    const row = data && data[0];
    if (!row) {
      console.log(`-- ${table}: no rows to sample, skipping (create manually if needed)`);
      continue;
    }
    schema[table] = Object.entries(row).map(([col, val]) => ({ col, type: inferType(val) }));
  }
  console.log(JSON.stringify(schema, null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
