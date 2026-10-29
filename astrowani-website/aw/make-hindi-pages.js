#!/usr/bin/env node
/**
 * Generate the Hindi pages under /hi/.
 *
 *   node aw/make-hindi-pages.js            # build every page that has translations
 *   node aw/make-hindi-pages.js --check    # report, write nothing
 *   node aw/make-hindi-pages.js --missing  # list untranslated strings, per page
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY THE EXISTING TOGGLE WAS NOT ENOUGH.
 *
 * The अ button swaps `textContent` in place through ASTROWANI_I18N_DICT. The URL
 * never changes, so there is one URL per page and what Google fetches at it is
 * English — the Hindi only appears after a click a crawler never makes. There is
 * no hreflang either, so nothing tells Google a Hindi version exists.
 *
 * Measured 2026-10-29: that dictionary holds ~70 phrases and the pages carry
 * 124 tagged elements against 18,631 words of visible English. It reaches the
 * headings and lead paragraphs — roughly 5% of the text. Generating pages from
 * it would produce a "Hindi" page that is 95% English, which is worse than no
 * Hindi page at all: Google sees a near-duplicate of the English one.
 *
 * So the Hindi is written, not derived, and lives in aw/hindi-strings.json.
 * ============================================================================
 *
 * HOW A PAGE IS BUILT. The English page is the source of truth for STRUCTURE;
 * only text is replaced. That means a layout change to marriage.html reaches
 * /hi/marriage.html on the next run with no second edit, which is the whole
 * reason this is a generator rather than 30 hand-maintained copies.
 *
 * PATHS. Everything on these pages is relative, so a page one directory deeper
 * needs `../` on assets, stylesheets and scripts — but NOT on links to other
 * pages: /hi/vastu.html linking to `marriage.html` correctly resolves to
 * /hi/marriage.html, which is exactly what a Hindi visitor should get.
 *
 * A PAGE WITH NO TRANSLATIONS IS NOT BUILT. A half-translated page is the one
 * outcome worth avoiding, so `--missing` reports what is outstanding and the
 * build skips anything below the threshold rather than shipping a mixed page.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HI_DIR = path.join(ROOT, 'hi');
const STRINGS = path.join(__dirname, 'hindi-strings.json');

const check = process.argv.includes('--check');
const listMissing = process.argv.includes('--missing');

/** Pages that get a Hindi version. Everything else stays English-only. */
const PAGES = [
  'index.html', 'consult.html', 'astrologers.html', 'book-call.html',
  'kundli-reading.html', 'marriage.html', 'tarot-reading.html', 'numerology.html',
  'career-astrology.html', 'vastu.html', 'lal-kitab.html',
  'horoscope.html', 'panchang.html', 'calculators.html', 'free-services.html',
  'courses.html', 'about.html', 'blog.html', 'blog-post.html',
  'privacy-policy.html', 'terms-and-conditions.html', 'refund-cancellation.html',
  'safety-guidelines.html', 'child-safety.html', 'delete-account.html',
  'report-vulnerability.html', '404.html',
];

/**
 * A page is only written once this much of its text is translated. Below it the
 * page would be visibly half-English, which reads as broken and gives Google a
 * near-duplicate of the English page.
 */
const MIN_COVERAGE = 0.9;

/**
 * A backstop on the runtime table, not its main filter. Nothing script.js
 * injects is longer than this; a dictionary entry that long is article prose
 * that reached the runtime table by mistake.
 */
const RUNTIME_STRING_MAX = 400;

/**
 * Anything this short is a label, a button or a chip, so it ships whether or
 * not it also appears in some page's static markup.
 */
const RUNTIME_LABEL_MAX = 60;

// Tags whose contents are never text to translate.
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'code', 'pre']);

// Attributes that hold human-readable text.
const TEXT_ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];

/**
 * Split HTML into tags and text, tracking which element we are inside so the
 * contents of <script>, <style> and <svg> are never touched. Deliberately not a
 * parser: these pages are generated and consistent, and a parser would reformat
 * the markup it round-trips, producing a diff on every run.
 */
function walk(html, onText, onTag) {
  const re = /<\/?([a-zA-Z][\w-]*)\b[^>]*>|<!--[\s\S]*?-->/g;
  let last = 0;
  let skipDepth = 0;
  let m;
  const out = [];
  while ((m = re.exec(html)) !== null) {
    const text = html.slice(last, m.index);
    out.push(skipDepth === 0 ? onText(text) : text);
    const tag = m[0];
    const name = (m[1] || '').toLowerCase();
    if (m[1]) {
      if (tag.startsWith('</')) {
        if (SKIP_TAGS.has(name) && skipDepth > 0) skipDepth--;
      } else if (SKIP_TAGS.has(name) && !tag.endsWith('/>')) {
        skipDepth++;
      }
    }
    out.push(skipDepth === 0 || SKIP_TAGS.has(name) ? onTag(tag) : tag);
    last = re.lastIndex;
  }
  out.push(skipDepth === 0 ? onText(html.slice(last)) : html.slice(last));
  return out.join('');
}

