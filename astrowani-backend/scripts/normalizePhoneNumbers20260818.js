// One-time normalization of stored phone numbers to the canonical bare-10-digit
// form, matching normalizePhone() in index.js. See MD files/otp-audit-2026-08-18.md.
//
// WHY: toE164Strict was only ever applied to the outbound SMS field. The raw
// request-body string was what keyed customers.mobile, astrologers.phone_number
// and the JWT `phone` claim — so the same handset could be several different
// accounts depending on how the number was typed. A customer stored as
// "+919119395097" got 404 NO_ACCOUNT (and therefore no SMS at all, ever) when
// they typed their number normally.
//
// The code fix (normalizePhone at both OTP endpoints) stops NEW rows going bad.
// This script repairs the rows already written.
//
// SAFE BY DEFAULT — dry run unless you pass --apply:
//   node --env-file=.env scripts/normalizePhoneNumbers20260818.js
//   node --env-file=.env scripts/normalizePhoneNumbers20260818.js --apply
//
// SCOPE — deliberately limited to unambiguous format rewrites where the
// canonical value does not collide with an existing row. It does NOT delete or
// merge accounts. Rows needing a human decision are reported and skipped:
//
//   * Duplicate pairs (two rows normalizing to the same number). Rewriting one
//     onto the other would either collide or silently mask an account. Note
//     that the code fix already makes the non-canonical twin unreachable at
//     login, so these are cleanup, not an outage.
//   * Numbers that cannot be normalized at all (not [6-9] + 9 digits). There is
//     no correct value to write — only a human knows the real number.
//
// Idempotent: re-running after a successful apply reports nothing to do.

const { createClient } = require('@supabase/supabase-js');

// supabase-js constructs a RealtimeClient eagerly, and on Node < 22 there is no
// global WebSocket for it to use — it throws at createClient even though this
// script only ever makes REST calls. Hand it `ws` when the global is missing.
const realtimeOpts = typeof WebSocket === 'undefined'
  ? { realtime: { transport: require('ws') } }
  : undefined;

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, realtimeOpts);
const APPLY = process.argv.includes('--apply');

// Must stay identical to normalizePhone() in index.js.
function normalizePhone(phoneNumber) {
  let digits = String(phoneNumber ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

const TABLES = [
  { table: 'customers', col: 'mobile', label: (r) => r.name || '(no name)' },
  { table: 'astrologers', col: 'phone_number', label: (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || '(no name)' },
];

async function main() {
  console.log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN (pass --apply to write) ===');
  let rewrites = 0; let skipped = 0; let failures = 0;

  for (const { table, col, label } of TABLES) {
    const { data: rows, error } = await db.from(table).select('*');
    if (error) { console.error(`FAILED reading ${table}: ${error.message}`); process.exit(1); }

    // Group by canonical value so collisions are detectable before writing.
    const byCanonical = new Map();
    for (const r of rows) {
      const canonical = normalizePhone(r[col]);
      if (!canonical) continue;
      if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
      byCanonical.get(canonical).push(r);
    }

    console.log(`\n### ${table}.${col} — ${rows.length} rows`);

    for (const r of rows) {
      const current = r[col];
      const canonical = normalizePhone(current);

      if (canonical === null) {
        console.log(`  SKIP  ${JSON.stringify(current)} — cannot be normalized; needs a human decision`);
        console.log(`        id=${r.id} name="${label(r)}"`);
        skipped++;
        continue;
      }
      if (canonical === current) continue; // already canonical

      if (byCanonical.get(canonical).length > 1) {
        console.log(`  SKIP  ${JSON.stringify(current)} -> ${canonical} — would collide with another row (duplicate account)`);
        console.log(`        id=${r.id} name="${label(r)}"`);
        skipped++;
        continue;
      }

      console.log(`  FIX   ${JSON.stringify(current)} -> ${canonical}   id=${r.id} name="${label(r)}"`);
      rewrites++;
      if (!APPLY) continue;

      const { error: updErr } = await db.from(table).update({ [col]: canonical }).eq('id', r.id);
      if (updErr) { console.error(`        FAILED: ${updErr.message}`); failures++; }
      else console.log('        written');
    }
  }

  // otp_codes is keyed by phone number too, but its rows are short-lived (5 min
  // TTL) and rebuilt on the next request, so there is nothing worth migrating —
  // just clear any non-canonical leftovers so a stale key can't shadow a real one.
  const { data: otpRows, error: otpErr } = await db.from('otp_codes').select('phone_number, expires_at');
  if (otpErr) {
    console.log(`\n### otp_codes — could not read: ${otpErr.message}`);
  } else {
    const stale = otpRows.filter((r) => normalizePhone(r.phone_number) !== r.phone_number);
    console.log(`\n### otp_codes — ${otpRows.length} rows, ${stale.length} non-canonical`);
    for (const r of stale) {
      console.log(`  DROP  ${JSON.stringify(r.phone_number)} (expires ${r.expires_at})`);
      rewrites++;
      if (!APPLY) continue;
      const { error: delErr } = await db.from('otp_codes').delete().eq('phone_number', r.phone_number);
      if (delErr) { console.error(`        FAILED: ${delErr.message}`); failures++; }
      else console.log('        deleted');
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${rewrites} change(s). Skipped for human decision: ${skipped}. Failures: ${failures}.`);
  if (!APPLY && rewrites) console.log('Re-run with --apply to write these changes.');
  if (failures) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
