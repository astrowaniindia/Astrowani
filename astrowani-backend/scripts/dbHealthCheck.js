#!/usr/bin/env node
/**
 * Database health check — read-only.
 *
 * WHY: the failure modes this catches are all silent. A session stuck with
 * is_active=true blocks its astrologer from ever receiving another request, but
 * nothing errors and nothing logs. A wallet balance that has drifted from its
 * ledger looks completely normal on screen. An orphaned foreign key only shows
 * up when someone opens a history screen months later. None of these announce
 * themselves — you have to go and ask.
 *
 * Usage:
 *   node --env-file=.env scripts/dbHealthCheck.js
 *   node --env-file=.env scripts/dbHealthCheck.js --json     # for cron / alerting
 *
 * Exits 0 when clean, 1 when any CRITICAL check fails — so it can be wired to a
 * scheduler and alert on non-zero.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JSON_OUT = process.argv.includes('--json');

if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Run with --env-file=.env');
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (q) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`${q} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const findings = [];
const report = (severity, check, detail, rows = []) =>
  findings.push({ severity, check, detail, sample: rows.slice(0, 5) });

async function stuckSessions() {
  const rows = await get('chat_sessions?select=id,vendor_id,caller_id,call_type,started_at,next_billing_at&is_active=eq.true');
  const now = Date.now();
  // next_billing_at IS NULL is the dangerous one: checkActiveSessions filters on
  // next_billing_at <= now, so a null never bills and never terminates — but
  // busyStatus still counts the row as busy, so the astrologer is locked out.
  const zombie = rows.filter(
    (s) => !s.next_billing_at || (s.started_at && now - new Date(s.started_at).getTime() > 6 * 3600e3),
  );
  if (zombie.length) {
    const vendors = [...new Set(zombie.map((s) => s.vendor_id))];
    report('CRITICAL', 'stuck-sessions',
      `${zombie.length} session(s) active but unbillable — ${vendors.length} astrologer(s) permanently unable to receive requests`,
      zombie.map((s) => ({ id: s.id, vendor_id: s.vendor_id, started_at: s.started_at, next_billing_at: s.next_billing_at })));
  }
  return `${rows.length} active session(s), ${zombie.length} stuck`;
}

async function ledgerDrift() {
  const [customers, astros, wtx, vtx] = await Promise.all([
    get('customers?select=id,name,wallet_balance'),
    get('astrologers?select=id,first_name,wallet_balance'),
    get('wallet_transactions?select=user_id,type,amount&limit=100000'),
    get('vendor_wallet_transactions?select=vendor_id,type,amount&limit=100000'),
  ]);
  const sum = (rows, key) => rows.reduce((m, r) => {
    m[r[key]] = (m[r[key]] || 0) + (r.type === 'credit' ? 1 : -1) * Number(r.amount || 0);
    return m;
  }, {});
  const cSum = sum(wtx, 'user_id');
  const vSum = sum(vtx, 'vendor_id');
  const drifted = [];
  for (const c of customers) {
    if (cSum[c.id] === undefined) continue;
    const d = Number(c.wallet_balance || 0) - cSum[c.id];
    if (Math.abs(d) > 0.01) drifted.push({ kind: 'customer', id: c.id, name: c.name, balance: c.wallet_balance, ledger: +cSum[c.id].toFixed(2), drift: +d.toFixed(2) });
  }
  for (const a of astros) {
    if (vSum[a.id] === undefined) continue;
    const d = Number(a.wallet_balance || 0) - vSum[a.id];
    if (Math.abs(d) > 0.01) drifted.push({ kind: 'astrologer', id: a.id, name: a.first_name, balance: a.wallet_balance, ledger: +vSum[a.id].toFixed(2), drift: +d.toFixed(2) });
  }
  if (drifted.length) {
    const total = drifted.reduce((s, d) => s + Math.abs(d.drift), 0);
    report('CRITICAL', 'ledger-drift',
      `${drifted.length} account(s) whose stored balance does not match their transaction history (total unexplained: ₹${total.toFixed(2)})`,
      drifted);
  }
  return `${customers.length + astros.length} accounts checked, ${drifted.length} drifted`;
}

async function orphans() {
  const [customers, astros] = await Promise.all([
    get('customers?select=id'), get('astrologers?select=id'),
  ]);
  const cIds = new Set(customers.map((c) => c.id));
  const aIds = new Set(astros.map((a) => a.id));
  const checks = [
    ['chat_sessions', 'caller_id', cIds], ['chat_sessions', 'vendor_id', aIds],
    ['chat_requests', 'caller_id', cIds], ['chat_requests', 'receiver_id', aIds],
    ['call_requests', 'customer_id', cIds], ['call_requests', 'astrologer_id', aIds],
    ['wallet_transactions', 'user_id', cIds], ['vendor_wallet_transactions', 'vendor_id', aIds],
  ];
  let total = 0;
  for (const [table, col, valid] of checks) {
    const rows = await get(`${table}?select=${col}&limit=100000`);
    const bad = [...new Set(rows.filter((r) => r[col] && !valid.has(r[col])).map((r) => r[col]))];
    if (bad.length) {
      total += bad.length;
      report('WARNING', 'orphan-reference',
        `${table}.${col} points at ${bad.length} id(s) that do not exist — no foreign key is enforcing this`,
        bad.map((v) => ({ value: v })));
    }
  }
  return `${checks.length} relationships checked, ${total} orphaned id(s)`;
}

async function negativeBalances() {
  const [c, a] = await Promise.all([
    get('customers?select=id,name,wallet_balance&wallet_balance=lt.0'),
    get('astrologers?select=id,first_name,wallet_balance&wallet_balance=lt.0'),
  ]);
  if (c.length || a.length) {
    report('CRITICAL', 'negative-balance',
      `${c.length} customer(s) and ${a.length} astrologer(s) have a negative wallet balance`,
      [...c, ...a]);
  }
  return `${c.length + a.length} negative`;
}

async function stalePending() {
  const cutoff = new Date(Date.now() - 5 * 60e3).toISOString();
  let total = 0;
  for (const t of ['call_requests', 'chat_requests']) {
    const rows = await get(`${t}?select=id,status,created_at&status=eq.pending&created_at=lt.${cutoff}`);
    if (rows.length) {
      total += rows.length;
      report('WARNING', 'stale-pending-request',
        `${rows.length} ${t} row(s) still 'pending' after 5 minutes — the 75s markStaleRequestsMissed sweep should have cleared these`,
        rows);
    }
  }
  return `${total} stale`;
}

async function unfinalizedSessions() {
  const rows = await get('chat_sessions?select=id,vendor_id,started_at&is_active=eq.false&ended_at=is.null');
  if (rows.length) {
    report('WARNING', 'unfinalized-session',
      `${rows.length} session(s) are inactive but have no ended_at — billing was never finalized for these`,
      rows);
  }
  return `${rows.length} unfinalized`;
}

async function anonExposure() {
  // The publishable key both apps ship. If this can read customers, RLS is not
  // protecting the table and every user's PII is public.
  const anon = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
  const probe = async (table) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    return r.ok;
  };
  const exposed = [];
  for (const t of ['customers', 'astrologers', 'chat_messages', 'chat_sessions', 'wallet_transactions']) {
    if (await probe(t)) exposed.push(t);
  }
  if (exposed.length) {
    report('CRITICAL', 'anon-readable',
      `${exposed.length} table(s) are readable with the public app key: ${exposed.join(', ')}. ` +
      'See sql/hardening_02_access_control.sql.',
      exposed.map((t) => ({ table: t })));
  }
  return `${exposed.length} table(s) exposed to the public key`;
}

(async () => {
  const checks = [
    ['Stuck sessions', stuckSessions],
    ['Ledger vs balance', ledgerDrift],
    ['Orphaned references', orphans],
    ['Negative balances', negativeBalances],
    ['Stale pending requests', stalePending],
    ['Unfinalized sessions', unfinalizedSessions],
    ['Public-key exposure', anonExposure],
  ];

  const summary = [];
  for (const [name, fn] of checks) {
    try {
      summary.push([name, await fn()]);
    } catch (err) {
      report('ERROR', 'check-failed', `${name}: ${err.message}`);
      summary.push([name, `FAILED: ${err.message}`]);
    }
  }

  const critical = findings.filter((f) => f.severity === 'CRITICAL');

  if (JSON_OUT) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), summary, findings }, null, 2));
  } else {
    console.log('\nAstrowani database health check —', new Date().toISOString());
    console.log('='.repeat(72));
    summary.forEach(([n, s]) => console.log(`  ${n.padEnd(26)} ${s}`));
    if (!findings.length) {
      console.log('\n  No issues found.\n');
    } else {
      console.log(`\n${findings.length} finding(s):\n`);
      for (const f of findings) {
        console.log(`[${f.severity}] ${f.check}`);
        console.log(`  ${f.detail}`);
        f.sample.forEach((s) => console.log(`    ${JSON.stringify(s)}`));
        console.log('');
      }
    }
  }
  process.exit(critical.length ? 1 : 0);
})();
