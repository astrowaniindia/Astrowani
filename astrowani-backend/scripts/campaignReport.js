// astrowani-backend/scripts/campaignReport.js
//
// Compare acquisition channels on what actually matters: not installs or cost per
// install, but how many of the people a channel brought in ever consulted and ever paid.
//
//   node --env-file=.env scripts/campaignReport.js [days]
//
// `days` defaults to 30. Read-only: it SELECTs and prints, and writes nothing.
//
// WHY THIS EXISTS. Google Ads reports cost per install, and on that measure the older
// campaign (24260607071) wins every time -- it buys installs at roughly Rs3.50 because
// Maximize-conversions found the cheapest inventory available. Measured over its first
// 15 days it brought 1,727 installs and 22 recharges: a 1.27% recharge rate. Cost per
// install is therefore the one number guaranteed to point the wrong way here, and it is
// the only number Google shows prominently. This report answers the other question.
//
// Campaign attribution comes from customers.acquisition_source, written at signup by
// src/acquisition.js from the Play Install Referrer. Google Ads referrers carry
// `gad_campaignid`, which is parsed into `google_ads_<campaignId>` -- so each campaign
// is its own row below with no extra tagging.
//
// KNOWN CAMPAIGNS
//   24260607071  - original broad App install campaign (from 2026-09-24)
//   24326942598  - "11 min call better geolocations", affluent metro radii, Rs350/day
//                  (launched 2026-10-08)
//
// A null acquisition_source means UNKNOWN, not organic: every iOS customer, every
// sideload, and everyone who signed up before the build carrying the native install
// referrer module shipped. Do not fold those into organic.

globalThis.WebSocket = globalThis.WebSocket || require('ws');
const { createClient } = require('@supabase/supabase-js');

const DAYS = Number(process.argv[2]) || 30;
const LABELS = {
  google_ads_24260607071: 'Google Ads - original broad',
  google_ads_24326942598: 'Google Ads - metro affluent (new)',
  'google-play': 'Organic Play Store',
};

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Supabase caps a select at 1000 rows; page through so a 2,700-customer window is not
// silently truncated into a wrong answer.
async function selectAll(table, columns, apply = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

(async () => {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();

  const customers = await selectAll('customers', 'id,acquisition_source,created_at',
    (q) => q.gte('created_at', since));
  const sessions = await selectAll('chat_sessions', 'caller_id');
  const paid = await selectAll('wallet_recharges', 'customer_id,amount',
    (q) => q.eq('status', 'paid'));

  const consulted = new Set(sessions.map((s) => s.caller_id));
  const spend = new Map();
  for (const p of paid) spend.set(p.customer_id, (spend.get(p.customer_id) || 0) + Number(p.amount || 0));

  const rows = new Map();
  for (const c of customers) {
    const key = c.acquisition_source || '(unknown - iOS/sideload/pre-referrer)';
    const r = rows.get(key) || { signups: 0, consulted: 0, payers: 0, revenue: 0 };
    r.signups += 1;
    if (consulted.has(c.id)) r.consulted += 1;
    if (spend.has(c.id)) { r.payers += 1; r.revenue += spend.get(c.id); }
    rows.set(key, r);
  }

  const pct = (n, d) => (d ? (100 * n / d).toFixed(2) + '%' : '-');
  const sorted = [...rows.entries()].sort((a, b) => b[1].signups - a[1].signups);

  console.log(`\nAcquisition by channel - last ${DAYS} days (as of ${new Date().toISOString().slice(0, 10)})\n`);
  console.log('channel'.padEnd(38) + 'signups'.padStart(8) + 'consult'.padStart(9)
    + 'activ%'.padStart(8) + 'payers'.padStart(8) + 'pay%'.padStart(8)
    + 'revenue'.padStart(10) + 'rev/signup'.padStart(12));
  console.log('-'.repeat(101));
  let t = { signups: 0, consulted: 0, payers: 0, revenue: 0 };
  for (const [src, r] of sorted) {
    const name = LABELS[src] || src;
    console.log(name.slice(0, 37).padEnd(38)
      + String(r.signups).padStart(8)
      + String(r.consulted).padStart(9)
      + pct(r.consulted, r.signups).padStart(8)
      + String(r.payers).padStart(8)
      + pct(r.payers, r.signups).padStart(8)
      + ('Rs' + Math.round(r.revenue)).padStart(10)
      + ('Rs' + (r.revenue / r.signups).toFixed(2)).padStart(12));
    for (const k of Object.keys(t)) t[k] += r[k];
  }
  console.log('-'.repeat(101));
  console.log('TOTAL'.padEnd(38) + String(t.signups).padStart(8) + String(t.consulted).padStart(9)
    + pct(t.consulted, t.signups).padStart(8) + String(t.payers).padStart(8)
    + pct(t.payers, t.signups).padStart(8) + ('Rs' + Math.round(t.revenue)).padStart(10)
    + ('Rs' + (t.revenue / t.signups).toFixed(2)).padStart(12));

  const a = rows.get('google_ads_24260607071');
  const b = rows.get('google_ads_24326942598');
  console.log('\nHEAD TO HEAD - the comparison this report exists for');
  if (!b || !b.signups) {
    console.log('  New campaign 24326942598 has no signups yet. Expect the first within');
    console.log('  4-24h of launch; give it 3-4 weeks before drawing any conclusion.');
  } else {
    console.log(`  original broad      rev/signup Rs${(a.revenue / a.signups).toFixed(2)}  pay-rate ${pct(a.payers, a.signups)}  (n=${a.signups})`);
    console.log(`  metro affluent      rev/signup Rs${(b.revenue / b.signups).toFixed(2)}  pay-rate ${pct(b.payers, b.signups)}  (n=${b.signups})`);
    if (b.signups < 300) {
      console.log(`\n  CAUTION: n=${b.signups} is too small to trust. At a ~1-5% pay rate you need`);
      console.log('  several hundred signups before the difference means anything.');
    }
  }
  console.log();
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
