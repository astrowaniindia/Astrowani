// astrowani-backend/src/notifications/db.js
//
// The one service-role client this module uses, built LAZILY.
//
// Lazily for the same reason src/push.js is: `createClient` throws on a runtime
// without a native WebSocket (the VPS runs Node v20.20.1 — measured 2026-10-29),
// and index.js requires this module at startup. A throw at module scope would take
// the whole backend down at boot, which is a catastrophic trade for a feature whose
// worst failure is "a notification did not go out".
//
// Service role because every table here holds zero privileges for anon and
// authenticated, deliberately (sql/notification_platform.sql).

const { createClient } = require('@supabase/supabase-js');

let client;

function db() {
  if (client !== undefined) return client;
  try {
    client = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      : null;
    if (!client) console.warn('[notifications] no Supabase service-role credentials — the notification platform is inert.');
  } catch (err) {
    console.error('[notifications] could not create Supabase client:', err.message);
    client = null;
  }
  return client;
}

/** PostgREST caps a result at 1000 rows and does NOT error — it just returns 1000.
 *  Everything here reads tables that are already past that, or will be. Mirrors
 *  src/pagedSelect.js; kept local so this module has no reason to reach into the
 *  broadcast path's helpers. */
async function pageAll(build, { pageSize = 1000, max = 100000 } = {}) {
  const rows = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** `now()` as an ISO string, in one place so tests can see what was compared. */
const nowIso = () => new Date().toISOString();

module.exports = { db, pageAll, nowIso };
