// One-time (but safely rerunnable) migration: finds every astrologer row whose
// profile_pic_url column holds a raw base64 data-URI directly (instead of a Supabase
// Storage URL — legacy rows written before EditProfile.js switched to uploading via
// /api/upload-image), uploads that image to Storage (same "app-images" bucket +
// convention as src/uploadRoutes.js), and overwrites profile_pic_url with the new
// public URL so the heavy data is gone from the table for good.
//
// Note: there is no separate "profile_image" column on astrologers — profile_pic_url
// is the only column, and it is sometimes misused to hold base64 directly.
//
// Run with: node scripts/backfillAstrologerImages.js
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'app-images';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function parseDataUri(dataUri) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.split('/')[1].split('+')[0];
  return { mime, ext, buffer: Buffer.from(match[2], 'base64') };
}

async function main() {
  const { data: rows, error } = await db
    .from('astrologers')
    .select('id, first_name, last_name, profile_pic_url')
    .like('profile_pic_url', 'data:image/%');

  if (error) {
    console.error('Failed to fetch astrologers:', error.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} astrologer(s) with a base64 profile_pic_url that need migrating.`);

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.id;
    const parsed = parseDataUri(row.profile_pic_url);
    if (!parsed) {
      console.log(`[skip] ${label}: profile_pic_url is not a valid base64 data-URI`);
      continue;
    }
    try {
      const filename = `astrologer-profiles/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${parsed.ext}`;
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filename, parsed.buffer, { contentType: parsed.mime, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(filename);

      const { error: updateError } = await db
        .from('astrologers')
        .update({ profile_pic_url: publicUrlData.publicUrl })
        .eq('id', row.id);
      if (updateError) throw updateError;

      migrated += 1;
      console.log(`[ok] ${label}: ${publicUrlData.publicUrl}`);
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${label}:`, err.message);
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}.`);
}

main().then(() => process.exit(0));
