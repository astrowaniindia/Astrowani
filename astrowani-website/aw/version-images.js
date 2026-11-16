#!/usr/bin/env node
/**
 * Give every local image (and self-hosted font) reference a content hash: assets/x.jpg -> assets/x.jpg?h=1a2b3c4d
 *
 *   node aw/version-images.js            # rewrite
 *   node aw/version-images.js --check    # report, write nothing
 *
 * WHY (CLAUDE.md EQ6). nginx serves images with a week's cache and Cloudflare
 * keeps them at the edge by URL. An image resized or redrawn IN PLACE keeps its
 * URL, so the edge goes on serving the old bytes — measured 2026-10-30: four
 * resized assets still served at their old size 14 hours after the deploy. With
 * the hash in the URL, a changed file is a NEW address and is fetched fresh; an
 * unchanged file keeps its address and its cache. No purge needed, ever again.
 *
 * `?h=`, NOT `?v=`, on purpose: aw/bump-version.js rewrites `?v=<digits>` and an
 * eight-hex hash can be all digits. Different letter, no collision.
 *
 * WHAT IT TOUCHES: every root and hi/ .html page, style.css and aw/aw.css — in
 * src, srcset, href, poster and CSS url(). It does NOT touch:
 *   - the SEO:START..END block (aw/apply-seo.js owns it, and must stay
 *     idempotent; og:image there is absolute and is a social-card fetch anyway);
 *   - JavaScript files (their image paths are built at runtime from data);
 *   - a reference to a file that does not exist (left exactly as it is).
 *
 * ORDER (CLAUDE.md EQ1): LAST — after apply-seo. And if it changed style.css or
 * aw.css, those files' own URLs must change too or browsers keep the old CSS
 * (they are cached as immutable by ?v=): run bump-version, then the chain again.
 * The script says so when it happens.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');
const IMG = /((?:\.\.\/)?assets\/[A-Za-z0-9_\/.-]+?\.(?:png|jpe?g|webp|svg|gif|avif|ico|woff2))(\?h=[0-9a-f]{8})?(?=["')\s,])/g;

const cache = new Map();
/** The 8-hex content hash of assets/<...>, or null if there is no such file. */
function hashFor(ref) {
  const rel = ref.replace(/^(\.\.\/)+/, '');
  if (!cache.has(rel)) {
    const p = path.join(ROOT, rel);
    cache.set(rel, fs.existsSync(p) && fs.statSync(p).isFile()
      ? crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8)
      : null);
  }
  return cache.get(rel);
}

/** `assets/x.jpg` -> `assets/x.jpg?h=...` (for generators that write image URLs). */
const versioned = (ref) => {
  const h = hashFor(ref.split('?')[0]);
  return h ? `${ref.split('?')[0]}?h=${h}` : ref;
};

function rewrite(text) {
  const swap = (s) => s.replace(IMG, (all, ref) => {
    const h = hashFor(ref);
    return h ? `${ref}?h=${h}` : all;
  });
  // Leave apply-seo's block exactly as that script wrote it.
  const m = text.match(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->/);
  if (!m) return swap(text);
  const i = text.indexOf(m[0]);
  return swap(text.slice(0, i)) + m[0] + swap(text.slice(i + m[0].length));
}

if (require.main === module) {
  const files = [
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
    ...fs.readdirSync(path.join(ROOT, 'hi')).filter((f) => f.endsWith('.html')).map((f) => `hi/${f}`),
    'style.css', 'aw/aw.css',
  ];
  let changed = 0;
  const css = [];
  for (const f of files) {
    const p = path.join(ROOT, f);
    const before = fs.readFileSync(p, 'utf8');
    const after = rewrite(before);
    if (after === before) continue;
    changed++;
    if (f.endsWith('.css')) css.push(f);
    if (!check) fs.writeFileSync(p, after);
  }
  console.log(`${check ? 'would version' : 'versioned'} images in ${changed} file(s)`);
  if (css.length) console.log(`${css.join(', ')} changed: run bump-version so browsers fetch the new CSS, then the chain again.`);
}

module.exports = { hashFor, versioned, rewrite };
