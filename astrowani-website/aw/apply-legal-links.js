#!/usr/bin/env node
/**
 * Point every link to a legal page at its OLD WORDPRESS ADDRESS.
 *
 *   node aw/apply-legal-links.js           # apply
 *   node aw/apply-legal-links.js --check   # report, write nothing (exit 1 if anything would change)
 *
 * The footer on every page links privacy-policy.html, terms-and-conditions.html
 * and so on. Those pages now answer at /privacy-policy/, /term_conditions/ …
 * (aw/legal-paths.js says why), and the .html form 301s there — so a link left
 * at the .html name costs every click a redirect, and Google reads an internal
 * link to a redirect as a weaker signal for the page it lands on.
 *
 * Relative links stay relative ("privacy-policy/"), so a /hi/ page reaches
 * /hi/privacy-policy/ exactly as it used to reach /hi/privacy-policy.html.
 * A #fragment or ?query on the link is kept.
 *
 * Only href="<file>…" with the bare file name is rewritten. Absolute URLs are
 * left alone: the ones inside the SEO block belong to apply-seo.js, which
 * rewrites that block wholesale anyway.
 *
 * RUN ORDER: before make-hindi-pages.js (the Hindi pages are copied from these)
 * and before apply-seo.js. Idempotent — a second run changes nothing.
 */
const fs = require('fs');
const path = require('path');
const { LEGAL_PATHS } = require('./legal-paths');

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');

const files = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT, 'hi')).filter((f) => f.endsWith('.html')).map((f) => `hi/${f}`),
];

const names = Object.keys(LEGAL_PATHS).map((f) => f.replace(/[.]/g, '\\.')).join('|');
const re = new RegExp(`href="(${names})([?#][^"]*)?"`, 'g');

let changed = 0;
let links = 0;
for (const rel of files) {
  const p = path.join(ROOT, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(re, (_, file, rest = '') => {
    links++;
    return `href="${LEGAL_PATHS[file]}${rest}"`;
  });
  if (after !== before) {
    changed++;
    if (!check) fs.writeFileSync(p, after);
  }
}
console.log(`${check ? 'would change' : 'changed'}: ${changed} page(s), ${links} link(s)`);
if (check && changed) process.exit(1);
