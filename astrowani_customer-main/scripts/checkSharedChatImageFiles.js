#!/usr/bin/env node
/**
 * The photo-attachment files are duplicated into the astrologer app rather than
 * shared through a package — the pattern this monorepo already uses for every
 * cross-app helper (utils/sessionRoom.js, utils/chatImage.js, …). Duplication's
 * one real cost is DRIFT: a fix made in one copy and forgotten in the other, which
 * nothing notices until a customer and an astrologer see different things.
 *
 *   node scripts/checkSharedChatImageFiles.js
 *
 * Run it after touching anything under src/components/chatImage/. If a file is
 * MEANT to differ between the apps, take it off the list below and say why —
 * silently letting the two drift is the thing this exists to prevent.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CUSTOMER = path.join(__dirname, '..');
const VENDOR = path.join(__dirname, '..', '..', 'astrowani_vendors-main');

const SHARED = [
  'src/components/chatImage/StrokeCanvas.js',
  'src/components/chatImage/OrientedImage.js',
  'src/components/chatImage/imageEditorGeometry.js',
  'src/components/chatImage/ImageEditorModal.js',
  'src/components/chatImage/ChatImageBubble.js',
  'src/components/chatImage/AttachSourceSheet.js',
  'src/utils/chatImage.js',
  'scripts/testImageEditorGeometry.js',
];

const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);

let bad = 0;
for (const rel of SHARED) {
  const a = path.join(CUSTOMER, rel);
  const b = path.join(VENDOR, rel);
  if (!fs.existsSync(a)) { console.log(`  ✗ ${rel} — missing in the customer app`); bad += 1; continue; }
  if (!fs.existsSync(b)) { console.log(`  ✗ ${rel} — missing in the astrologer app`); bad += 1; continue; }
  const ha = hash(a);
  const hb = hash(b);
  if (ha !== hb) { console.log(`  ✗ ${rel} — DIFFERENT (customer ${ha}, astrologer ${hb})`); bad += 1; } else { console.log(`  ✓ ${rel}  ${ha}`); }
}

// The i18n keys these files look up must exist in BOTH apps, under the shared
// `chatImage.` prefix and in BOTH languages — a component rendering t('chatImage.x')
// in an app that has never heard of that key shows the raw key to a paying user.
const keyRe = /'(chatImage\.[A-Za-z_]+)'/g;
const usedKeys = new Set();
for (const rel of SHARED) {
  const src = fs.readFileSync(path.join(CUSTOMER, rel), 'utf8');
  let m = keyRe.exec(src);
  while (m) { usedKeys.add(m[1]); m = keyRe.exec(src); }
}
// The chat screens are NOT shared (each app wires its own), but they use the same keys.
for (const extra of [
  path.join(CUSTOMER, 'src/screens/ChatSessionScreen.js'),
  path.join(VENDOR, 'src/screens/VendorChatSession.js'),
]) {
  const src = fs.readFileSync(extra, 'utf8');
  let m = keyRe.exec(src);
  while (m) { usedKeys.add(m[1]); m = keyRe.exec(src); }
}
// `tab_crop` and friends are built as t(`chatImage.tab_${m}`), so they never appear
// as a literal and have to be named here by hand.
['chatImage.tab_crop', 'chatImage.tab_draw', 'chatImage.tab_text'].forEach((k) => usedKeys.add(k));

for (const [label, root] of [['customer', CUSTOMER], ['astrologer', VENDOR]]) {
  const src = fs.readFileSync(path.join(root, 'src/context/LanguageContext.js'), 'utf8');
  const missing = [...usedKeys].filter((k) => !src.includes(`'${k}':`));
  // Twice = once in English, once in Hindi. Anything else is a one-sided key.
  const oneSided = [...usedKeys].filter((k) => (src.split(`'${k}':`).length - 1) === 1);
  if (missing.length) { console.log(`  ✗ ${label}: missing keys — ${missing.join(', ')}`); bad += 1; }
  if (oneSided.length) { console.log(`  ✗ ${label}: keys in only one language — ${oneSided.join(', ')}`); bad += 1; }
  if (!missing.length && !oneSided.length) console.log(`  ✓ ${label}: all ${usedKeys.size} chatImage keys present in both languages`);
}

// The WEBSITE posts the same edit spec to the same endpoint, so its copy of the
// crop/rotate arithmetic has to agree with the apps' or a photo cropped on the
// website comes back cropped somewhere else — with nothing erroring. Its file is
// generated from the app's by astrowani-website/aw/sync-chat-image-geometry.js;
// this re-runs that translation and checks the result is what is on disk, so a
// forgotten re-sync is caught here instead of in production.
const WEB_GEOMETRY = path.join(__dirname, '..', '..', 'astrowani-website', 'aw', 'chat-image-geometry.js');
if (!fs.existsSync(WEB_GEOMETRY)) {
  console.log('  ✗ the website copy of the geometry is missing — run astrowani-website/aw/sync-chat-image-geometry.js');
  bad += 1;
} else {
  const appSrc = fs.readFileSync(path.join(CUSTOMER, 'src/components/chatImage/imageEditorGeometry.js'), 'utf8');
  const webSrc = fs.readFileSync(WEB_GEOMETRY, 'utf8');
  // Compare the BODIES: strip each file's own export syntax and the generated
  // banner, and what is left must be identical character for character.
  const appBody = appSrc.slice(0, appSrc.indexOf('// CommonJS on purpose')).replace(/\s+$/, '');
  const webBody = webSrc.slice(webSrc.indexOf('\n// ---') >= 0 ? 0 : 0);
  const webStripped = webBody
    .replace(/^\/\/ GENERATED FILE[\s\S]*?export syntax\.\n/, '')
    .replace(/\n\nexport \{[\s\S]*$/, '')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  if (webStripped === appBody) {
    console.log('  ✓ astrowani-website/aw/chat-image-geometry.js matches the tested app copy');
  } else {
    console.log('  ✗ astrowani-website/aw/chat-image-geometry.js has DRIFTED from the app copy'
      + ' — run `node aw/sync-chat-image-geometry.js` in astrowani-website');
    bad += 1;
  }
}

console.log(bad === 0 ? '\n✅ the shared photo-attachment files are in step\n' : `\n❌ ${bad} problem(s)\n`);
process.exit(bad === 0 ? 0 : 1);
