#!/usr/bin/env node
/**
 * Give existing app-images objects a long, valid Cache-Control header.
 *
 *   node --env-file=.env scripts/repairStorageCacheControl.js                 # dry run
 *   node --env-file=.env scripts/repairStorageCacheControl.js --limit 3 --apply
 *   node --env-file=.env scripts/repairStorageCacheControl.js --apply
 *
 * Options: --apply  --force  --limit N  --prefix folder/  --concurrency N
 *
 * WHY A RE-UPLOAD, WHICH IS THE EXPENSIVE WAY
 * Measured 2026-11-13: every object in `app-images` served
 * `Cache-Control: public, max-age=3600`, because no upload call site set
 * `cacheControl` and storage-js defaults to '3600'. That is one hour on files whose
 * names are already content-unique and can never change — so devices re-downloaded
 * the whole image set hourly. It applies to the render endpoint too: a transformed
 * response inherits the source object's header.
 *
 * The cheap fix — UPDATE storage.objects.metadata->>'cacheControl' — WAS TRIED AND
 * DOES NOT WORK. That column is a mirror; the header is served from the object in
 * the storage backend. After updating one row, a render request on a fresh cache key
 * (CF-Cache-Status: MISS, i.e. straight from origin) still returned max-age=3600.
 * The row was reverted. Do not spend time on that route again.
 *
 * So the only supported way is to re-upload the bytes with the right header. That
 * makes this script a file-rewriting tool over live user-facing media, so it:
 *   - is a DRY RUN unless --apply is passed;
 *   - verifies the download against the recorded size BEFORE writing anything;
 *   - re-downloads after writing and compares SHA-256 with what it read, and ABORTS
 *     THE WHOLE RUN on the first mismatch rather than carrying on through 900 files;
 *   - preserves the path, so every URL already stored in the database keeps working,
 *     and the content type, so nothing changes format;
 *   - skips anything already correct, which makes it resumable and idempotent.
 *
 * EXCLUDED ON PURPOSE: `chat-images/` and `voice-notes/`. Those are one-to-one user
 * content fetched once or twice in their life (measured: 2 requests each), so there
 * is nothing to save, and they are the objects least worth putting a rewrite tool
 * near. `--prefix chat-images/` overrides it if that is ever genuinely wanted.
 */

// supabase-js builds a Realtime client eagerly and @supabase/realtime-js throws at
// require time without a global WebSocket. This machine and the VPS both run Node 20
// (v20.20.1, measured 2026-10-29), so this is needed, not optional — it is what the
// blog agent silently died on for sixteen days. `ws` is already a transitive
// dependency, so the shim installs nothing.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fall through to the real error */ }
}

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { UPLOAD_CACHE_CONTROL } = require('../src/imageUrl');

const BUCKET = 'app-images';
const WANT = `max-age=${UPLOAD_CACHE_CONTROL}`;
const SKIP_PREFIXES = ['chat-images/', 'voice-notes/'];

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const num = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const str = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const LIMIT = num('--limit', Infinity);
const PREFIX = str('--prefix');
const CONCURRENCY = Math.max(1, Math.min(6, num('--concurrency', 3)));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

