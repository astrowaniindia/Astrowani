// Customers the admin has chosen to leave out of every Analytics card — the team's own
// phones, testers, the store-reviewer login.
//
// Stored in app_settings.analytics_excluded_customers as a JSON array of customer ids.
// Like analyticsSince.js this is a FILTER, not a delete: nothing is removed from
// PostHog or the database, it applies to past data as well as new, and taking someone
// off the list brings their numbers straight back.
//
//   - PostHog queries (postHogRoutes.js) drop every event of the PostHog PERSON behind
//     each customer id, so events captured before they logged in on that phone (which
//     PostHog merged into the same person on identify) are excluded too.
//   - Supabase-backed cards (adminRoutes.js) drop rows whose customer column is listed.
//
// DELETED customers are left out too, automatically — they are not on the admin's list
// and never appear in its card:
//   - soft-removed accounts (still in `customers`, phone replaced with 'deleted:…'),
//     found by a query on every refresh;
//   - hard-deleted accounts (row gone), whose ids are kept in
//     app_settings.analytics_deleted_customers. recordDeletedCustomer() adds to it at
//     delete time (src/accountRoutes.js, admin DELETE /api/admin/customers/:id); the
//     14 older ones were recovered from PostHog on 2026-09-18 and seeded there.
// Revenue and sessions of deleted customers therefore drop out of the Analytics cards
// too. The ledgers themselves are untouched.
//
// Read synchronously from memory, refreshed every minute and immediately on save.
const { createClient } = require('@supabase/supabase-js');

const KEY = 'analytics_excluded_customers';
const DELETED_KEY = 'analytics_deleted_customers';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let excluded = new Set(); // admin's list ∪ deleted customers — what every filter uses

// Only well-formed UUIDs survive — these ids are interpolated into HogQL, so this is
// also the injection guard.
function parseIds(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch (_) { return []; }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim().toLowerCase()).filter((v) => UUID.test(v)))];
}

async function refreshAnalyticsExclusions() {
  try {
    const [adminRes, deletedRes, softRes] = await Promise.all([
      db.from('app_settings').select('value').eq('key', KEY).maybeSingle(),
      db.from('app_settings').select('value').eq('key', DELETED_KEY).maybeSingle(),
      db.from('customers').select('id').like('mobile', 'deleted:%').limit(10000),
    ]);
    // Any failed read keeps the last known list rather than briefly counting everyone.
    if (adminRes.error || deletedRes.error || softRes.error) return;
    const adminIds = parseIds(adminRes.data?.value);
    excluded = new Set([
      ...adminIds,
      ...parseIds(deletedRes.data?.value),
      ...parseIds((softRes.data || []).map((r) => r.id)),
    ]);
  } catch (_) {
    // keep the last known list
  }
}

// Remember a deleted customer's id so their past analytics stay hidden after the row
// is gone. Call BEFORE deleting. Never throws: a failure here must not block a deletion
// (worst case, that one customer's old events stay visible).
async function recordDeletedCustomer(id) {
  const [clean] = parseIds([id]);
  if (!clean) return;
  excluded.add(clean);
  try {
    const { data, error } = await db.from('app_settings').select('value').eq('key', DELETED_KEY).maybeSingle();
    if (error) return;
    const ids = parseIds(data?.value);
    if (ids.includes(clean)) return;
    ids.push(clean);
    await db.from('app_settings').upsert({ key: DELETED_KEY, value: JSON.stringify(ids), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch (_) {
    // best-effort, see above
  }
}

const isExcludedCustomer = (id) => !!id && excluded.has(String(id).toLowerCase());

// Keep only rows whose `field` is not an excluded customer. Cheap no-op when the list is empty.
function withoutExcluded(rows, field) {
  if (!excluded.size || !Array.isArray(rows)) return rows || [];
  return rows.filter((r) => !isExcludedCustomer(r?.[field]));
}

// HogQL condition ('' when nobody is excluded).
function hogqlExclusionClause() {
  if (!excluded.size) return '';
  const ids = [...excluded].sort().map((id) => `'${id}'`).join(', ');
  return `person_id NOT IN (SELECT person_id FROM person_distinct_ids WHERE distinct_id IN (${ids}))`;
}

refreshAnalyticsExclusions();
setInterval(refreshAnalyticsExclusions, 60 * 1000).unref();

module.exports = {
  ANALYTICS_EXCLUDED_KEY: KEY,
  ANALYTICS_DELETED_KEY: DELETED_KEY,
  recordDeletedCustomer,
  parseIds,
  refreshAnalyticsExclusions,
  isExcludedCustomer,
  withoutExcluded,
  hogqlExclusionClause,
};
