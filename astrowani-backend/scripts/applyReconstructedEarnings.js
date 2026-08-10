// One-time correction: writes back the exact total_earnings values that
// scripts/reconstructTotalEarnings.js calculated and the user reviewed and
// approved. Deliberately hardcodes just these two rows (not a generic re-run
// of the reconstruction formula) so this script can never silently apply to
// astrologers the user didn't actually see and approve.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORRECTIONS = [
  { id: '5fcbcbd7-c0a6-45ad-99ca-b9a6bcbd98ec', name: 'Manu Sharma', total_earnings: 5625 },
  { id: '8d24b394-e506-435c-b846-e77aaf11c27a', name: 'ansh sharma', total_earnings: 321 },
];

async function main() {
  for (const c of CORRECTIONS) {
    const { data, error } = await db
      .from('astrologers')
      .update({ total_earnings: c.total_earnings })
      .eq('id', c.id)
      .select('id, first_name, last_name, total_earnings');
    if (error) {
      console.error(`FAILED for ${c.name} (${c.id}):`, error.message);
      continue;
    }
    console.log(`${c.name} (${c.id}) → total_earnings now ${data?.[0]?.total_earnings}`);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
