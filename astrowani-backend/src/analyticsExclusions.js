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
// Read synchronously from memory, refreshed every minute and immediately on save.
const { createClient } = require('@supabase/supabase-js');

const KEY = 'analytics_excluded_customers';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let excluded = new Set();

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
    const { data, error } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle();
    if (error) return; // keep the last known list
    excluded = new Set(parseIds(data?.value));
  } catch (_) {
    // keep the last known list
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
  parseIds,
  refreshAnalyticsExclusions,
  isExcludedCustomer,
  withoutExcluded,
  hogqlExclusionClause,
};
