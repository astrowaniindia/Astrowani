// ─────────────────────────────────────────────────────────────────────────────
// Verifies the 2026-10-19 egress work: src/imageUrl.js (delivery) and the
// downscale step in src/uploadRoutes.js (source).
//
// Offline — no network, no database, no Supabase. index.js is NEVER required
// (booting it starts sessionManager's billing worker against production).
//
// Every "X is left alone" check is paired with a positive control that X's
// sibling IS rewritten, because a helper that silently returned its input for
// everything would otherwise pass the whole negative half of this suite.
//
//   node scripts/testImageEgress.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const imageUrl = require('../src/imageUrl');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n== ${t} ==`);

const OBJ = 'https://fxpoustnddrgumhwdcma.supabase.co/storage/v1/object/public/app-images';

(async () => {
  // ───────────────────────────── delivery ─────────────────────────────
  section('imageUrl: rewrites the URLs that were costing the egress');

  const card = imageUrl.cardUrl(`${OBJ}/card-image/1786398252919-3b04b1237be2.jpeg`);
  ok('object path becomes a render path', card.includes('/storage/v1/render/image/public/'), card);
  ok('object path is gone', !card.includes('/storage/v1/object/public/'), card);
  ok('bucket and key survive untouched',
    card.includes('/app-images/card-image/1786398252919-3b04b1237be2.jpeg'), card);

  // Both dimensions plus resize=contain are load-bearing: width alone does NOT
  // scale proportionally, it leaves the height alone and squashes the image.
  ok('carries width', /[?&]width=520(&|$)/.test(card), card);
  ok('carries height too (width alone squashes)', /&height=520(&|$)/.test(card), card);
  ok('carries resize=contain (never crops)', /&resize=contain(&|$)/.test(card), card);
  ok('carries quality', /&quality=70(&|$)/.test(card), card);

  const widths = {
    avatar: imageUrl.avatarUrl(`${OBJ}/astrologer-profiles/a.jpg`),
    small: imageUrl.smallAvatarUrl(`${OBJ}/customer-profiles/b.png`),
    icon: imageUrl.iconUrl(`${OBJ}/icon-image-url-or-up/e.jpeg`),
    card: imageUrl.cardUrl(`${OBJ}/blogs/c.jpg`),
    banner: imageUrl.bannerUrl(`${OBJ}/banner-image-url-or-/d.png`),
  };
  ok('avatar width unchanged at 300 (the 2026-09-09 measured value)',
    widths.avatar.includes('width=300&height=300'), widths.avatar);
  ok('small avatar is 120', widths.small.includes('width=120&height=120'), widths.small);
  ok('icon is 240', widths.icon.includes('width=240&height=240'), widths.icon);
  ok('card is 520 (matches the 48%-wide grid, not above it)',
    widths.card.includes('width=520&height=520'), widths.card);
  ok('banner is 1080', widths.banner.includes('width=1080&height=1080'), widths.banner);
  ok('every surface gets its own width (not one hardcoded size)',
    new Set(Object.values(widths).map((u) => /width=(\d+)/.exec(u)[1])).size === Object.keys(widths).length,
    JSON.stringify(Object.values(widths).map((u) => /width=(\d+)/.exec(u)[1])));

  section('imageUrl: leaves alone what it must, and only what it must');

  // POSITIVE CONTROL FIRST: a clean Supabase URL of the same shape IS rewritten,
  // so the refusals below are the guard working and not a dead function.
  ok('CONTROL: a clean supabase url is rewritten',
    imageUrl.cardUrl(`${OBJ}/x/y.jpg`).includes('/render/image/'));

  const fallback = 'https://backend.astrowani.com/public/images/astro1.png';
  ok('bundled backend.astrowani.com fallback untouched',
    imageUrl.cardUrl(fallback) === fallback);
  // The render endpoint rejects a URL that already carries its own query string.
  const withQuery = `${OBJ}/x/y.jpg?token=abc`;
  ok('url that already has a query string untouched',
    imageUrl.cardUrl(withQuery) === withQuery);
  ok('a data: URI untouched (legacy base64 rows)',
    imageUrl.cardUrl('data:image/png;base64,AAAA') === 'data:image/png;base64,AAAA');
  ok('null survives as null (callers pass `x || null`)', imageUrl.smallAvatarUrl(null) === null);
  ok('undefined survives', imageUrl.smallAvatarUrl(undefined) === undefined);
  ok('empty string survives', imageUrl.cardUrl('') === '');
  ok('a number does not throw', imageUrl.cardUrl(42) === 42);
  ok('rewriting twice is a no-op, not a double rewrite',
    imageUrl.cardUrl(imageUrl.cardUrl(`${OBJ}/x/y.jpg`)) === imageUrl.cardUrl(`${OBJ}/x/y.jpg`));

  section('imageUrl: real values read out of production (2026-10-19)');

  // Every distinct non-base64 value actually stored in the columns these
  // endpoints serve, one per folder, read from the live database. Kept as a
  // fixture so this suite stays offline — but these are real rows, so a folder
  // naming convention nobody anticipated shows up here rather than in production.
  const LIVE = {
    'astro_services.image': [`${OBJ}/card-image/1786398252919-3b04b1237be2.jpeg`, `${OBJ}/card-image/1786881205319-6081060fa6e7.webp`],
    'banners.image': [`${OBJ}/banner-image-url-or-/1788605233739-e2cbe96a3fd9.jpeg`, `${OBJ}/banner-image-english/1790524713863-c2a2a28d10e8.jpeg`],
    'blogs.thumbnail': [`${OBJ}/blogs/1791887821210-6a8f566b3e4e.jpg`, `${OBJ}/thumbnail-url-or-upl/1786396062572-baabdf8daf9e.png`],
    'categories.image': [`${OBJ}/categories/1783622831487-177adb03ddbf.jpeg`, `${OBJ}/icon-image-url-or-up/1786396894514-6b4e9f42d1a6.jpeg`],
    'remedy_categories.image': [`${OBJ}/section-image-url-or/1786879879586-cdb1f0b27190.png`],
    'customers.profile_image': [`${OBJ}/customer-profiles/1792144504553-0cd47f678b94.png`],
  };
  const liveUrls = Object.values(LIVE).flat();
  ok(`all ${liveUrls.length} live storage urls rewrite to the render endpoint`,
    liveUrls.every((u) => imageUrl.cardUrl(u).includes('/render/image/public/')),
    liveUrls.filter((u) => !imageUrl.cardUrl(u).includes('/render/image/public/')).join(', '));
  ok('every extension in production survives (jpeg, jpg, png, webp)',
    new Set(liveUrls.map((u) => u.split('.').pop())).size === 4
    && liveUrls.every((u) => imageUrl.cardUrl(u).includes(`.${u.split('.').pop()}?`)));

  // A real row in customers.profile_image holds an on-device image-picker cache
  // path that was saved straight into the database. Unrelated pre-existing bug,
  // but it must pass through untouched rather than becoming a mangled URL.
  const devicePath = 'file:///data/user/0/com.astrowanicustomer/cache/rn_image_picker_lib_temp_43237d15.jpg';
  ok('a stray on-device file:// path is left exactly as-is',
    imageUrl.smallAvatarUrl(devicePath) === devicePath);

  // ───────────────────────────── source ─────────────────────────────
  // downscaleImage is module-private, so assert the route's wiring and then
  // prove the pipeline it describes on real pixels. Re-implementing the function
  // here would test this file rather than the route.
  section('uploadRoutes: the downscale step is wired into the route');

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'uploadRoutes.js'), 'utf8');
  ok('downscaleImage exists', /async function downscaleImage\(/.test(src));
  ok('the route calls it', /const smaller = await downscaleImage\(outBuffer, outMime, safeFolder\);/.test(src));
  ok('and applies the result',
    /if \(smaller\) \(\{ buffer: outBuffer, ext: outExt, mime: outMime \} = smaller\);/.test(src));
  // Order matters: capping must happen after AVIF conversion and background
  // removal, or those hand back a full-resolution buffer that is then stored.
  ok('it runs AFTER bg-removal (so it caps the final image)',
    src.indexOf('whitenAstrologerProfilePhoto(parsed.buffer') < src.indexOf('await downscaleImage('));
  ok('it runs BEFORE the upload', src.indexOf('await downscaleImage(') < src.indexOf('.upload(filename'));
  ok('EXIF orientation is applied before resize (sharp strips metadata)',
    src.indexOf('sharp(buffer).rotate()') > 0
    && src.indexOf('sharp(buffer).rotate()') < src.indexOf("fit: 'inside'"));
  ok('never enlarges', /withoutEnlargement: true/.test(src));
  ok('keeps the original when re-encoding would be bigger',
    /if \(out\.buffer\.length >= buffer\.length\) return null;/.test(src));
  ok('audio is excluded (voice notes share this route)',
    src.includes('/^image\\/(jpeg|png|webp)$/.test(mime)'));

  section('sharp pipeline: the sizes that blew the quota');

  const cap = 1600;
  // A photo-like 3000x2000 JPEG — roughly a phone-camera / banner export.
  const bigPhoto = await sharp({
    create: { width: 3000, height: 2000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 70 } },
  }).jpeg({ quality: 95 }).toBuffer();
  const shrunk = await sharp(bigPhoto).rotate()
    .resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  const sm = await sharp(shrunk).metadata();
  ok('3000x2000 photo is capped on its longest edge', sm.width === 1600, `${sm.width}x${sm.height}`);
  ok('aspect ratio preserved (fit:inside, never squashed)',
    Math.abs((sm.width / sm.height) - (3000 / 2000)) < 0.01, `${sm.width}x${sm.height}`);
  ok('and it is smaller than the original', shrunk.length < bigPhoto.length,
    `${(bigPhoto.length / 1024).toFixed(0)} KB -> ${(shrunk.length / 1024).toFixed(0)} KB`);

  // The real-world case: a multi-MB photo-PNG of the kind sitting in the live bucket.
  const pngBanner = await sharp({
    create: { width: 2400, height: 1200, channels: 3, noise: { type: 'gaussian', mean: 140, sigma: 60 } },
  }).png().toBuffer();
  const pngShrunk = await sharp(pngBanner).rotate()
    .resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  const ratio = pngShrunk.length / pngBanner.length;
  ok('a photo-PNG banner collapses by >80% (this is where the egress went)', ratio < 0.2,
    `${(pngBanner.length / 1024).toFixed(0)} KB -> ${(pngShrunk.length / 1024).toFixed(0)} KB (${(ratio * 100).toFixed(1)}%)`);

  section('sharp pipeline: the cases that must NOT be damaged');

  // Alpha must survive — these are logos and background-removed artwork.
  const alpha = await sharp({
    create: { width: 2000, height: 2000, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } },
  }).png().toBuffer();
  ok('CONTROL: the fixture really does carry alpha', (await sharp(alpha).metadata()).hasAlpha === true);
  const alphaOut = await sharp(alpha).rotate()
    .resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 }).toBuffer();
  const alphaOutMeta = await sharp(alphaOut).metadata();
  ok('transparency survives the resize', alphaOutMeta.hasAlpha === true);
  ok('alpha image stays PNG, not JPEG', alphaOutMeta.format === 'png', alphaOutMeta.format);

  // A small icon must come back at its own size, never blown up to the cap.
  const icon = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).png().toBuffer();
  const iconOut = await sharp(icon).rotate()
    .resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  ok('a 64px icon is NOT enlarged to the cap',
    (await sharp(iconOut).metadata()).width === 64, `${(await sharp(iconOut).metadata()).width}px`);

  // EXIF orientation: a landscape buffer tagged orientation=6 must come out
  // upright. Without .rotate() every phone portrait is silently stored sideways.
  const sideways = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: { r: 1, g: 2, b: 3 } },
  }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const rotMeta = await sharp(await sharp(sideways).rotate().jpeg().toBuffer()).metadata();
  ok('EXIF orientation=6 is applied (1200x600 -> 600x1200)',
    rotMeta.width === 600 && rotMeta.height === 1200, `${rotMeta.width}x${rotMeta.height}`);
  const nrMeta = await sharp(await sharp(sideways).jpeg().toBuffer()).metadata();
  ok('CONTROL: without .rotate() it would have stayed sideways',
    nrMeta.width === 1200, `${nrMeta.width}x${nrMeta.height}`);

  // Already-tiny, already-optimised input: re-encoding must not be allowed to
  // make it bigger. This is what the `>=` guard in the route protects.
  const tiny = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).jpeg({ quality: 40 }).toBuffer();
  const tinyOut = await sharp(tiny).rotate().jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
  ok('CONTROL: re-encoding a tiny flat JPEG really can enlarge it',
    tinyOut.length >= tiny.length, `${tiny.length} -> ${tinyOut.length} bytes`);
  ok('so the route keeps the original in that case (guard asserted above)',
    /if \(out\.buffer\.length >= buffer\.length\) return null;/.test(src));

  section(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
