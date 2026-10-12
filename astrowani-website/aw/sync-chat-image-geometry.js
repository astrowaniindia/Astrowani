#!/usr/bin/env node
/**
 * Regenerate aw/chat-image-geometry.js from the APPS' copy of the same maths.
 *
 *   node aw/sync-chat-image-geometry.js
 *
 * WHY THIS EXISTS. The crop, rotate and canvas<->photo arithmetic has to be
 * identical in three places — the customer app, the astrologer app and this
 * website — because all three post the same normalised edit spec to the same
 * endpoint (POST /api/chat/image), and the backend replays it with sharp. If the
 * website's maths drifted, a photo cropped on the website would come back cropped
 * somewhere else, and nothing would error.
 *
 * The apps' file is CommonJS so it can be unit-tested under plain Node
 * (astrowani_customer-main/scripts/testImageEditorGeometry.js, 63 assertions).
 * This site ships ES modules with no bundler, so it cannot require() that file.
 * Rather than keep a hand-maintained second copy of the formulas, this script
 * TRANSLATES the one that is tested: it only rewrites the export syntax and
 * refuses to run if anything else would have to change.
 *
 * astrowani_customer-main/scripts/checkSharedChatImageFiles.js verifies the
 * generated file still matches, so a forgotten re-sync is caught rather than
 * shipped.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'astrowani_customer-main', 'src', 'components', 'chatImage', 'imageEditorGeometry.js');
const OUT = path.join(__dirname, 'chat-image-geometry.js');
const BANNER = `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced from astrowani_customer-main/src/components/chatImage/imageEditorGeometry.js
// by aw/sync-chat-image-geometry.js. Edit the app copy (which is unit-tested by
// astrowani_customer-main/scripts/testImageEditorGeometry.js) and re-run that
// script. The only difference between the two files is the export syntax.
`;

/** The app file's CommonJS tail, and the ESM exports that replace it. */
function translate(src) {
  const i = src.indexOf('// CommonJS on purpose');
  if (i < 0) throw new Error('the app file no longer ends with its module.exports block — update this script');
  const body = src.slice(0, i).replace(/\s+$/, '');
  const names = [...body.matchAll(/^(?:function|const) (\w+)/gm)].map((m) => m[1]);
  if (!names.length) throw new Error('found no top-level declarations to export');
  return `${BANNER}\n${body}\n\nexport {\n${names.map((n) => `  ${n},`).join('\n')}\n};\n`;
}

const out = translate(fs.readFileSync(SRC, 'utf8'));
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
fs.writeFileSync(OUT, out, 'utf8');
console.log(prev === out ? 'chat-image-geometry.js already in sync' : `chat-image-geometry.js regenerated (${out.length} bytes)`);
