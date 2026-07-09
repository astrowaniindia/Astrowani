// One-off migration: find rows whose image column holds a base64 data-URI and
// replace it with a Supabase Storage URL. Safe to re-run — skips rows that
// already hold a URL (anything not starting with "data:").
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'app-images';

function parseDataUri(dataUri) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.split('/')[1].split('+')[0];
  return { mime, ext, buffer: Buffer.from(match[2], 'base64') };
}

async function uploadDataUri(dataUri, folder) {
  const parsed = parseDataUri(dataUri);
  if (!parsed) return null;
  const filename = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${parsed.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, parsed.buffer, { contentType: parsed.mime, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function migrateTable(table, column, folder, idColumn = 'id') {
  const { data: rows, error } = await supabase.from(table).select(`${idColumn}, ${column}`);
  if (error) { console.error(`[${table}] select error:`, error.message); return; }

  let migrated = 0;
  for (const row of rows || []) {
    const value = row[column];
    if (!value || typeof value !== 'string' || !value.startsWith('data:')) continue;
    try {
      const url = await uploadDataUri(value, folder);
      if (!url) continue;
      const { error: updateError } = await supabase
        .from(table)
        .update({ [column]: url })
        .eq(idColumn, row[idColumn]);
      if (updateError) throw updateError;
      migrated++;
      console.log(`[${table}.${column}] migrated row ${row[idColumn]} -> ${url}`);
    } catch (err) {
      console.error(`[${table}.${column}] row ${row[idColumn]} failed:`, err.message);
    }
  }
  console.log(`[${table}.${column}] done — ${migrated}/${(rows || []).length} rows migrated`);
}

(async () => {
  await migrateTable('categories', 'image', 'categories');
  await migrateTable('banners', 'image', 'banners');
  await migrateTable('blogs', 'thumbnail', 'blogs');
  await migrateTable('remedy_items', 'image', 'remedies');
  await migrateTable('astrologers', 'profile_pic_url', 'astrologer-profiles');
  await migrateTable('customers', 'profile_image', 'customer-profiles');
  await migrateTable('customers', 'hand_image', 'customer-hands');
  console.log('Migration complete.');
})();
