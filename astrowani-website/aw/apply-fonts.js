#!/usr/bin/env node
/**
 * Point every page at the SELF-HOSTED fonts (assets/fonts/, @font-face in
 * style.css) instead of Google Fonts.
 *
 *   node aw/apply-fonts.js            # rewrite the root pages
 *   node aw/apply-fonts.js --check    # report, write nothing
 *
 * It replaces the three Google Fonts lines in each page's <head> (two
 * preconnects and the stylesheet with its <noscript> twin) with two
 * <link rel="preload"> lines for the latin Manrope and Marcellus files, so the
 * browser starts fetching them with the HTML instead of after a second CSS file
 * from another domain. Idempotent.
 *
 * WHY (2026-11-16): the English homepage kept a 0.078 layout shift that the
 * Hindi one did not have — the headings re-wrapping when Marcellus arrived from
 * fonts.gstatic.com after first paint. Same-origin + preload makes the fonts
 * usually present at first paint, so there is nothing to swap.
 *
 * ORDER (CLAUDE.md EQ1): before make-hindi-pages, which rebuilds hi/ from the
 * root pages and rewrites `assets/` to `../assets/` in the preload hrefs.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');

const GOOGLE = /[ \t]*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\r*\n[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\r*\n[ \t]*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Marcellus[^"]*"[^>]*>(?:<noscript>[\s\S]*?<\/noscript>)?/;
const PRELOAD = [
  '<link rel="preload" href="assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>',
  '<link rel="preload" href="assets/fonts/marcellus-latin.woff2" as="font" type="font/woff2" crossorigin>',
];

let changed = 0;
let already = 0;
const missing = [];
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
  const p = path.join(ROOT, f);
  const before = fs.readFileSync(p, 'utf8');
  if (before.includes('assets/fonts/manrope-latin.woff2')) { already++; continue; }
  if (!GOOGLE.test(before)) { missing.push(f); continue; }
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const after = before.replace(GOOGLE, PRELOAD.join(eol));
  changed++;
  if (!check) fs.writeFileSync(p, after);
}
console.log(`${check ? 'would change' : 'changed'}: ${changed} page(s); already self-hosted: ${already}`);
if (missing.length) console.log(`no Google Fonts block (left alone): ${missing.join(', ')}`);
