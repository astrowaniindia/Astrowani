// astrowani-backend/src/recipients.js
//
// One place that answers "who should this broadcast actually reach".
//
// Extracted because the same list was being built four times, and three of those copies
// carried the SAME TWO DEFECTS:
//
//   1. A plain `.select()` with no paging. PostgREST caps a result at 1000 rows and does
//      NOT error — it just returns 1000. Measured 2026-09-24: 702 customers, 684 signups
//      in the preceding 30 days. This table crosses 1000 within weeks, at which point
//      every broadcast silently stops reaching the newest customers with no sign that
//      anything is wrong. That is the worst shape a bug can take on a notification path.
//
//   2. No soft-delete filter. A removed account keeps its row with its phone rewritten to
//      `deleted:<id>:<ts>`, and these broadcasts were pushing to them anyway. The
//      free-call invite path already excluded them; nothing else did.
//
// freeCallRoutes' inviteRecipients() was the one correct implementation and is the model
// here. It is deliberately left alone: it carries extra free-call-specific logic (its own
// "already booked" exclusion) and rewriting a working money-adjacent path for tidiness is
// not worth the risk.

const { pagedSelect, chunkIds } = require('./pagedSelect');
const audienceRules = require('./audience');

/** Columns every caller needs, plus whatever extra a caller asks for. */
const BASE_COLS = 'id, fcm_token';

/**
 * Build a recipient list.
 *
 * @param db            service-role supabase client
 * @param table         'customers' | 'astrologers'
 * @param opts.targetIds  explicit ids (personal send). When present, no filtering by
 *                        segment happens — an admin naming someone by hand means it.
 * @param opts.extraCols  e.g. 'name' or 'first_name, last_name' for the history label
 * @param opts.segments   segment ids to keep. Empty/absent = everyone. Customers only:
 *                        astrologers have no acquisition source.
 *
 * Returns { recipients, total, skippedDeleted, skippedSegment, truncated }.
 */
async function buildRecipients(db, table, opts = {}) {
  const { targetIds, extraCols, segments } = opts;
  const isCustomers = table === 'customers';

  // The soft-delete tag lives on `mobile` for customers and `phone_number` for
  // astrologers; both are needed to filter, so both are always selected.
  const phoneCol = isCustomers ? 'mobile' : 'phone_number';
  const segmentCols = isCustomers ? ', acquisition_source, acquisition_raw' : '';
  const cols = `${BASE_COLS}, ${phoneCol}${extraCols ? `, ${extraCols}` : ''}${segmentCols}`;

  let rows = [];
  let truncated = false;

  if (Array.isArray(targetIds) && targetIds.length) {
    // .in() with ~1000 uuids builds a ~37 KB query string and 414s, hence chunkIds.
    for (const ids of chunkIds([...new Set(targetIds.map(String))])) {
      const { data, error } = await db.from(table).select(cols).in('id', ids);
      if (error) throw error;
      rows.push(...(data || []));
    }
  } else {
    const out = await pagedSelect(() => db.from(table).select(cols).order('id'));
    rows = out.rows;
    truncated = out.truncated;
  }

  const total = rows.length;

  const live = rows.filter((r) => !String(r[phoneCol] || '').startsWith('deleted:'));
  const skippedDeleted = total - live.length;

  // Segment filtering applies only to an untargeted customer broadcast. An explicit
  // target list is an admin's deliberate choice and is never second-guessed.
  let kept = live;
  let skippedSegment = 0;
  const wantSegments = Array.isArray(segments) ? segments.filter(Boolean) : [];
  if (isCustomers && wantSegments.length && !(Array.isArray(targetIds) && targetIds.length)) {
    const rules = await audienceRules.loadRules();
    kept = live.filter((r) => {
      const { segment } = audienceRules.decideWith(rules, r.acquisition_source, r.acquisition_raw);
      return wantSegments.includes(segment);
    });
    skippedSegment = live.length - kept.length;
  }

  return { recipients: kept, total, skippedDeleted, skippedSegment, truncated };
}

module.exports = { buildRecipients };