/** Is this worth translating, or is it punctuation, a number, or whitespace? */
function translatable(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]/.test(t)) return false;            // no Latin letters: nothing to translate
  if (t.startsWith('<!')) return false;             // <!doctype html> is not prose
  if (/^[\d\s.,:;!?()₹%+-]+$/.test(t)) return false; // numbers and punctuation
  return true;
}

/** Collect every translatable string on a page, in order, deduplicated. */
function collect(html) {
  const found = new Set();
  walk(
    html,
    (text) => {
      const t = text.trim();
      if (translatable(t)) found.add(t);
      return text;
    },
    (tag) => {
      for (const a of TEXT_ATTRS) {
        const m = tag.match(new RegExp(`\\b${a}="([^"]*)"`, 'i'));
        if (m && translatable(m[1])) found.add(m[1].trim());
      }
      return tag;
    },
  );
  return [...found];
}

/**
 * Rewrite relative paths for a page that now sits one directory deeper, and
 * point every page link at the version that will actually exist.
 *
 * `translated` is the set of pages this run will write, NOT what is on disk.
 * Asking the filesystem makes the output depend on build ORDER and on what a
 * previous run happened to leave behind: astrologers.html is built before
 * kundli-reading.html, so on a clean checkout it would link to the English
 * kundli page, and a page could never link to the Hindi version of ITSELF
 * because its own file is written after this runs. Both were measured.
 */
