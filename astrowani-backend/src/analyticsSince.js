// "Count analytics from" — the moment the admin Analytics page starts counting.
//
// Stored in app_settings.analytics_since as an ISO timestamp. Everything before it
// (pre-launch test chats, test recharges, test signups) is left in the database
// untouched but is ignored by every Analytics card: the Supabase-backed routes in
// adminRoutes.js clamp their range start to it, and every PostHog query in
// postHogRoutes.js adds it next to the production-environment filter.
//
// Deliberately a filter, not a delete: money and session records must survive for
// accounting, and a start date can be moved back if it was set wrong.
//
// Read synchronously from memory (both route files build their queries with sync
// helpers), refreshed every minute and immediately when an admin saves the setting.
const { createClient } = require('@supabase/supabase-js');

const KEY = 'analytics_since';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let sinceIso = null;

async function refreshAnalyticsSince() {
  try {
    const { data, error } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle();
    if (error) return; // keep the last known value
    const d = data?.value ? new Date(data.value) : null;
    sinceIso = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  } catch (_) {
    // keep the last known value
  }
}

// ISO string, or null when no start date is set (count everything).
const getAnalyticsSince = () => sinceIso;

// The later of an ISO range start and the analytics start date.
function clampSince(since) {
  if (!sinceIso) return since;
  if (!since) return sinceIso;
  return new Date(since) > new Date(sinceIso) ? since : sinceIso;
}

// HogQL condition for the start date ('' when none is set), e.g.
// "timestamp >= toDateTime('2026-09-14 05:10:00', 'UTC')".
function hogqlSinceClause() {
  if (!sinceIso) return '';
  const utc = sinceIso.replace('T', ' ').slice(0, 19);
  return `timestamp >= toDateTime('${utc}', 'UTC')`;
}

refreshAnalyticsSince();
setInterval(refreshAnalyticsSince, 60 * 1000).unref();

module.exports = {
  ANALYTICS_SINCE_KEY: KEY,
  refreshAnalyticsSince,
  getAnalyticsSince,
  clampSince,
  hogqlSinceClause,
};
