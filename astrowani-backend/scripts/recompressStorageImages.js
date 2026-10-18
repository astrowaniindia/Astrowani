// ─────────────────────────────────────────────────────────────────────────────
// One-off: re-compress the oversized images ALREADY sitting in the app-images
// bucket. The upload path now caps new uploads (src/uploadRoutes.js) and the API
// now serves transformed variants (src/imageUrl.js), but neither of those
// touches what was stored before 2026-10-19 — including the three files that
// were 403 MB/day between them.
//
// WHAT IT DOES NOT DO, deliberately:
//
//   - It does not change the object's PATH or its FORMAT. Every row in every
//     table stores an absolute URL to these objects, and the website, the admin
//     dashboard and every installed app build hold their own copies. Rewriting a
//     path would mean finding and updating all of them; re-encoding a .png to
//     JPEG bytes would leave the extension lying about the contents. Resizing in
//     place needs no migration and no app release, so this is safe to run alone.
//   - It does not delete anything.
//
// It is therefore conservative by design: resize to a sane longest edge, keep the
// format, and keep whichever of the two is smaller.
//
// REQUIRES STORAGE TO BE REACHABLE. On 2026-10-19 the project was hard-blocked
// for exceeding its free-tier egress quota, which drops storage requests until
// the cycle refills — this script will fail outright until then (or until the
// org is on Pro). It reads and writes objects, so it needs the SERVICE ROLE key.
//
//   node --env-file=.env scripts/recompressStorageImages.js            # dry run
//   node --env-file=.env scripts/recompressStorageImages.js --apply
//   node --env-file=.env scripts/recompressStorageImages.js --apply --min-kb=300
//
// index.js is NEVER required here (booting it starts sessionManager's billing
// worker against the production database).
// ─────────────────────────────────────────────────────────────────────────────
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'app-images';
const APPLY = process.argv.includes('--apply');
const MIN_KB = Number((process.argv.find((a) => a.startsWith('--min-kb=')) || '').split('=')[1]) || 150;

// Same caps as the upload path, for the same reason: this is the SOURCE the
// render endpoint resizes from, not what any screen displays.
const MAX_EDGE_BY_FOLDER = {
  'astrologer-profiles': 1024,
  'customer-profiles': 1024,
  'profile-photo': 1024,
  'persona-photo': 1024,
  'customer-hands': 1024,
};
const MAX_EDGE_DEFAULT = 1600;
const maxEdgeFor = (folder) => {
  const hit = Object.keys(MAX_EDGE_BY_FOLDER).find((k) => folder.startsWith(k));
  return hit ? MAX_EDGE_BY_FOLDER[hit] : MAX_EDGE_DEFAULT;
};

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required (this script rewrites stored objects).');
  process.exit(1);
}
// supabase-js constructs a RealtimeClient eagerly, and on Node < 22 there is no
// global WebSocket for it to use — it throws at createClient even though this
// script only ever makes REST/storage calls. Hand it `ws` when the global is
// missing. (Same shim as scripts/backfillRemedyHindi.js; a local-run concern
// only — the VPS is not affected.)
const realtimeOpts = typeof WebSocket === 'undefined'
  ? { realtime: { transport: require('ws') } }
  : undefined;
const db = createClient(SUPABASE_URL, KEY, realtimeOpts);

// Voice notes and anything sharp cannot round-trip safely are skipped — see the
// same reasoning in src/uploadRoutes.js (SVG is a vector, GIF would lose its
// animation, audio is not an image at all).
const RESIZABLE = /\.(jpe?g|png|webp)$/i;

async function listFolder(folder) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 100, offset });
    if (error) throw new Error(`list ${folder}: ${error.message}`);
    if (!data || !data.length) break;
    out.push(...data.map((o) => ({ path: folder ? `${folder}/${o.name}` : o.name, meta: o.metadata || {} })));
    if (data.length < 100) break;
  }
  return out;
}

(async () => {
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — objects over ${MIN_KB} KB in ${BUCKET}\n`);

  const { data: top, error: topErr } = await db.storage.from(BUCKET).list('', { limit: 1000 });
  if (topErr) throw new Error(`list root: ${topErr.message}`);
  // A storage "folder" entry has no metadata; a file at the root does.
  const folders = (top || []).filter((o) => !o.metadata).map((o) => o.name);

  let candidates = [];
  for (const f of folders) candidates.push(...await listFolder(f));
  candidates = candidates
    .filter((o) => RESIZABLE.test(o.path))
    .filter((o) => Number(o.meta.size || 0) >= MIN_KB * 1024)
    .sort((a, b) => Number(b.meta.size || 0) - Number(a.meta.size || 0));

  console.log(`${candidates.length} candidate object(s)\n`);

  let before = 0; let after = 0; let changed = 0; let skipped = 0; let failed = 0;

  for (const obj of candidates) {
    const folder = obj.path.split('/')[0];
    const origSize = Number(obj.meta.size || 0);
    before += origSize;
    try {
      const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(obj.path);
      if (dlErr) throw new Error(dlErr.message);
      const buf = Buffer.from(await blob.arrayBuffer());

      const meta = await sharp(buf).metadata();
      const cap = maxEdgeFor(folder);
      // .rotate() applies the EXIF orientation tag before anything strips it.
      let pipeline = sharp(buf).rotate();
      if ((meta.width || 0) > cap || (meta.height || 0) > cap) {
        pipeline = pipeline.resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true });
      }
      // Format is preserved on purpose (see the header): the stored extension and
      // the served content-type must keep agreeing with the bytes.
      let out;
      if (meta.format === 'png') out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      else if (meta.format === 'webp') out = await pipeline.webp({ quality: 82 }).toBuffer();
      else out = await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();

      if (out.length >= buf.length) {
        after += origSize; skipped++;
        console.log(`  skip  ${obj.path} — already optimal (${(origSize / 1024).toFixed(0)} KB)`);
        continue;
      }

      after += out.length; changed++;
      const pct = (100 - (out.length / buf.length) * 100).toFixed(0);
      console.log(`  ${APPLY ? 'write' : 'would'} ${obj.path} — ${(buf.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB (-${pct}%)`);

      if (APPLY) {
        const { error: upErr } = await db.storage.from(BUCKET)
          .upload(obj.path, out, { contentType: blob.type || `image/${meta.format}`, upsert: true });
        if (upErr) throw new Error(upErr.message);
      }
    } catch (e) {
      after += origSize; failed++;
      console.log(`  FAIL  ${obj.path} — ${e.message}`);
    }
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`\n${changed} rewritten, ${skipped} already optimal, ${failed} failed`);
  console.log(`stored bytes: ${mb(before)} MB -> ${mb(after)} MB (-${(100 - (after / (before || 1)) * 100).toFixed(0)}%)`);
  if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');
})().catch((e) => { console.error(`\n${e.message}`); process.exit(1); });
