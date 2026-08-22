// astrowani-backend/src/pagedSelect.js
//
// WHY THIS EXISTS: PostgREST (and therefore every supabase-js `.select()`) caps a
// response at `max-rows` — 1000 by default on hosted Supabase. A query that returns
// more than that does NOT error. It silently returns the first 1000 rows, so any
// caller that sums them in JS reports a number that is quietly, plausibly wrong and
// then simply stops growing.
//
// The analytics revenue routes hit this directly. wallet_transactions gets roughly
// one row per billed MINUTE (measured 2026-08-21: 632 rows from 114 sessions, ~4.2
// rows per session), so a 30-day revenue-by-type window starts truncating at only
// ~240 sessions. The failure is invisible: no error, no warning, and the total looks
// like a real business number.
//
// The proper fix is to aggregate in Postgres. That needs DDL to create the function
// and the service-role key cannot run DDL from here (see the
// `local-backend-bills-production` memory), so this keeps the aggregation in JS but
// removes the cap by paging explicitly with .range().
//
// `hardLimit` is a deliberate backstop, not a cap on correctness: it exists so a
// query against an unexpectedly huge table can't pull the whole thing into memory
// and take the process down. When it trips, the caller is told via `truncated` so it
// can say so instead of silently under-reporting — which is the exact failure this
// module exists to eliminate.

const PAGE_SIZE = 1000;
const DEFAULT_HARD_LIMIT = 200_000;

/**
 * Run a Supabase select in .range() pages until it is exhausted.
 *
 * @param {() => object} buildQuery  Returns a FRESH PostgrestFilterBuilder each call.
 *   Must be a factory, not a single builder — a supabase-js builder is a one-shot
 *   thenable and cannot be re-ranged after it has been awaited.
 * @param {{pageSize?: number, hardLimit?: number}} [opts]
 * @returns {Promise<{rows: object[], truncated: boolean}>}
 */
async function pagedSelect(buildQuery, { pageSize = PAGE_SIZE, hardLimit = DEFAULT_HARD_LIMIT } = {}) {
  const rows = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    // A short page means we reached the end. (An exactly-full final page costs one
    // extra empty request, which is correct and cheap.)
    if (batch.length < pageSize) return { rows, truncated: false };

    offset += pageSize;
    if (rows.length >= hardLimit) {
      console.warn(`[pagedSelect] hard limit ${hardLimit} reached — result is TRUNCATED and totals will under-report`);
      return { rows, truncated: true };
    }
  }
}

/**
 * Split an id list into chunks small enough for a PostgREST `in.(...)` filter.
 *
 * A single `.in('id', ids)` builds the list into the URL. 1000 UUIDs is roughly a
 * 37 KB query string, which hits a 414 (or nginx's default 8 KB header buffer) long
 * before it hits any row cap — so the list has to be chunked, not just paged.
 * 150 UUIDs ≈ 5.6 KB, comfortably inside every default limit.
 */
function chunkIds(ids, size = 150) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

module.exports = { pagedSelect, chunkIds, PAGE_SIZE };
