#!/usr/bin/env node
/**
 * Point every <img> that has resized variants at them, with density descriptors.
 *
 *   node aw/apply-srcset.js           # rewrite the pages
 *   node aw/apply-srcset.js --check   # report what would change, write nothing
 *
 * Run aw/make-image-variants.js first; this reads its table, so the two cannot
 * disagree about which widths exist.
 *
 * Idempotent, and it only ever touches the `srcset` attribute: `src`, `width`,
 * `height`, `loading`, `alt` and `class` are left exactly as they are. That
 * matters because `width`/`height` are what aw/apply-image-dims.js put there to
 * stop layout shift, and because `src` staying on the original is what makes
 * this safe — a browser with no srcset support downloads precisely what it did
 * before.
 *
 * WHY DENSITY (1x/2x) AND NOT `sizes` + WIDTH DESCRIPTORS. Every image in the
 * table renders at a fixed CSS size, measured in a real browser at both 774px
 * and 1440px viewports and identical at both. A `sizes` attribute would be
 * describing a width that never varies, and getting it wrong is the usual way
 * responsive images end up serving the largest file to everyone.
 *
 * WHERE THE 2x VARIANT WOULD HAVE BEEN AN UPSCALE, the original is used for 2x
 * instead — three of the service icons are smaller than twice their rendered
 * size. Inventing pixels to satisfy a descriptor would be worse than sending the
 * file we already have.
 */

const path = require('path');
const fs = require('fs');

const { IMAGES, variantsFor } = require('./make-image-variants.js');

const SITE = path.resolve(__dirname, '..');
const ASSETS = path.join(SITE, 'assets');
const RESPONSIVE_DIR = path.join(ASSETS, 'responsive');

const check = process.argv.includes('--check');

/** The srcset value for one entry, or null when no variant was built. */
function srcsetFor(entry) {
  const parts = [];
  // A FLUID entry (one that declares `widths`) gets width descriptors and a
  // `sizes` attribute; everything else is fixed-size and gets 1x/2x. The source
  // itself is listed as the largest candidate, which is what makes this correct
  // for an image whose original is smaller than twice its rendered size.
  if (entry.widths) {
    for (const variant of variantsFor(entry)) {
      if (fs.existsSync(path.join(RESPONSIVE_DIR, variant.name))) {
        parts.push(`assets/responsive/${variant.name} ${variant.width}w`);
      }
    }
    if (!parts.length) return null;
    const natural = naturalWidth(entry.file);
    if (natural) parts.push(`assets/${entry.file} ${natural}w`);
    return parts.join(', ');
  }
  for (const variant of variantsFor(entry)) {
    if (fs.existsSync(path.join(RESPONSIVE_DIR, variant.name))) {
      parts.push(`assets/responsive/${variant.name} ${variant.density}x`);
    } else if (variant.density === 2) {
      // No 2x variant because it would have upscaled: the original IS the 2x.
      parts.push(`assets/${entry.file} 2x`);
    }
  }
  return parts.length > 1 ? parts.join(', ') : null;
}

/** The source image's own pixel width, read from the page's width attribute. */
function naturalWidth(file) {
  for (const page of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(SITE, page), 'utf8');
    const m = html.match(new RegExp(`<img[^>]*width="(\\d+)"[^>]*src="assets/${escapeForRegex(file)}"`));
    if (m) return Number(m[1]);
  }
  return null;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let changed = 0;
let skipped = 0;
const report = [];

for (const file of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
  const page = path.join(SITE, file);
  const before = fs.readFileSync(page, 'utf8');
  let after = before;

  for (const entry of IMAGES) {
    const srcset = srcsetFor(entry);
    if (!srcset) {
      skipped += 1;
      continue;
    }
    // Every <img> whose src is this asset. The tag is matched whole so an
    // existing srcset can be replaced rather than duplicated.
    const tag = new RegExp(`<img\\b[^>]*\\bsrc="assets/${escapeForRegex(entry.file)}"[^>]*>`, 'g');
    after = after.replace(tag, (match) => {
      const stripped = match.replace(/\s+srcset="[^"]*"/g, '');
      // Before `src`, so the attribute order reads the way a reader expects.
      const sizes = entry.sizes ? ` sizes="${entry.sizes}"` : '';
      return stripped
        .replace(/\s+sizes="[^"]*"/g, '')
        .replace(/\s+src="/, ` srcset="${srcset}"${sizes} src="`);
    });
  }

  if (after !== before) {
    changed += 1;
    const count = (after.match(/srcset="/g) || []).length;
    report.push(`  ${check ? 'would update' : 'updated'}  ${file.padEnd(30)} ${count} srcset`);
    if (!check) fs.writeFileSync(page, after);
  }
}

for (const line of report) console.log(line);
console.log(
  `${check ? 'would change' : 'changed'}: ${changed} page(s).` +
    (skipped ? ` ${skipped} image(s) had no variants built — run aw/make-image-variants.js.` : ''),
);