async function listAll(db) {
  // storage.list() pages, and it returns folders as entries with a null id — the
  // bucket is two levels deep (folder/file), so walk it rather than assuming.
  const out = [];
  const walk = async (dir) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.storage.from(BUCKET)
        .list(dir, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error(`list ${dir || '/'}: ${error.message}`);
      if (!data || !data.length) return;
      for (const e of data) {
        const path = dir ? `${dir}/${e.name}` : e.name;
        if (e.id === null) await walk(path);          // a folder
        else out.push({ path, metadata: e.metadata || {} });
      }
      if (data.length < 100) return;
      offset += data.length;
    }
  };
  await walk(PREFIX ? PREFIX.replace(/\/$/, '') : '');
  return out;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — run with --env-file=.env');
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`bucket ${BUCKET}  target "${WANT}"  ${APPLY ? 'APPLY' : 'DRY RUN'}`
    + `${PREFIX ? `  prefix ${PREFIX}` : ''}${LIMIT !== Infinity ? `  limit ${LIMIT}` : ''}`);

  const all = await listAll(db);
  const skipped = all.filter((o) => !PREFIX && SKIP_PREFIXES.some((p) => o.path.startsWith(p)));
  // A matching database row is only a HINT that the header is right, never proof:
  // an `upsert` updates this column without changing what is served (see the note
  // in the worker below), so three objects reached exactly that state during this
  // script's own development — row correct, wire wrong, and skipped as done.
  // `--force` is the way out, and the only real check is the served header.
  const already = FORCE ? [] : all.filter((o) => (o.metadata.cacheControl || '') === WANT);
  const todo = all
    .filter((o) => !skipped.includes(o) && !already.includes(o))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`${all.length} objects: ${todo.length} to repair, ${already.length} already correct, `
    + `${skipped.length} excluded (${SKIP_PREFIXES.join(' ')})`);
  if (!todo.length) { console.log('nothing to do'); return; }

  const bytes = todo.reduce((n, o) => n + (Number(o.metadata.size) || 0), 0);
  console.log(`one-time cost: ~${(bytes / 1048576).toFixed(1)} MB download + the same uploaded back\n`);

  let done = 0; let failed = 0; let aborted = null;
  let i = 0;

  const worker = async () => {
    for (;;) {
      if (aborted) return;
      const idx = i; i += 1;
      if (idx >= todo.length) return;
      const o = todo[idx];
      const tag = `[${idx + 1}/${todo.length}] ${o.path}`;
      try {
        const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(o.path);
        if (dlErr) throw new Error(`download: ${dlErr.message}`);
        const before = Buffer.from(await blob.arrayBuffer());

        // Guard BEFORE writing: a truncated download re-uploaded as the whole file
        // would silently corrupt a live image, and nothing downstream would notice.
        const recorded = Number(o.metadata.size);
        if (recorded && before.length !== recorded) {
          throw new Error(`short download: got ${before.length} B, metadata says ${recorded} B`);
        }
        if (!before.length) throw new Error('empty download');
        const digest = sha(before);

        if (!APPLY) {
          console.log(`  would ${tag} — ${kb(before.length)}, `
            + `"${o.metadata.cacheControl || '(none)'}" -> "${WANT}"`);
          done += 1;
          continue;
        }

        // `update()`, NOT `upload(..., { upsert: true })`. Measured 2026-11-13: an
        // upsert writes the bytes and updates storage.objects.metadata, and the
        // served header DOES NOT CHANGE — a render request on a cache key nothing
        // had ever requested still came back max-age=3600 while the database row
        // read 31536000. `update()` on the same object changed both the raw and the
        // render response immediately. An upsert here therefore looks like a
        // complete success, records success in the database, and achieves nothing.
        const contentType = o.metadata.mimetype || blob.type || 'application/octet-stream';
        const { error: upErr } = await db.storage.from(BUCKET).update(o.path, before, {
          contentType, cacheControl: UPLOAD_CACHE_CONTROL,
        });
        if (upErr) throw new Error(`update: ${upErr.message}`);

        // Read it back and compare. "The upload returned no error" is not evidence
        // that the bytes on a user-facing image are still the bytes we read.
        const { data: after, error: reErr } = await db.storage.from(BUCKET).download(o.path);
        if (reErr) throw new Error(`verify download: ${reErr.message}`);
        const afterBuf = Buffer.from(await after.arrayBuffer());
        if (sha(afterBuf) !== digest) {
          aborted = `${o.path}: SHA-256 CHANGED (${before.length} B -> ${afterBuf.length} B). `
            + 'Run halted; this object may be damaged.';
          return;
        }
        console.log(`  ok    ${tag} — ${kb(before.length)}, bytes verified identical`);
        done += 1;
      } catch (e) {
        failed += 1;
        console.log(`  FAIL  ${tag} — ${e.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (aborted) {
    console.log(`\nABORTED: ${aborted}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${done} ${APPLY ? 'repaired' : 'would be repaired'}, ${failed} failed`);

  if (APPLY && done) {
    // The database column is a mirror, so the only honest check is the wire. A
    // novel width is a cache key nothing has requested, so the answer comes from
    // the origin rather than from an edge copy made before the repair.
    const probe = todo.find((o) => /\.(jpe?g|png|webp)$/i.test(o.path));
    if (probe) {
      const base = `${url}/storage/v1/render/image/public/${BUCKET}/${probe.path}`;
      const bust = 283 + (Date.now() % 11);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const r = await fetch(`${base}?width=${bust}&height=${bust}&resize=contain&quality=70`);
          const served = r.headers.get('cache-control');
          const cf = r.headers.get('cf-cache-status');
          console.log(`served header for ${probe.path}: "${served}" (cf: ${cf})`);
          if (served && served.includes('max-age=31536000')) console.log('VERIFIED on the wire.');
          else console.log('NOT yet visible on the wire — re-check, and note cf must not be HIT.');
          break;
        } catch (e) {
          if (attempt === 2) console.log(`could not reach storage to verify: ${e.message}`);
          else await new Promise((res) => setTimeout(res, 2000));
        }
      }
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
