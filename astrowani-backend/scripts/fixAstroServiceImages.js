// One-off fix for two broken astro_services card images:
// - "tarot": admin-uploaded image was AVIF, which React Native's <Image> on
//   Android does not reliably decode (works for a small file, silently blank
//   for a larger/more complex one) — re-encoded to JPEG and re-uploaded.
// - "pdf-report": had no admin-uploaded image at all (image: null), relying
//   on an external flaticon.com fallback URL — downloaded that same icon and
//   re-hosted it on our own Supabase storage instead, consistent with every
//   other row in the catalog.
require('dotenv').config();
const sharp = require('sharp');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'app-images';

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadJpeg(buffer, folder) {
  const filename = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpeg`;
  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

async function updateServiceImage(key, url) {
  const { error } = await supabase.from('astro_services').update({ image: url }).eq('key', key);
  if (error) throw error;
}

(async () => {
  // Tarot — convert AVIF to JPEG.
  const tarotAvifUrl = 'https://fxpoustnddrgumhwdcma.supabase.co/storage/v1/object/public/app-images/card-image/1786396688455-5edab6ce57a4.avif';
  const avifBuffer = await fetchBuffer(tarotAvifUrl);
  const tarotJpeg = await sharp(avifBuffer).jpeg({ quality: 85 }).toBuffer();
  const tarotUrl = await uploadJpeg(tarotJpeg, 'card-image');
  await updateServiceImage('tarot', tarotUrl);
  console.log('tarot ->', tarotUrl);

  // PDF Reports — had no image at all; re-host the existing fallback icon as our own.
  const pdfIconUrl = 'https://cdn-icons-png.flaticon.com/128/337/337946.png';
  const pngBuffer = await fetchBuffer(pdfIconUrl);
  const pdfJpeg = await sharp(pngBuffer).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  const pdfUrl = await uploadJpeg(pdfJpeg, 'card-image');
  await updateServiceImage('pdf-report', pdfUrl);
  console.log('pdf-report ->', pdfUrl);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
