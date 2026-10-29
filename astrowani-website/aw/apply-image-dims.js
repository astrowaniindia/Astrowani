#!/usr/bin/env node
/**
 * Add intrinsic width/height to every local <img>, and lazy-load the ones
 * below the fold.
 *
 *   node aw/apply-image-dims.js            # apply
 *   node aw/apply-image-dims.js --check    # report, write nothing
 *
 * WHY. Measured 2026-10-29: all 80 images across the 24 pages carried no
 * width/height, so the browser cannot reserve space and every image shifts the
 * layout as it arrives. That is Cumulative Layout Shift, and CLS is a ranking
 * signal as well as the thing that makes a page feel cheap. Only 20 of 80 were
 * lazy-loaded.
 *
 * THE CSS HAD TO CHANGE FIRST, and this is the part that is easy to get wrong.
 * `style.css` had `img { max-width: 100%; display: block; }` with NO
 * `height: auto`. Adding a height ATTRIBUTE under that rule squashes every
 * responsive image: max-width shrinks the width while the attribute holds the
 * height. `height: auto` is therefore not optional here — it is what makes the
 * attributes safe. Rules with their own explicit height (.ch-nav-brand img,
 * .blog-card-img, …) are more specific and still win, so nothing else moves.
 *
 * WHAT IS LEFT EAGER. The nav logo (.logo-mark) and the first content image on
 * each page: both are above the fold on arrival, and lazy-loading the LCP
 * element delays it rather than helping. Everything after them is deferred.
 *
 * Images whose src is a URL, a data: URI, or a file that is not on disk are
 * left untouched — their dimensions are not knowable here.
 */

const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('../../astrowani-backend/node_modules/sharp'); }
catch (_) { try { sharp = require('sharp'); } catch (_) {
  console.error('sharp not found.'); process.exit(1);
} }

const ROOT = path.join(__dirname, '..');
const check = process.argv.includes('--check');

// ---- 1. the CSS precondition -----------------------------------------------
const cssPath = path.join(ROOT, 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');
const OLD = 'img { max-width: 100%; display: block; }';
const NEW = 'img { max-width: 100%; height: auto; display: block; }';
let cssChanged = false;
if (css.includes(OLD)) {
  if (!check) { fs.writeFileSync(cssPath, css.replace(OLD, NEW)); }
  cssChanged = true;
  console.log(`${check ? 'would add' : 'added'} height:auto to the global img rule`);
} else if (css.includes(NEW)) {
  console.log('global img rule already has height:auto');
} else {
  console.error('ERROR: could not find the global img rule in style.css.');
  console.error('Adding width/height attributes without height:auto will squash images. Stopping.');
  process.exit(1);
}

// ---- 2. the attributes -----------------------------------------------------
const dims = new Map();
function sizeOf(src) {
  const clean = src.split('?')[0].split('#')[0];
  if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) return null;
  if (dims.has(clean)) return dims.get(clean);
  const p = path.join(ROOT, clean);
  let v = null;
  try {
    const m = require('child_process');
    v = null; // placeholder, replaced below by the async pass
  } catch (_) {}
  return v;
}

async function run() {
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  // Pre-read every referenced local image once.
  const srcs = new Set();
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) srcs.add(m[1]);
  }
  for (const s of srcs) {
    const clean = s.split('?')[0].split('#')[0];
    if (/^(https?:)?\/\//.test(clean) || clean.startsWith('data:')) continue;
    const p = path.join(ROOT, clean);
    if (!fs.existsSync(p)) continue;
    try {
      const md = await sharp(p).metadata();
      if (md.width && md.height) dims.set(clean, { w: md.width, h: md.height });
    } catch (_) { /* not an image sharp can read */ }
  }

  let added = 0, lazied = 0, untouched = 0, pages = 0;
  for (const f of files) {
    const p = path.join(ROOT, f);
    const html = fs.readFileSync(p, 'utf8');
    let seenContentImage = false;
    let out = html.replace(/<img\b[^>]*>/gi, (tag) => {
      const srcM = tag.match(/\bsrc="([^"]+)"/i);
      if (!srcM) return tag;
      const clean = srcM[1].split('?')[0].split('#')[0];
      const d = dims.get(clean);
      const isNavLogo = /class="[^"]*logo-mark/i.test(tag);
      let next = tag;

      if (d && !/\bwidth\s*=/i.test(next) && !/\bheight\s*=/i.test(next)) {
        next = next.replace(/<img\b/i, `<img width="${d.w}" height="${d.h}"`);
        added++;
      } else if (!d) {
        untouched++;
      }

      // Above the fold stays eager: anything in a nav or brand block, and the
      // first content image. The brand logo appears TWICE on the homepage —
      // once in the floating nav (.logo-mark) and once in the hero pill
      // (.ch-nav-brand) — and only the first carries a class this can see, so
      // match the file itself too. Lazy-loading an above-the-fold image delays
      // it rather than helping; that regression was introduced and caught on
      // 2026-10-29.
      const isBrand = isNavLogo
        || /(ch-nav-brand|nav-brand)/i.test(tag)
        || /logo-240\.jpg/i.test(tag);
      const aboveFold = isBrand || !seenContentImage;
      if (!isBrand) seenContentImage = true;
      if (!aboveFold && !/\bloading\s*=/i.test(next)) {
        next = next.replace(/<img\b/i, '<img loading="lazy" decoding="async"');
        lazied++;
      }
      return next;
    });

    if (out !== html) {
      pages++;
      if (!check) fs.writeFileSync(p, out);
    }
  }

  console.log(`${check ? 'would add' : 'added'} width/height to ${added} image tag(s)`);
  console.log(`${check ? 'would lazy-load' : 'lazy-loaded'} ${lazied} below-the-fold image(s)`);
  if (untouched) console.log(`${untouched} tag(s) left alone (remote, data:, or file not on disk)`);
  console.log(`${check ? 'would touch' : 'touched'} ${pages} page(s); CSS ${cssChanged ? 'updated' : 'already ok'}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
