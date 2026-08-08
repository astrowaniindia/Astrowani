// One-time (safely rerunnable) migration: runs every EXISTING astrologer profile photo
// through the same background-removal step new uploads get (see bg-removal-service/ and
// src/uploadRoutes.js), and overwrites profile_pic_url with the whitened version.
//
// Does NOT delete the original file from Storage — only the DB pointer changes, so the
// original photo is still sitting in the "app-images" bucket if anything needs undoing.
// Skips rows already processed in a prior run (tracked via profile_pic_url containing the
// "/astrologer-profiles/" + a marker query param) so it is safe to re-run after failures.
//
// Requires the background-removal service reachable at BG_REMOVAL_URL (default
// http://127.0.0.1:5001) — start it locally with bg-removal-service/venv, or run this
// script on the VPS where it runs under PM2.
//
// Usage:
//   node scripts/backfillWhitenAstrologerPhotos.js --dry-run       (preview only, no writes)
//   node scripts/backfillWhitenAstrologerPhotos.js --limit 3       (process only the first 3)
//   node scripts/backfillWhitenAstrologerPhotos.js                 (process everyone)
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BG_REMOVAL_URL = process.env.BG_REMOVAL_URL || 'http://127.0.0.1:5001';
const BUCKET = 'app-images';
const WHITENED_MARKER = 'whitened=1';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function parseDataUri(dataUri) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function getImageBytes(profilePicUrl) {
  if (profilePicUrl.startsWith('data:')) {
    const parsed = parseDataUri(profilePicUrl);
    if (!parsed) throw new Error('unparseable base64 data-URI');
    return parsed.buffer;
  }
  const resp = await fetch(profilePicUrl);
  if (!resp.ok) throw new Error(`could not download existing photo (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

async function whiten(buffer) {
  const resp = await fetch(`${BG_REMOVAL_URL}/remove-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: buffer.toString('base64') }),
  });
  if (!resp.ok) throw new Error(`bg-removal service returned ${resp.status}`);
  const data = await resp.json();
  if (!data.success) throw new Error(data.message || 'bg-removal service reported failure');
  return Buffer.from(data.image_base64, 'base64');
}

async function main() {
  const health = await fetch(`${BG_REMOVAL_URL}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Background-removal service not reachable at ${BG_REMOVAL_URL} — start it first.`);
    process.exit(1);
  }

  const { data: rows, error } = await db
    .from('astrologers')
    .select('id, first_name, last_name, profile_pic_url')
    .not('profile_pic_url', 'is', null)
    .not('profile_pic_url', 'like', `%${WHITENED_MARKER}%`); // skip already-whitened rows
  if (error) {
    console.error('Failed to fetch astrologers:', error.message);
    process.exit(1);
  }

  const targets = rows.slice(0, LIMIT);
  console.log(`Found ${rows.length} astrologer(s) with an unwhitened photo. Processing ${targets.length}.${DRY_RUN ? ' (DRY RUN — no writes)' : ''}\n`);

  let done = 0, failed = 0;
  for (const row of targets) {
    const label = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.id;
    try {
      const original = await getImageBytes(row.profile_pic_url);
      const whitened = await whiten(original);

      if (DRY_RUN) {
        console.log(`[dry-run] ${label}: would whiten (${original.length} -> ${whitened.length} bytes)`);
        done += 1;
        continue;
      }

      const filename = `astrologer-profiles/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filename, whitened, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(filename);
      const newUrl = `${publicUrlData.publicUrl}?${WHITENED_MARKER}`;

      const { error: updateError } = await db
        .from('astrologers').update({ profile_pic_url: newUrl }).eq('id', row.id);
      if (updateError) throw updateError;

      done += 1;
      console.log(`[ok] ${label}: ${newUrl}`);
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${label}: ${err.message}`);
    }
  }

  console.log(`\nDone. Whitened: ${done}, Failed: ${failed}, Skipped (already done): ${rows.length - targets.length}.`);
}

main().then(() => process.exit(0));
