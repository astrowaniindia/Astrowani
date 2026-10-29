#!/usr/bin/env node
/**
 * Generate the favicon set, the nav logo and the default Open Graph image.
 *
 *   node aw/make-icons.js
 *
 * WHY THIS EXISTS. `assets/logo.png` is a 1024x1024, 522 KB PNG, and every page
 * referenced it as `<link rel="icon">` — so every visitor downloaded half a
 * megabyte to draw a 16px browser tab icon, on every page. It is also the nav
 * logo, drawn at about 40px. Measured 2026-10-29: it was the second heaviest
 * request on the homepage after the 3D model, and took 11.2s to arrive.
 *
 * The source has NO alpha channel (checked with sharp's stats(), not with
 * metadata().hasAlpha — the flag says a channel exists, the stats say whether
 * anything uses it), so JPEG is lossless to the eye here and much smaller.
 *
 * THE OG IMAGE IS THE OTHER HALF. The site had no og:image at all, so every
 * share in WhatsApp rendered as a bare link. 1200x630 is the size Facebook,
 * WhatsApp, X and LinkedIn all accept; anything else gets cropped unpredictably.
 *
 * Re-run this whenever assets/logo.png changes. Everything it writes is
 * committed, so a deploy does not need Node.
 */

const path = require('path');
const fs = require('fs');

let sharp;
try {
  sharp = require('../../astrowani-backend/node_modules/sharp');
} catch (_) {
  try { sharp = require('sharp'); } catch (_) {
    console.error('sharp not found. Run from the repo so ../astrowani-backend/node_modules is reachable.');
    process.exit(1);
  }
}

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo.png');
const MAROON = { r: 0x59, g: 0x2a, b: 0x19 };

if (!fs.existsSync(SRC)) {
  console.error('missing', SRC);
  process.exit(1);
}

const out = (p) => path.join(ROOT, 'assets', p);

async function main() {
  const before = fs.statSync(SRC).size;
  const made = [];

  // Favicons. 32 is what desktop browsers actually draw; 16 is the legacy size
  // some still ask for. PNG, not JPEG: these sit on the browser's own chrome and
  // JPEG ringing is visible at 16px.
  for (const size of [16, 32]) {
    const f = `favicon-${size}.png`;
    await sharp(SRC).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(out(f));
    made.push(f);
  }

  // Apple touch icon: 180x180, no transparency, no rounding (iOS rounds it).
  await sharp(SRC).resize(180, 180, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(out('apple-touch-icon.png'));
  made.push('apple-touch-icon.png');

  // The nav logo, drawn at ~40px CSS. 240px covers a 3x display with room spare.
  await sharp(SRC).resize(240, 240, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toFile(out('logo-240.jpg'));
  made.push('logo-240.jpg');

  // Default OG card: the logo centred on brand maroon. Deliberately plain —
  // a share card has to stay legible as a 200px thumbnail in a chat list.
  const badge = await sharp(SRC).resize(380, 380, { fit: 'cover' }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: MAROON } })
    .composite([{ input: badge, gravity: 'centre' }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(out('og-default.jpg'));
  made.push('og-default.jpg');

  console.log(`source assets/logo.png: ${(before / 1024).toFixed(0)} KB`);
  for (const f of made) {
    console.log(`  wrote assets/${f.padEnd(22)} ${(fs.statSync(out(f)).size / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
