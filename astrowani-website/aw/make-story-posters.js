#!/usr/bin/env node
/**
 * Make the cover images for the Web Stories (CLAUDE.md EU):
 *   assets/stories/<sign>.jpg   one per sign, for the daily horoscope stories
 *   assets/stories/blog.jpg     the fallback cover for a blog story whose
 *                               article has no usable thumbnail
 *
 *   node aw/make-story-posters.js
 *
 * 960x1280 (3:4). Google wants the story poster at least 640x853 and portrait;
 * the extra size is for high-density phones in the Discover feed.
 *
 * NO TEXT ON THE IMAGE, on purpose. Discover lays the story's own title over
 * the poster, so baked-in words would sit under Google's and clash — and an
 * image cannot be translated, so one set serves English and Hindi.
 *
 * What makes the twelve different: the zodiac wheel (assets/zodiac-wheel.png)
 * is turned so that sign sits at the top, under a gold marker. The wheel runs
 * clockwise from Aries, which is drawn just LEFT of twelve o'clock (its centre
 * at -15 degrees), so sign i is centred at -15 + 30*i and is brought to the top
 * by rotating 15 - 30*i.
 *
 * Re-run only when the artwork changes. The files keep their names, and nginx
 * caches images for a week (CLAUDE.md EQ6: an image resized in place is not
 * refetched by Cloudflare) — so if you change them, purge those URLs too.
 */
const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('../../astrowani-backend/node_modules/sharp');
} catch (_) {
  sharp = require('sharp');
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'stories');
const W = 960;
const H = 1280;
const WHEEL = 820;
const CY = 560; // wheel centre, a little above the middle: the title sits below
const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="${(CY / H) * 100}%" r="75%">
      <stop offset="0%" stop-color="#8a4528"/>
      <stop offset="45%" stop-color="#592A19"/>
      <stop offset="100%" stop-color="#2a120a"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFD700" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#FFD700" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="${W / 2}" cy="${CY}" r="${WHEEL * 0.66}" fill="url(#glow)"/>
</svg>`);

// The gold marker pointing down at the sign that is uppermost.
const marker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <path d="M ${W / 2 - 22} ${CY - WHEEL / 2 - 46} L ${W / 2 + 22} ${CY - WHEEL / 2 - 46} L ${W / 2} ${CY - WHEEL / 2 - 10} Z" fill="#FFD700"/>
</svg>`);

async function wheel(rotation) {
  // Trim the transparent margin first, then pad back to a square, so the
  // rotation turns about the CENTRE OF THE WHEEL rather than of the canvas.
  const trimmed = await sharp(path.join(ROOT, 'assets', 'zodiac-wheel.png')).trim().toBuffer({ resolveWithObject: true });
  const side = Math.max(trimmed.info.width, trimmed.info.height);
  const square = await sharp(trimmed.data)
    .resize(side, side, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const turned = await sharp(square).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  // Rotation grows the canvas; cut it back to the wheel's own square.
  const left = Math.round((turned.info.width - side) / 2);
  const top = Math.round((turned.info.height - side) / 2);
  return sharp(turned.data).extract({ left, top, width: side, height: side }).resize(WHEEL, WHEEL).png().toBuffer();
}

async function poster(file, rotation, withMarker) {
  const layers = [{ input: await wheel(rotation), left: (W - WHEEL) / 2, top: CY - WHEEL / 2 }];
  if (withMarker) layers.push({ input: marker, left: 0, top: 0 });
  await sharp(background).composite(layers).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
  return fs.statSync(file).size;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [i, sign] of SIGNS.entries()) {
    const bytes = await poster(path.join(OUT, `${sign}.jpg`), 15 - 30 * i, true);
    console.log(`${sign}.jpg  ${Math.round(bytes / 1024)} KB`);
  }
  const bytes = await poster(path.join(OUT, 'blog.jpg'), 0, false);
  console.log(`blog.jpg  ${Math.round(bytes / 1024)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
