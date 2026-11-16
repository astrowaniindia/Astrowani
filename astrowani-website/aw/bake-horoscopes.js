#!/usr/bin/env node
/**
 * Bake TODAY's reading into the 24 sign horoscope pages (12 English + 12 Hindi).
 *
 *   node aw/bake-horoscopes.js --root <site dir>            # today, India time
 *   node aw/bake-horoscopes.js --root <site dir> --date 2026-11-16
 *   … add --check to report what would change and write nothing.
 *
 * WHY. The reading on each sign page used to exist only after aw/horoscope-sign.js
 * ran in the browser, so the HTML a crawler first receives had no reading in it.
 * Baking puts the day's text, date and bars into the page itself; the script
 * still re-renders on load (same text, since it is the same function and date)
 * and keeps the Today/Tomorrow/Week buttons working.
 *
 * WHERE IT RUNS — the DEPLOYED copy, never the repo. It is pointed with --root at
 * /var/www/astrowani/shop/test-site by deploy-shop.yml (after every website
 * deploy) and by daily-horoscope.yml (just after midnight IST). The repo keeps
 * empty BAKED markers, so git does not change every day.
 *
 * HOW. Only the text between <!-- BAKED:START --> and <!-- BAKED:END --> inside
 * #sign-date and #sign-sentence, and the width of the four #sign-meter-* bars,
 * are touched. aw/make-hindi-pages.js empties BAKED blocks before building, so
 * baked English can never leak into a Hindi page; this script writes the Hindi
 * reading into hi/ itself. The reading is astroHoroscopeReading() from
 * astro-engine.js, loaded as-is, so it is identical to what the browser shows.
 *
 * It also writes the 24 daily Web Stories (aw/horoscope-stories.js) from the
 * same reading.
 *
 * Exits 0 even when a page is missing (a partial bake beats none) but reports it;
 * exits 1 only if astro-engine.js cannot be loaded at all.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const ROOT = path.resolve(arg('--root') || path.join(__dirname, '..'));
const check = args.includes('--check');

/** Today's calendar date in India, whatever timezone this machine runs in. */
function istDate() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dateStr = arg('--date') || istDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { console.error(`bad --date ${dateStr}`); process.exit(1); }
const [y, mo, d] = dateStr.split('-').map(Number);
// Noon LOCAL time on that calendar day: astroDayKey reads the local getters, and
// noon keeps any timezone the runner happens to be in on the same date.
const date = new Date(y, mo - 1, d, 12, 0, 0);

const ctx = {};
vm.createContext(ctx);
try {
  vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'astro-engine.js'), 'utf8')}\nthis.reading = astroHoroscopeReading;`, ctx);
} catch (e) { console.error(`cannot load astro-engine.js from ${ROOT}: ${e.message}`); process.exit(1); }

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const label = (lang) => date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function bakeSlot(html, id, text) {
  const re = new RegExp(`(id="${id}"[^>]*><!-- BAKED:START -->)[\\s\\S]*?(<!-- BAKED:END -->)`);
  if (!re.test(html)) return null;
  return html.replace(re, (_, a, b) => `${a}${esc(text)}${b}`);
}

let changed = 0, missing = [];
for (const sign of SIGNS) {
  for (const lang of ['en', 'hi']) {
    const rel = `${lang === 'hi' ? 'hi/' : ''}${sign.toLowerCase()}-horoscope.html`;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) { missing.push(rel); continue; }
    const before = fs.readFileSync(file, 'utf8');
    const { sentence, meters } = ctx.reading(sign, date, 'daily', lang);
    let html = bakeSlot(before, 'sign-sentence', sentence);
    html = html && bakeSlot(html, 'sign-date', label(lang));
    if (!html) { missing.push(`${rel} (no BAKED markers)`); continue; }
    for (const k of ['love', 'career', 'money', 'health']) {
      html = html.replace(new RegExp(`(id="sign-meter-${k}" style="width:)\\d+(%)`), `$1${meters[k]}$2`);
    }
    if (html !== before) {
      changed++;
      if (!check) fs.writeFileSync(file, html);
    }
  }
}
console.log(`${check ? 'would bake' : 'baked'} ${changed} page(s) for ${dateStr} in ${ROOT}`);

// The 24 daily Web Stories (aw/horoscope-stories.js, CLAUDE.md EU), from the
// same reading. Guarded on its own: a story failure must never cost the pages
// their bake, which has already happened above.
try {
  const stories = require('./horoscope-stories.js');
  const r = stories.writeStories(ROOT, dateStr, date, (sign, lang) => ctx.reading(sign, date, 'daily', lang), { check });
  console.log(`${check ? 'would write' : 'wrote'} ${r.changed} of ${r.files.length} web stories`);
} catch (e) {
  console.error(`web stories NOT written: ${e.message}`);
}
if (missing.length) console.log(`skipped: ${missing.join(', ')}`);
