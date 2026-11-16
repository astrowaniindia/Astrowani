#!/usr/bin/env node
/**
 * Tell IndexNow (Bing/Copilot, Yandex, …) which website pages a deploy changed.
 *
 *   node vps-deployment/scripts/indexnow-submit.js <before-sha> <after-sha>   # from a deploy
 *   node vps-deployment/scripts/indexnow-submit.js --urls <url> [<url> …]     # explicit
 *   node vps-deployment/scripts/indexnow-submit.js --horoscopes                # the 24 sign pages + 24 Web Stories
 *   … add --dry-run to print what would be sent and send nothing.
 *
 * Run by .github/workflows/deploy-shop.yml after the website is copied, and by
 * daily-horoscope.yml for the 24 horoscope pages. The submission itself is
 * astrowani-backend/src/indexNow.js (plain Node, no npm install needed).
 *
 * WHAT IS SENT: only indexable pages. A changed file under astrowani-website/
 * becomes its public URL (index.html -> the site root); anything carrying
 * <meta name="robots" content="noindex"> (chat, call, wallet, 404, …) and
 * anything that is not an .html page is left out — asking a search engine to
 * crawl a page we ask it not to index is a contradiction.
 *
 * The URL base is SITE_BASE from aw/apply-seo.js, the same constant every
 * canonical on the site is built from, so the two cannot disagree.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const SITE = path.join(REPO, 'astrowani-website');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');

const siteBase = (fs.readFileSync(path.join(SITE, 'aw/apply-seo.js'), 'utf8').match(/const SITE_BASE = '([^']+)'/) || [])[1];
if (!siteBase) { console.error('SITE_BASE not found in aw/apply-seo.js'); process.exit(1); }

/** Public URL for a website file, or null if it should not be submitted. */
function urlFor(rel) {
  if (!rel.endsWith('.html')) return null;
  // The article template: real articles are announced when they publish (src/indexNow.js).
  if (rel === 'blog-post.html' || rel === 'hi/blog-post.html') return null;
  const file = path.join(SITE, rel);
  if (!fs.existsSync(file)) return null; // deleted
  if (/<meta name="robots" content="noindex/.test(fs.readFileSync(file, 'utf8'))) return null;
  if (rel === 'index.html') return `${siteBase}/`;
  if (rel === 'hi/index.html') return `${siteBase}/hi/`;
  return `${siteBase}/${rel}`;
}

let urls;
if (args[0] === '--horoscopes') {
  // The 24 sign pages whose reading the daily bake just changed (daily-horoscope.yml).
  const signs = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  urls = signs.flatMap((s) => [`${s}-horoscope.html`, `hi/${s}-horoscope.html`]).map(urlFor).filter(Boolean);
  // And their 24 Web Stories (aw/horoscope-stories.js), rewritten by the same
  // bake. Listed directly, not through urlFor(): they exist only on the VPS, so
  // the file check urlFor makes against this checkout would drop every one.
  urls.push(...signs.flatMap((s) => [`stories/${s}-horoscope.html`, `hi/stories/${s}-horoscope.html`]).map((rel) => `${siteBase}/${rel}`));
} else if (args[0] === '--urls') {
  urls = args.slice(1).filter((a) => !a.startsWith('--'));
} else {
  const [before, after] = args.filter((a) => !a.startsWith('--'));
  if (!before || !after || /^0+$/.test(before)) {
    console.log('no previous commit to compare with (first push or manual run) — nothing to submit');
    process.exit(0);
  }
  // -I ignores hunks whose every changed line matches: a deploy that only bumps
  // the ?v= asset version touches nearly every page without changing what it
  // says, and re-announcing ~80 unchanged pages each time is what IndexNow asks
  // sites not to do.
  //
  // File names come from the PATCH headers, not --name-only: git applies -I to
  // the patch but NOT to --name-only/--stat, which list every touched file
  // regardless (measured, git 2.50). The regex is POSIX basic, where `+` is a
  // literal, hence [0-9][0-9]*.
  const patch = execFileSync('git', ['diff', '--no-color', '--no-ext-diff', '-I', '[?]v=[0-9][0-9]*', before, after, '--', 'astrowani-website/'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const changed = [...patch.matchAll(/^diff --git a\/astrowani-website\/(\S+) b\//gm)].map((m) => m[1]);
  urls = changed.map(urlFor).filter(Boolean);
}

if (!urls.length) { console.log('no indexable pages changed — nothing to submit'); process.exit(0); }
console.log(`${urls.length} url(s):\n  ${urls.slice(0, 30).join('\n  ')}${urls.length > 30 ? `\n  … and ${urls.length - 30} more` : ''}`);
if (dry) { console.log('--dry-run: nothing sent'); process.exit(0); }

process.env.INDEXNOW_FORCE = '1';
require(path.join(REPO, 'astrowani-backend/src/indexNow.js')).submit(urls, { base: siteBase }).then((r) => {
  console.log('indexnow:', JSON.stringify(r));
  // Never fail a deploy over a ping; the pages are already live.
  process.exit(0);
});

module.exports = { urlFor };
