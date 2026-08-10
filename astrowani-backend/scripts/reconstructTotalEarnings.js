// Read-only reconstruction of astrologers.total_earnings after the accidental
// reset (see CLAUDE.md's Database Audit / sessionManager.js earnings-reset fix).
// total_earnings is never decremented in normal operation (withdrawals and admin
// corrections always pass countEarnings:false) — only the monthly reset zeroes it.
// So the correct lifetime figure is simply the sum of every earning credit ever
// recorded in vendor_wallet_transactions (every chat/call/video billing tick and
// every gift credit inserts a type='credit' row there with the exact amount that
// was added to total_earnings at the time).
//
// This script ONLY READS data — it does not write, update, or reset anything.
// Deliberately does not import index.js/sessionManager.js to avoid any chance of
// triggering their startup side effects.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env)');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: astrologers, error: astroErr } = await db
    .from('astrologers')
    .select('id, first_name, last_name, total_earnings');
  if (astroErr) throw astroErr;

  // Paginate through vendor_wallet_transactions — could be a large table.
  const creditByVendor = new Map();
  const PAGE_SIZE = 1000;
  let from = 0;
  for (;;) {
    const { data: rows, error } = await db
      .from('vendor_wallet_transactions')
      .select('vendor_id, amount, type')
      .eq('type', 'credit')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const prev = creditByVendor.get(row.vendor_id) || 0;
      creditByVendor.set(row.vendor_id, prev + Number(row.amount || 0));
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const results = astrologers
    .map((a) => {
      const reconstructed = creditByVendor.get(a.id) || 0;
      const current = Number(a.total_earnings || 0);
      return {
        id: a.id,
        name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || '(no name)',
        current_total_earnings: current,
        reconstructed_total_earnings: Math.round(reconstructed * 100) / 100,
        difference: Math.round((reconstructed - current) * 100) / 100,
      };
    })
    .filter((r) => r.reconstructed_total_earnings > 0 || r.current_total_earnings > 0)
    .sort((a, b) => b.reconstructed_total_earnings - a.reconstructed_total_earnings);

  console.log(`\nFound ${results.length} astrologer(s) with nonzero current or reconstructed earnings.\n`);
  console.table(results);

  const totalReconstructed = results.reduce((sum, r) => sum + r.reconstructed_total_earnings, 0);
  console.log(`\nSum of all reconstructed total_earnings: ₹${totalReconstructed.toFixed(2)}`);
  console.log('\nThis script has NOT written anything. Nothing has been changed.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
