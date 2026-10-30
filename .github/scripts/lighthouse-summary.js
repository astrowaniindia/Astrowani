#!/usr/bin/env node
/**
 * Turn Lighthouse JSON reports into one readable table.
 *
 *   node .github/scripts/lighthouse-summary.js report1.json report2.json ...
 *
 * WHY THIS IS NOT JUST `lighthouse --view`. The numbers are only useful next to
 * the thresholds, and next to each other: a service page and an article should
 * not differ much, and when they do that is the finding. So every row is printed
 * with a PASS/FAIL against the Core Web Vitals targets rather than left as a
 * number somebody has to remember the bar for.
 *
 * TBT IS A LAB STAND-IN FOR INP, NOT INP. INP needs real interactions from real
 * visitors, so it only ever comes from CrUX/Search Console. Lighthouse cannot
 * produce it and this script does not pretend otherwise.
 */

const fs = require('fs');

// web.dev/articles/vitals — the 75th-percentile targets for real visits. A lab
// run is not a pass against them, it is an indication; CrUX is the real answer.
const TARGETS = { lcp: 2500, tbt: 200, cls: 0.1 };

const ms = (v) => (v == null ? '—' : `${Math.round(v)}ms`);
const s2 = (v) => (v == null ? '—' : v.toFixed(3));
const kb = (v) => (v == null ? '—' : `${Math.round(v / 1024)}KB`);

const rows = [];
for (const file of process.argv.slice(2)) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.log(`  could not read ${file}: ${err.message}`);
    continue;
  }
  const a = report.audits || {};
  const num = (id) => (a[id] && typeof a[id].numericValue === 'number' ? a[id].numericValue : null);
  rows.push({
    url: (report.finalDisplayedUrl || report.requestedUrl || file).replace(/^https?:\/\/[^/]+/, ''),
    score: report.categories && report.categories.performance
      ? Math.round(report.categories.performance.score * 100)
      : null,
    fcp: num('first-contentful-paint'),
    lcp: num('largest-contentful-paint'),
    tbt: num('total-blocking-time'),
    cls: num('cumulative-layout-shift'),
    si: num('speed-index'),
    ttfb: num('server-response-time'),
    bytes: num('total-byte-weight'),
  });
}

if (!rows.length) {
  console.log('no reports to summarise');
  process.exit(1);
}

const pad = (v, n) => String(v).padEnd(n);
const lpad = (v, n) => String(v).padStart(n);

console.log('');
console.log(`${pad('page', 34)}${lpad('score', 6)}${lpad('FCP', 9)}${lpad('LCP', 9)}${lpad('TBT', 8)}${lpad('CLS', 8)}${lpad('SI', 9)}${lpad('TTFB', 8)}${lpad('weight', 9)}`);
console.log('-'.repeat(100));
for (const r of rows) {
  console.log(
    pad(r.url.slice(0, 33), 34) +
      lpad(r.score == null ? '—' : r.score, 6) +
      lpad(ms(r.fcp), 9) + lpad(ms(r.lcp), 9) + lpad(ms(r.tbt), 8) +
      lpad(s2(r.cls), 8) + lpad(ms(r.si), 9) + lpad(ms(r.ttfb), 8) + lpad(kb(r.bytes), 9),
  );
}

console.log('');
console.log(`against the Core Web Vitals targets (LCP <= ${TARGETS.lcp}ms, TBT <= ${TARGETS.tbt}ms, CLS <= ${TARGETS.cls}):`);
let failures = 0;
for (const r of rows) {
  const bad = [];
  if (r.lcp != null && r.lcp > TARGETS.lcp) bad.push(`LCP ${ms(r.lcp)}`);
  if (r.tbt != null && r.tbt > TARGETS.tbt) bad.push(`TBT ${ms(r.tbt)}`);
  if (r.cls != null && r.cls > TARGETS.cls) bad.push(`CLS ${s2(r.cls)}`);
  if (bad.length) {
    failures += 1;
    console.log(`  OVER   ${r.url}  —  ${bad.join(', ')}`);
  } else {
    console.log(`  within ${r.url}`);
  }
}

console.log('');
console.log(
  'These are LAB numbers from a GitHub runner with simulated mobile throttling.',
);
console.log(
  'They are reproducible and comparable between runs, which is what makes them',
);
console.log(
  'useful here — but they are not what Google ranks on. That is CrUX, from real',
);
console.log(
  'visits, and it needs Search Console. INP is absent for the same reason: it',
);
console.log('cannot be measured without real interactions.');

// Deliberately exit 0 even when a page is over target: this is a measurement,
// not a gate, and failing the run would stop the remaining reports printing.
process.exit(0);
