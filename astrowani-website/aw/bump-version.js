#!/usr/bin/env node
/**
 * Bump the ?v=N cache-busting version across the whole site.
 *
 *   node aw/bump-version.js 5
 *
 * WHY THIS EXISTS. deploy-shop.yml never purges Cloudflare, which caches these
 * assets for hours independently of the HTML — so a deploy that changes a file
 * without changing its URL can leave live pages running new HTML against old
 * JS/CSS. style.css and script.js already carried a hand-maintained ?v=N for
 * exactly this reason (it bit the site on 2026-10-09).
 *
 * ES modules make it worse: the browser resolves `import './chat.js'` on its
 * own, so versioning only the <script> tag leaves every imported module
 * cacheable at an unchanging URL. That is why the imports inside aw/*.js carry
 * the version too, and why this script exists rather than a manual edit of
 * thirty import lines.
 *
 * RUN THIS WHENEVER ANY FILE IN aw/ OR style.css OR script.js CHANGES.
 */

const fs = require('fs');
const path = require('path');

const V = Number(process.argv[2]);
if (!Number.isInteger(V) || V < 1) {
  console.error('Usage: node aw/bump-version.js <integer version>');
  process.exit(1);
}

const SITE = path.resolve(__dirname, '..');
const AW = __dirname;

let changed = 0;

// 1. HTML pages: the shared assets plus the web client's two entry points.
for (const file of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
  const p = path.join(SITE, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before
    .replace(/style\.css\?v=\d+/g, `style.css?v=${V}`)
    .replace(/script\.js\?v=\d+/g, `script.js?v=${V}`)
    .replace(/aw\/aw\.css\?v=\d+/g, `aw/aw.css?v=${V}`)
    // Any aw/*.js reference, whether it is a <script src> or an inline
    // `import ... from './aw/chat-page.js?v=N'` on the screen pages. Matching
    // only boot.js here is how the screens' own controllers got left behind on
    // a stale version.
    .replace(/(aw\/[a-zA-Z0-9_-]+\.js)\?v=\d+/g, `$1?v=${V}`);
  if (after !== before) {
    fs.writeFileSync(p, after);
    changed += 1;
  }
}

// 2. The modules' own imports of each other.
for (const file of fs.readdirSync(AW).filter((f) => f.endsWith('.js') && f !== 'bump-version.js')) {
  const p = path.join(AW, file);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(
    /(from\s+'\.\/[a-zA-Z0-9_-]+\.js)(\?v=\d+)?(')/g,
    `$1?v=${V}$3`,
  );
  if (after !== before) {
    fs.writeFileSync(p, after);
    changed += 1;
  }
}

console.log(`Bumped ${changed} file(s) to ?v=${V}`);