function reroot(html, translated) {
  return html
    .replace(/href="([\w-]+\.html)([?#][^"]*)?"/g, (tag, file, suffix = '') =>
      `href="${translated.has(file) ? '' : '../'}${file}${suffix}"`)
    .replace(/(["'(])(assets\/)/g, '$1../$2')
    .replace(/(["'(])(aw\/)/g, '$1../$2')
    .replace(/(["'])(style\.css)/g, '$1../$2')
    .replace(/(["'])(script\.js)/g, '$1../$2')
    .replace(/(["'])(astrologers-data\.js)/g, '$1../$2')
    .replace(/(["'])(astro-engine\.js)/g, '$1../$2')
    .replace(/(["'])(site\.webmanifest)/g, '$1../$2');
}

function buildPage(html, dict) {
  let translated = 0;
  let total = 0;
  const out = walk(
    html,
    (text) => {
      const t = text.trim();
      if (!translatable(t)) return text;
      total++;
      const hi = dict[t];
      if (!hi) return text;
      translated++;
      return text.replace(t, hi);
    },
    (tag) => {
      let next = tag;
      for (const a of TEXT_ATTRS) {
        const re = new RegExp(`(\\b${a}=")([^"]*)(")`, 'i');
        const m = next.match(re);
        if (!m || !translatable(m[2])) continue;
        total++;
        const hi = dict[m[2].trim()];
        if (!hi) continue;
        translated++;
        next = next.replace(re, `$1${hi.replace(/"/g, '&quot;')}$3`);
      }
      return next;
    },
  );
  return { html: out, translated, total };
}

// ── run ─────────────────────────────────────────────────────────────────────

const dict = fs.existsSync(STRINGS) ? JSON.parse(fs.readFileSync(STRINGS, 'utf8')) : {};
if (!check && !listMissing && !fs.existsSync(HI_DIR)) fs.mkdirSync(HI_DIR, { recursive: true });

let built = 0;
let skipped = 0;
const missingAll = new Map();

/**
 * PASS 1 — decide which pages qualify, before writing any of them. The link
 * rewrite in pass 2 needs the whole set up front; see reroot().
 */
const sources = new Map();
const translated = new Set();
for (const page of PAGES) {
  const src = path.join(ROOT, page);
  if (!fs.existsSync(src)) { console.log(`  (no ${page})`); continue; }
  const html = fs.readFileSync(src, 'utf8');
  const strings = collect(html);
  const missing = strings.filter((s) => !dict[s]);
  const coverage = strings.length ? (strings.length - missing.length) / strings.length : 1;
  sources.set(page, { html, missing, strings, coverage });
  if (coverage >= MIN_COVERAGE) translated.add(page);
}

// PASS 2 — build.
for (const [page, info] of sources) {
  const { html, missing, strings, coverage } = info;

  if (listMissing) {
    if (missing.length) missingAll.set(page, missing);
    continue;
  }

  if (!translated.has(page)) {
    skipped++;
    console.log(`  skip  ${page.padEnd(28)} ${Math.round(coverage * 100)}% translated (${missing.length} of ${strings.length} missing)`);
    continue;
  }

  const built1 = buildPage(html, dict);
  let out = reroot(built1.html, translated);
  // Links created at runtime (nav dropdowns, cards, chips) cannot be rewritten
  // here, so script.js needs the same set. It is emitted rather than hardcoded:
  // a hardcoded copy goes stale the moment another page is translated, and the
  // staleness is silent — the link just quietly goes to English.
  // …and a <script src> for the strings script.js INJECTS after load (nav
  // dropdowns, footer columns, category chips, the calculator notes). Those
  // never pass through this generator, so without them the navigation on a
  // fully translated page is still English.
  //
  // It is one shared file, not inlined, and it holds only the strings that
  // appear in NO page's static markup — i.e. exactly the ones that can only
  // arrive at runtime. Measured: inlining the whole dictionary under a 70-char
  // cap put 58 KB of Devanagari into EVERY page (3 bytes per character), half
  // the page weight, re-sent on every navigation. A shared file is fetched once
  // and cached, and this filter is what keeps article prose out of it.
  out = out.replace(/<head>/i, () =>
    `<head>\n<script>window.ASTROWANI_HI_PAGES=${JSON.stringify([...translated])};<\/script>`
    + `\n<script src="_strings.js"><\/script>`);
  // The page is Hindi now, and its own SEO block is written by apply-seo.js on
  // the next run — strip the English one so it cannot be left behind.
  out = out.replace(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->\r?\n?/, '');
  // BOTH attributes. `lang` is what Google and screen readers read;
  // `data-lang` is what script.js reads, and with it missing every Hindi page
  // ran astroApplyLang('en') on load and the language button could not tell
  // which way round it was.
  out = out.replace(/<html([^>]*)\blang="[^"]*"/i, '<html$1lang="hi" data-lang="hi"');

  const dest = path.join(HI_DIR, page);
  if (!check) fs.writeFileSync(dest, out);
  built++;
  console.log(`  ${check ? 'would build' : 'built'}  hi/${page.padEnd(28)} ${Math.round(coverage * 100)}%`);
}

// The strings script.js can only deliver at runtime: present in the dictionary,
// present in no page's markup. Written once, beside the pages that load it.
if (!check && !listMissing && built) {
  const inMarkup = new Set();
  for (const { strings } of sources.values()) for (const t of strings) inMarkup.add(t);
  // TWO rules, and the second alone is not enough. "Not in any page's markup"
  // looks like the exact definition of runtime-only, and it drops the whole nav:
  // "Services", "Login", "Free Kundli", "Love Calculator" are all nav or chip
  // labels AND headings somewhere, so they are in markup and still needed at
  // runtime. Measured — filtering on that alone put the navigation back into
  // English on every page. So: everything short (labels, buttons, chips),
  // plus anything that appears in no markup at all whatever its length.
  const runtime = Object.fromEntries(Object.entries(dict).filter(
    ([en, hi]) => en !== '_README' && hi && en.length <= RUNTIME_STRING_MAX
      && (en.length <= RUNTIME_LABEL_MAX || !inMarkup.has(en)),
  ));
  const body = `// GENERATED by aw/make-hindi-pages.js — do not edit.\n`
    + `window.ASTROWANI_HI_STRINGS=${JSON.stringify(runtime)};\n`;
  fs.writeFileSync(path.join(HI_DIR, '_strings.js'), body);
  console.log(`  wrote  hi/_strings.js${' '.repeat(21)} ${Object.keys(runtime).length} runtime strings, ${Math.round(body.length / 1024)} KB`);
}

if (listMissing) {
  let n = 0;
  for (const [page, list] of missingAll) {
    console.log(`\n── ${page}  (${list.length} missing) ──`);
    for (const s of list) { console.log(`  ${JSON.stringify(s)}`); n++; }
  }
  console.log(`\n${n} untranslated string(s) across ${missingAll.size} page(s).`);
  console.log(`Add them to aw/hindi-strings.json as "english": "हिन्दी".`);
} else {
  console.log(`\n${check ? 'would build' : 'built'} ${built} page(s), skipped ${skipped} below ${Math.round(MIN_COVERAGE * 100)}% coverage.`);
  if (!check && built) console.log('NOW RUN: node aw/apply-seo.js   (the /hi/ pages have no SEO block yet)');
}
