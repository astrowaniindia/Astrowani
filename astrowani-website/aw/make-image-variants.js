#!/usr/bin/env node
/**
 * Build the resized variants that the pages' `srcset` attributes point at.
 *
 *   node aw/make-image-variants.js           # write assets/responsive/
 *   node aw/make-image-variants.js --check   # report, write nothing
 *
 * WHY THIS EXISTS. The audit asked for responsive images, and the measured gap
 * was not subtle. Every width below was read off the rendered page in a real
 * browser at a 1440px viewport, against the source file's own dimensions:
 *
 *   testimonial-rohit.png      319x319 source, 153 KB, rendered  38x38
 *   svc-horoscope.png          506x493 source, 165 KB, rendered 140x140
 *   app-screenshot-home-2.webp 1024x1536 source, 171 KB, rendered 83x137
 *   promo-free-11min-woman     960x1920 source, 144 KB, rendered 165x341
 *   google-play-badge.png      719x278 source,  87 KB, rendered 134x52, on 27 pages
 *
 * A 153 KB file for a 38-pixel avatar is the whole argument.
 *
 * THE VARIANTS KEEP THE SOURCE'S FORMAT, deliberately. Offering WebP to a JPEG
 * or a transparent PNG needs <picture> with a type-negotiated <source>, and
 * `srcset` cannot do format negotiation — a browser picks by width or density
 * only. Resizing alone recovers nearly all of the bytes here, so the pages stay
 * plain <img> and nothing has to care which formats a browser accepts.
 *
 * EVERY IMAGE HERE RENDERS AT A FIXED SIZE, so the pages use DENSITY
 * descriptors (1x/2x) rather than width descriptors plus `sizes`. That was
 * measured too: the phone mock-ups are 165x341 at both a 774px and a 1440px
 * viewport, so a `sizes` attribute would be describing a width that never
 * changes. Density is the honest description of the problem, and it is also the
 * only form that is correct without knowing the layout.
 *
 * Nothing here touches the originals. `src` still points at them, so a browser
 * that understands neither srcset nor this folder gets exactly what it got
 * before.
 */

const path = require('path');
const fs = require('fs');

let sharp;
try {
  // Same borrow as aw/make-icons.js: the website has no package.json of its own
  // and the backend already depends on sharp.
  sharp = require('../../astrowani-backend/node_modules/sharp');
} catch (_) {
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('sharp not found. Run this from the repo, where astrowani-backend/node_modules/sharp exists.');
    process.exit(1);
  }
}

const SITE = path.resolve(__dirname, '..');
const ASSETS = path.join(SITE, 'assets');
const OUT = path.join(ASSETS, 'responsive');

const check = process.argv.includes('--check');

/**
 * `css` is the measured rendered width in CSS pixels; the 1x and 2x variants are
 * derived from it with a little headroom, so a change of a few pixels in the
 * layout does not make every variant subtly too small.
 */
const IMAGES = [
  { file: 'promo-free-11min-woman.webp', css: 165 },
  { file: 'promo-free-5min-guru.webp', css: 83 },
  { file: 'app-screenshot-home-2.webp', css: 83 },
  { file: 'google-play-badge.png', css: 134 },
  { file: 'testimonial-rohit.png', css: 38 },
  { file: 'svc-horoscope.png', css: 140 },
  { file: 'svc-chat.png', css: 140 },
  { file: 'svc-kundli.png', css: 140 },
  { file: 'svc-video.png', css: 140 },
  { file: 'svc-waniShop.png', css: 140 },
  // THE ONE FLUID IMAGE, so the only one with width descriptors and a `sizes`
  // attribute instead of 1x/2x. Measured 290x290 at a 375px viewport and
  // 500x500 at 1440px, and at 156 KB it is the heaviest image a phone actually
  // downloads on the homepage — the three phone mock-ups above it are
  // display:none on mobile and never fetched at all.
  { file: 'zodiac-wheel.png', widths: [320, 512, 640], sizes: '(max-width: 700px) 290px, 500px' },
];

/** Round up to a multiple of 16, so the widths read as deliberate rather than measured. */
function widthFor(css, density) {
  return Math.ceil((css * density * 1.08) / 16) * 16;
}

function variantName(file, width) {
  const ext = path.extname(file);
  return `${path.basename(file, ext)}-${width}${ext}`;
}

/** The two variants a page's srcset points at, for the HTML generator to reuse. */
function variantsFor(entry) {
  if (entry.widths) {
    return entry.widths.map((width) => ({ width, name: variantName(entry.file, width) }));
  }
  return [1, 2].map((density) => {
    const width = widthFor(entry.css, density);
    return { density, width, name: variantName(entry.file, width) };
  });
}

async function build() {
  if (!check) fs.mkdirSync(OUT, { recursive: true });
  let written = 0;
  let saved = 0;
  const missing = [];

  for (const entry of IMAGES) {
    const src = path.join(ASSETS, entry.file);
    if (!fs.existsSync(src)) {
      missing.push(entry.file);
      continue;
    }
    const meta = await sharp(src).metadata();
    const sourceBytes = fs.statSync(src).size;

    for (const variant of variantsFor(entry)) {
      // A variant wider than the source would be an upscale: skip it and let
      // srcset fall back to the original for that density.
      if (variant.width >= meta.width) continue;
      const dest = path.join(OUT, variant.name);
      if (check) {
        console.log(`  would write  ${variant.name}  (${variant.width}px from ${meta.width}px)`);
        written += 1;
        continue;
      }
      const pipeline = sharp(src).resize({ width: variant.width, withoutEnlargement: true });
      const ext = path.extname(entry.file).toLowerCase();
      if (ext === '.webp') pipeline.webp({ quality: 82 });
      else if (ext === '.png') pipeline.png({ compressionLevel: 9, palette: true });
      else pipeline.jpeg({ quality: 82, mozjpeg: true });
      await pipeline.toFile(dest);
      const bytes = fs.statSync(dest).size;
      written += 1;
      if (variant.density === 2 || variant.width === Math.max(...(entry.widths || [0]))) saved += sourceBytes - bytes;
      console.log(
        `  ${variant.name.padEnd(36)} ${String(Math.round(bytes / 1024)).padStart(4)}KB` +
          ` (source ${String(Math.round(sourceBytes / 1024)).padStart(4)}KB)`,
      );
    }
  }

  if (missing.length) {
    console.error(`\nMISSING SOURCES: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(
    check
      ? `\nwould write ${written} variant(s).`
      : `\nwrote ${written} variant(s); ~${Math.round(saved / 1024)}KB less to download at 2x.`,
  );
}

module.exports = { IMAGES, variantsFor, variantName, widthFor, OUT };

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
