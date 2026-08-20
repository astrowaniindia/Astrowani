// One-off Hindi backfill for the remedies shop.
//
// WHY (2026-08-20): remedy_items.title_hi / description_hi and the same pair on
// remedy_categories were empty for every existing row, so the Remedies screens
// showed English product names and descriptions with the app in Hindi. Unlike
// the four category NAMES (which have bundled translations in the app's
// LanguageContext), these are admin-authored strings — there is no fallback to
// reach, so they have to actually be translated once and stored.
//
// Going forward this is automatic: adminRoutes' remedy-items / remedy-categories
// crud calls queueRemedyItemTranslation / queueRemedyCategoryTranslation on
// every save. This script exists only to catch the rows that were created before
// that hook existed. It is safe to re-run — backfillRowHindi only ever writes a
// column that is currently empty, so already-translated rows are skipped and
// hand-written Hindi is never overwritten.
//
// Run:  node --env-file=.env scripts/backfillRemedyHindi.js
//
// Cost: free (MyMemory). The whole catalog was ~5.8k characters at the time of
// writing, which is around the anonymous daily allowance — set MYMEMORY_EMAIL in
// .env to raise it roughly 10x if the run trips the limit partway. The circuit
// breaker in autoTranslate.js stops after 3 consecutive failures rather than
// hammering a provider that is already refusing, so a partial run just stops;
// re-run it the next day and it picks up exactly the rows still missing.

const { createClient } = require('@supabase/supabase-js');
const { backfillRowHindi, REMEDY_FIELDS, CATEGORY_FIELDS } = require('../src/autoTranslate');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env).');
  process.exit(1);
}

// supabase-js constructs a RealtimeClient eagerly, and on Node < 22 there is no
// global WebSocket for it to use — it throws at createClient even though this
// script only ever makes REST calls. Hand it `ws` when the global is missing.
// (Same shim as scripts/normalizePhoneNumbers20260818.js.)
const realtimeOpts = typeof WebSocket === 'undefined'
  ? { realtime: { transport: require('ws') } }
  : undefined;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, realtimeOpts);

async function backfillTable(table, fields) {
  const { data, error } = await db.from(table).select('*');
  if (error) {
    console.error(`[${table}] read failed: ${error.message}`);
    return { filled: 0, skipped: 0, total: 0 };
  }
  const rows = data || [];
  let filled = 0;
  let skipped = 0;
  let failed = 0;

  // Sequential on purpose. autoTranslate already serialises its own queue for the
  // same reason, and this script bypasses that queue by calling backfillRowHindi
  // directly — running the rows concurrently here would recreate exactly the
  // burst the queue exists to prevent.
  for (const row of rows) {
    const label = (row.title || row.name || row.id || '').toString().slice(0, 48);
    try {
      const wrote = await backfillRowHindi(db, table, row, fields);
      if (wrote) {
        filled += 1;
        continue;
      }
      // backfillRowHindi returns false for BOTH "nothing to do" and "the
      // translation call came back empty", which is not good enough for a
      // migration report — the first run of this script logged a genuinely
      // failed row ("Career") as merely skipped, and it took querying the API to
      // notice. Decide which it was by looking at whether the row still has an
      // untranslated target column.
      const outstanding = fields.filter((f) => row[f.source] && !row[f.target]);
      if (outstanding.length) {
        failed += 1;
        console.log(`[${table}] FAILED (still untranslated: ${outstanding.map((f) => f.target).join(', ')}): ${label}`);
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.log(`[${table}] FAILED: ${label} — ${err.message}`);
    }
  }
  return { filled, skipped, failed, total: rows.length };
}

(async () => {
  let anyFailed = false;
  // `categories` is the astrologer-category row (Tarot Reading, Marriage, …)
  // shown on Home; it keys off `name`, not `title`, hence the separate mapping.
  const TABLES = [
    ['remedy_categories', REMEDY_FIELDS],
    ['remedy_items', REMEDY_FIELDS],
    ['categories', CATEGORY_FIELDS],
  ];
  for (const [table, fields] of TABLES) {
    const { filled, skipped, failed, total } = await backfillTable(table, fields);
    console.log(`[${table}] done — ${filled} translated, ${skipped} already done, ${failed} FAILED, ${total} total`);
    if (failed) anyFailed = true;
  }
  // The API caches these lists (contentCache), so a freshly-translated catalog
  // will not appear to the apps until that TTL lapses. Nothing to do here; just
  // don't conclude the script failed if the app still shows English for a minute.
  console.log('Backfill complete. Allow the content cache TTL to lapse before checking the app.');
  if (anyFailed) {
    console.log('Some rows FAILED — re-run to retry just those (this script never redoes finished rows).');
    process.exitCode = 1;
  }
})();
