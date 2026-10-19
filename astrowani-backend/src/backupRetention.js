// astrowani-backend/src/backupRetention.js
//
// Which database backups to keep, and which to delete. PURE — no I/O, no network, no clock
// of its own (`now` is always passed in), so it is unit-testable offline. That matters more
// here than anywhere else in this codebase: this is the only module we run whose JOB is to
// delete the thing that exists so we can recover from losing everything else.
//
// THE RULE THE WHOLE FILE EXISTS TO ENFORCE: a retention policy with a broken producer is a
// deletion policy. If the uploader has been failing for a fortnight, an age-based rule
// cheerfully expires the last good copy on schedule. So:
//
//   1. Below `floor` runs, NOTHING is pruned, whatever the ages say.
//   2. The newest run is kept unconditionally, outside every other rule.
//   3. `classify()` is idempotent — feeding it its own kept set deletes nothing further.
//      A non-idempotent policy erodes the archive a little on every run, which looks like
//      working correctly right up until the point there is one copy left.
//
// Buckets are computed in UTC on purpose. The timer fires on IST (so the schedule reads
// correctly to a human), but a policy that buckets in local time changes its mind twice a
// year in countries with DST and is a nuisance to reason about in a crisis. The bucket
// boundary does not need to mean anything to a person; it only needs to be stable.

const HOUR_MS = 3600 * 1000;

const DEFAULTS = {
  // Keep EVERY run inside this window, so recent recovery has the full 6-hourly granularity.
  // A bad migration is usually noticed within a day, and "restore to 6 hours ago" is a much
  // better answer than "restore to the start of yesterday".
  keepAllHours: 48,
  dailyDays: 14,
  weeklyWeeks: 8,
  monthlyMonths: 12,
  // Prune nothing until at least this many runs exist. Two days of healthy 6-hourly runs is
  // 8, so this clears on its own within 48h of a working installation and protects the
  // dangerous window: the first days, and any period when the job has been failing.
  floor: 8,
};

const pad = (n) => String(n).padStart(2, '0');

