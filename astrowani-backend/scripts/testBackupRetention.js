// astrowani-backend/scripts/testBackupRetention.js
//
//   node scripts/testBackupRetention.js
//
// Offline. No database, no network, no env, no keys. Covers src/backupRetention.js, which is
// the one module in this project whose job is to DELETE backups — so the suite is weighted
// towards "this run must survive" rather than "this run must go". A retention test that only
// asserts deletions passes happily on a policy that deletes everything.
//
// Every window rule is paired with a positive control (something that IS pruned), or a policy
// that never prunes at all would look identical to a correct one.

const { classify, DEFAULTS, weekKey, dayKey, monthKey } = require('../src/backupRetention');

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass += 1; return; }
  failures.push(detail ? `${name} — ${detail}` : name);
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const NOW = new Date('2026-10-20T12:00:00Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** A synthetic timeline: `runsPerDay` runs/day going back `days` days from NOW. */
function timeline(days, runsPerDay = 4) {
  const out = [];
  const step = DAY / runsPerDay;
  for (let i = 0; i < days * runsPerDay; i += 1) {
    const at = new Date(NOW.getTime() - i * step);
    out.push({ prefix: `db/${at.toISOString()}`, at });
  }
  return out;
}
const run = (iso) => {
  const at = new Date(iso);
  return { prefix: `db/${at.toISOString()}`, at };
};
const prefixes = (list) => list.map((r) => r.prefix);

/**
 * The real guarantee of a tier is COVERAGE, not a label: for each of the `limit` most recent
 * distinct buckets present in the input, at least one run survived. Asserting on the reason
 * strings instead counts wrongly — a run that is the newest of its day AND inside the 48h
 * window is attributed to whichever rule marked it first, so a correct policy shows fewer
 * than 14 runs labelled 'daily'. That cost 4 false failures on the first run of this suite.
 */
function coversRecentBuckets(all, keep, keyFn, limit) {
  const keptKeys = new Set(keep.map((r) => keyFn(r.at)));
  const ordered = [...all].sort((a, b) => b.at - a.at);
  const wanted = [];
  for (const r of ordered) {
    const k = keyFn(r.at);
    if (!wanted.includes(k)) wanted.push(k);
    if (wanted.length >= limit) break;
  }
  return { missing: wanted.filter((k) => !keptKeys.has(k)), wanted: wanted.length };
}

// ── Bucket keys ─────────────────────────────────────────────────────────────────────────
eq('dayKey is UTC calendar day', dayKey(new Date('2026-10-20T23:59:59Z')), '2026-10-20');
eq('monthKey is UTC month', monthKey(new Date('2026-10-01T00:00:00Z')), '2026-10');
// The ISO week-year trap: 1 Jan 2027 is a Friday and belongs to week 53 of 2026. Keyed on
// the calendar year it would collide with week 53 of a different year's December.
eq('ISO week-year, not calendar year', weekKey(new Date('2027-01-01T00:00:00Z')), '2026-W53');
eq('ISO week mid-year', weekKey(new Date('2026-10-20T00:00:00Z')), '2026-W43');
check('two days in the same ISO week share a key',
  weekKey(new Date('2026-10-19T00:00:00Z')) === weekKey(new Date('2026-10-25T00:00:00Z')));
check('Monday and the Sunday before it differ',
  weekKey(new Date('2026-10-18T00:00:00Z')) !== weekKey(new Date('2026-10-19T00:00:00Z')));

// ── The floor: the protection that matters most ─────────────────────────────────────────
for (const n of [0, 1, 2, 7]) {
  const r = classify(timeline(400).slice(0, n), { now: NOW });
  check(`floor: ${n} run(s) prunes nothing`, r.remove.length === 0 && (n === 0 || r.skipped),
    `removed ${r.remove.length}, skipped=${r.skipped}`);
  eq(`floor: ${n} run(s) keeps all`, r.keep.length, n);
}
// POSITIVE CONTROL for the floor — above the floor, pruning genuinely happens.
// Without this, a policy hard-wired to never prune would pass every case above.
//
// It has to be TEN runs on ONE old day, not three runs on three old days: three old days are
// three distinct daily buckets, all within the 14-bucket limit, so a correct policy keeps all
// three and the control fails while the module is behaving perfectly. (It did, first run.)
{
  const old = [];
  for (let i = 0; i < 10; i += 1) old.push(run(`2020-03-01T0${i}:00:00Z`));
  const r = classify([...timeline(2), ...old], { now: NOW, floor: 8 });
  check('control: above the floor, redundant same-day runs ARE pruned', r.remove.length === 9,
    `removed ${r.remove.length}`);
  check('control: pruning is not skipped', r.skipped === false);
  check('control: the newest of that old day survives',
    prefixes(r.keep).includes('db/2020-03-01T09:00:00.000Z'));
}

// ── The newest run is sacred ────────────────────────────────────────────────────────────
{
  // Newest is ancient and in no window at all; every bucket rule would drop it.
  const runs = [run('2019-05-05T05:00:00Z')];
  for (let i = 1; i <= 20; i += 1) runs.push(run(new Date(Date.UTC(2019, 4, 5 - i, 5)).toISOString()));
  const r = classify(runs, { now: NOW, keepAllHours: 0, dailyDays: 0, weeklyWeeks: 0, monthlyMonths: 0 });
  check('newest run kept with every window set to zero', prefixes(r.keep).includes('db/2019-05-05T05:00:00.000Z'));
  eq('newest run kept for the right reason', r.reasons['db/2019-05-05T05:00:00.000Z'], 'newest run');
  check('and with all windows zero the rest ARE removed', r.remove.length === 20, `removed ${r.remove.length}`);
}

// ── The fine-grained window ─────────────────────────────────────────────────────────────
{
  const r = classify(timeline(400), { now: NOW });
  const within = timeline(400).filter((x) => NOW - x.at <= 48 * HOUR);
  eq('all runs inside 48h are kept', within.filter((x) => prefixes(r.keep).includes(x.prefix)).length, within.length);
  // 9, not 8: the boundary is inclusive, so 0h through 48h at a 6-hourly cadence is nine runs.
  check('48h window gives 6-hourly granularity (9 runs)', within.length === 9, `${within.length} runs`);
  const edge = run(new Date(NOW.getTime() - 48 * HOUR - 1).toISOString());
  const r2 = classify([...timeline(400), edge], { now: NOW });
  check('a run one millisecond past the window is not kept BY the window',
    r2.reasons[edge.prefix] !== 'within last 48h');
}

// ── Tier counts ─────────────────────────────────────────────────────────────────────────
{
  const all = timeline(400);
  const r = classify(all, { now: NOW });
  const daily = coversRecentBuckets(all, r.keep, dayKey, DEFAULTS.dailyDays);
  const weekly = coversRecentBuckets(all, r.keep, weekKey, DEFAULTS.weeklyWeeks);
  const monthly = coversRecentBuckets(all, r.keep, monthKey, DEFAULTS.monthlyMonths);
  eq('the last 14 days each keep a backup', daily.missing.length, 0);
  eq('the last 8 ISO weeks each keep a backup', weekly.missing.length, 0);
  eq('the last 12 months each keep a backup', monthly.missing.length, 0);
  check('kept set stays small over 400 days', r.keep.length <= 40, `kept ${r.keep.length}`);
  check('and most of 1600 runs are pruned', r.remove.length > 1500, `removed ${r.remove.length}`);
  check('nothing is both kept and removed',
    prefixes(r.keep).every((p) => !prefixes(r.remove).includes(p)));
  eq('keep + remove accounts for every run', r.keep.length + r.remove.length, 1600);
}

// ── Idempotence: the property that stops slow erosion ───────────────────────────────────
{
  let kept = timeline(400);
  const first = classify(kept, { now: NOW });
  kept = first.keep;
  const second = classify(kept, { now: NOW, floor: 0 });
  eq('re-classifying the kept set removes nothing', second.remove.length, 0);
  const third = classify(second.keep, { now: NOW, floor: 0 });
  eq('and again', third.remove.length, 0);
}

// ── Gaps: a fortnight when the job was broken ───────────────────────────────────────────
{
  // Nothing for 20 days, then healthy runs before that. A time-window policy would keep
  // nothing at all from the daily tier; a bucket-count policy keeps the last 14 days that
  // actually produced backups — which is the whole point.
  const olderRuns = timeline(60).filter((x) => NOW - x.at > 20 * DAY);
  const r = classify(olderRuns, { now: NOW });
  const daily = coversRecentBuckets(olderRuns, r.keep, dayKey, DEFAULTS.dailyDays);
  eq('a 20-day outage still leaves 14 days of backups to restore from', daily.missing.length, 0);
  eq('and it really did consider 14 buckets', daily.wanted, DEFAULTS.dailyDays);
  check('the newest surviving run is kept', prefixes(r.keep).includes(olderRuns[0].prefix));
  check('redundant runs within the gap period are still pruned', r.remove.length > 0,
    `removed ${r.remove.length}`);
}

// ── Unparseable prefixes are kept, not deleted ──────────────────────────────────────────
{
  const junk = { prefix: 'db/not-a-timestamp', at: 'wat' };
  const r = classify([...timeline(400), junk], { now: NOW });
  check('unknown timestamp is kept', prefixes(r.keep).includes(junk.prefix));
  check('unknown timestamp is never removed', !prefixes(r.remove).includes(junk.prefix));
  check('and it is labelled as such', /unparseable/.test(r.reasons[junk.prefix] || ''));
  // It must not satisfy the floor either: 7 real runs plus junk is still below the floor.
  const r2 = classify([...timeline(400).slice(0, 7), junk], { now: NOW });
  check('junk does not count towards the floor', r2.skipped === true && r2.remove.length === 0);
}

// ── Property: random timelines never produce a total wipe ───────────────────────────────
{
  let worstKept = Infinity;
  let bad = 0;
  for (let i = 0; i < 2000; i += 1) {
    const n = 1 + Math.floor(Math.random() * 300);
    const runs = [];
    for (let j = 0; j < n; j += 1) {
      const at = new Date(NOW.getTime() - Math.floor(Math.random() * 900 * DAY));
      runs.push({ prefix: `db/r${i}-${j}-${at.getTime()}`, at });
    }
    const r = classify(runs, { now: NOW });
    const newest = runs.slice().sort((a, b) => b.at - a.at)[0];
    if (!prefixes(r.keep).includes(newest.prefix)) bad += 1;
    if (r.keep.length < 1) bad += 1;
    if (r.keep.length + r.remove.length !== runs.length) bad += 1;
    worstKept = Math.min(worstKept, r.keep.length);
  }
  eq('2000 random timelines: newest always kept, nothing lost, never empty', bad, 0);
  check('at least one run always survives', worstKept >= 1, `worst kept ${worstKept}`);
}

// ── Degenerate inputs ───────────────────────────────────────────────────────────────────
{
  const r = classify([], { now: NOW });
  check('empty input is safe', r.remove.length === 0 && r.keep.length === 0);
  const r2 = classify(undefined, { now: NOW });
  check('undefined input is safe', r2.remove.length === 0);
  const dup = [run('2026-10-20T00:00:00Z'), run('2026-10-20T00:00:00Z')];
  const r3 = classify([...dup, ...timeline(400)], { now: NOW, floor: 0 });
  check('identical timestamps do not crash or double-delete',
    r3.keep.length + r3.remove.length === 1602);
}

// ── Run naming: the key format and the parser must agree ────────────────────────────────
// If they disagree, nothing is ever pruned (harmless, invisible) or non-backup objects are
// treated as prunable runs (not harmless at all). So the round trip is asserted directly.
{
  const { runKeyFor, runsFromKeys } = require('../src/backupRetention');

  eq('runKeyFor shape', runKeyFor(new Date('2026-10-20T04:30:00.123Z')), 'db/2026-10-20T043000Z');
  eq('runKeyFor pads single digits', runKeyFor(new Date('2026-01-02T03:04:05Z')), 'db/2026-01-02T030405Z');
  check('runKeyFor sorts chronologically as a string',
    runKeyFor(new Date('2026-01-02T03:00:00Z')) < runKeyFor(new Date('2026-01-02T04:00:00Z')));
  check('and across a month boundary',
    runKeyFor(new Date('2026-01-31T23:00:00Z')) < runKeyFor(new Date('2026-02-01T00:00:00Z')));

  // Round trip: a key built from a date must parse back to that same instant.
  for (const iso of ['2026-10-20T04:30:00Z', '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z']) {
    const d = new Date(iso);
    const parsed = runsFromKeys([`${runKeyFor(d)}/data.dump.age`]);
    eq(`round trip ${iso}: one run`, parsed.length, 1);
    // getTime(), never string equality — '+00:00' and 'Z' are the same instant and different
    // strings, a trap this project has already hit.
    eq(`round trip ${iso}: same instant`, parsed[0] && parsed[0].at.getTime(), d.getTime());
  }

  // Several objects in one run collapse to one run.
  const oneRun = runsFromKeys([
    'db/2026-10-20T043000Z/data.dump.age',
    'db/2026-10-20T043000Z/schema.sql.age',
    'db/2026-10-20T043000Z/globals.sql.age',
    'db/2026-10-20T043000Z/manifest.json',
  ]);
  eq('four objects collapse to one run', oneRun.length, 1);

  // THE ONE THAT MATTERS: the heartbeat lives at a fixed top-level key and must never be
  // seen as a prunable run, or the first prune deletes the thing that reports backup health.
  for (const notARun of [
    'db/LATEST.json', 'db/', 'db/readme.txt', 'other/2026-10-20T043000Z/data.dump',
    'db/2026-10-20T0430Z/data.dump', 'db/2026-10-20/data.dump', 'db/2026-10-20T043000Z',
  ]) {
    eq(`not a run: ${notARun}`, runsFromKeys([notARun]).length, 0);
  }
  // Positive control, so the list above is not passing because the parser matches nothing.
  eq('control: a real run key IS recognised', runsFromKeys(['db/2026-10-20T043000Z/x']).length, 1);

  eq('empty/garbage input is safe', runsFromKeys([null, undefined, 42, {}]).length, 0);

  // And the two halves compose: keys built by runKeyFor, classified, never lose the newest.
  const built = [];
  for (let i = 0; i < 200; i += 1) {
    const at = new Date(NOW.getTime() - i * 6 * HOUR);
    built.push({ key: `${runKeyFor(at)}/data.dump.age` });
  }
  const parsedRuns = runsFromKeys(built);
  eq('200 six-hourly keys parse to 200 runs', parsedRuns.length, 200);
  const r = classify(parsedRuns, { now: NOW });
  check('newest built key survives classification',
    prefixes(r.keep).includes(runKeyFor(NOW)), `keep=${r.keep.length}`);
  check('and the heartbeat key mixed in is never removed',
    !prefixes(classify(runsFromKeys([...built, { key: 'db/LATEST.json' }]), { now: NOW }).remove)
      .includes('db/LATEST.json'));
}

console.log(`\n${failures.length ? '✗' : '✓'} backup retention: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