/** UTC calendar day, e.g. '2026-10-20'. */
function dayKey(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC month, e.g. '2026-10'. */
function monthKey(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * ISO-8601 week key, e.g. '2026-W43'. The year here is the ISO WEEK-year, which is not always
 * the calendar year: 2027-01-01 can belong to week 53 of 2026. Using the calendar year would
 * collide two different weeks onto one key once a year and silently drop a weekly backup.
 */
function weekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current ISO week determines the week-year.
  const dayNum = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const weekYear = t.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((t - firstThursday) / (7 * 24 * HOUR_MS));
  return `${weekYear}-W${pad(week)}`;
}

/**
 * Decide what to keep.
 *
 * @param {Array<{prefix: string, at: Date|string|number}>} runs  every run found in storage
 * @param {object} [opts]  overrides for DEFAULTS, plus `now` (defaults to Date.now())
 * @returns {{
 *   keep: Array<object>, remove: Array<object>, skipped: boolean,
 *   reason: string, reasons: Object<string,string>
 * }}
 *   `reasons` maps a kept run's prefix to WHY it was kept, so the log says
 *   "kept: weekly 2026-W41" rather than leaving a human to re-derive the policy.
 */
function classify(runs, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now ?? Date.now());

  // Anything without a usable timestamp is KEPT and never counted towards the floor. An
  // unparseable prefix means we do not know what we are looking at, and "delete the thing
  // you do not understand" is the wrong default for a backup.
  const parsed = [];
  const unknown = [];
  for (const r of runs || []) {
    const at = r.at instanceof Date ? r.at : new Date(r.at);
    if (!at || Number.isNaN(at.getTime())) unknown.push(r);
    else parsed.push({ ...r, at });
  }

  const reasons = {};
  for (const r of unknown) reasons[r.prefix] = 'unparseable timestamp — kept, never pruned';

  // Newest first. Every bucket rule below then means "the first one I see in this bucket",
  // which is the newest in it.
  parsed.sort((a, b) => b.at - a.at);

  if (parsed.length < cfg.floor) {
    return {
      keep: [...parsed, ...unknown],
      remove: [],
      skipped: true,
      reason: `only ${parsed.length} run(s) present, floor is ${cfg.floor} — pruning nothing`,
      reasons,
    };
  }

  const keepSet = new Set();
  const mark = (run, why) => {
    if (!keepSet.has(run.prefix)) {
      keepSet.add(run.prefix);
      reasons[run.prefix] = why;
    }
  };

  // 1. The newest run, unconditionally and before any other rule is consulted.
  //    Guarded because the floor is overridable: with `floor: 0` an empty list reaches here,
  //    and `parsed[0]` is then undefined. The default floor of 8 hides this behind the early
  //    return, so it only appears for a caller that lowers the floor — found by deliberately
  //    defeating the floor to check this suite catches it, which is exactly why that drill is
  //    worth running.
  if (parsed.length) mark(parsed[0], 'newest run');

  // 2. Everything inside the fine-grained window.
  const cutoff = now.getTime() - cfg.keepAllHours * HOUR_MS;
  for (const run of parsed) {
    if (run.at.getTime() >= cutoff) mark(run, `within last ${cfg.keepAllHours}h`);
  }

  // 3/4/5. Newest run per day, then per ISO week, then per month — each capped at a number
  // of DISTINCT BUCKETS, not a number of days of wall-clock. Capping by elapsed time would
  // keep nothing from a fortnight the job spent broken; capping by bucket keeps the last 14
  // days that actually produced a backup, which is what someone restoring wants.
  const tiers = [
    { key: dayKey, limit: cfg.dailyDays, label: 'daily' },
    { key: weekKey, limit: cfg.weeklyWeeks, label: 'weekly' },
    { key: monthKey, limit: cfg.monthlyMonths, label: 'monthly' },
  ];
  for (const tier of tiers) {
    const seen = new Map();
    for (const run of parsed) {
      const k = tier.key(run.at);
      if (!seen.has(k)) seen.set(k, run);
    }
    let n = 0;
    for (const [k, run] of seen) {
      if (n++ >= tier.limit) break;
      mark(run, `${tier.label} ${k}`);
    }
  }

  const keep = parsed.filter((r) => keepSet.has(r.prefix));
  const remove = parsed.filter((r) => !keepSet.has(r.prefix));

  return {
    keep: [...keep, ...unknown],
    remove,
    skipped: false,
    reason: `keeping ${keep.length + unknown.length}, removing ${remove.length}`,
    reasons,
  };
}

// ── Run naming ──────────────────────────────────────────────────────────────────────────
// The storage key and the retention policy have to agree on what a "run" is, and they agree
// through this pair of functions. They live here, next to the classifier that consumes them,
// because a prefix the parser cannot read is silently never pruned — and a parser that reads
// a NON-run key as a run would prune objects that are not backups at all. Both halves are
// covered by scripts/testBackupRetention.js for that reason.

const RUN_PREFIX = 'db';
/** `db/2026-10-20T043000Z` — sorts chronologically as a plain string. */
function runKeyFor(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${RUN_PREFIX}/${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const RUN_KEY_RE = /^db\/(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\//;

/**
 * Collapse a flat list of object keys into the distinct runs they belong to.
 * Anything that is not `db/<timestamp>/...` is ignored — notably the fixed-key heartbeat
 * `db/LATEST.json`, which must never be treated as a prunable run.
 */
function runsFromKeys(keys) {
  const seen = new Map();
  for (const entry of keys || []) {
    const key = typeof entry === 'string' ? entry : entry && entry.key;
    const m = typeof key === 'string' ? key.match(RUN_KEY_RE) : null;
    if (!m) continue;
    const [, y, mo, d, h, mi, s] = m;
    const prefix = key.slice(0, key.indexOf('/', RUN_PREFIX.length + 1));
    if (!seen.has(prefix)) {
      seen.set(prefix, { prefix, at: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) });
    }
  }
  return [...seen.values()];
}

module.exports = {
  classify, DEFAULTS, dayKey, weekKey, monthKey, runKeyFor, runsFromKeys, RUN_PREFIX,
};
