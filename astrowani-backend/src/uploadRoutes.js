// ─────────────────────────────────────────────────────────────────────────────
// Image upload — accepts a base64 data-URI, stores it in Supabase Storage
// ("app-images" bucket), and returns a public URL. Used by the admin dashboard
// and the customer/vendor apps so images are never embedded as base64 in
// database rows or API responses (which was bloating payloads and slowing
// down the single-worker backend).
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O'
);

const BUCKET = 'app-images';

// Self-hosted background-removal service (see bg-removal-service/) — NOT a third-party
// API, runs on the same VPS, reachable only on localhost. Applied ONLY to the
// astrologer-profiles folder, ONLY for images, ONCE per profile-photo save — never
// per-frame, never on video. If the service is down or errors, we fall back to the
// original photo rather than blocking the save (see whitenAstrologerProfilePhoto below).
const BG_REMOVAL_URL = process.env.BG_REMOVAL_URL || 'http://127.0.0.1:5001';
const BG_REMOVAL_TIMEOUT_MS = 15000;

async function whitenAstrologerProfilePhoto(buffer, mime) {
  if (!mime.startsWith('image/')) return buffer;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BG_REMOVAL_TIMEOUT_MS);
    const resp = await fetch(`${BG_REMOVAL_URL}/remove-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: buffer.toString('base64') }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`bg-removal service returned ${resp.status}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.message || 'bg-removal service reported failure');
    return { buffer: Buffer.from(data.image_base64, 'base64'), ext: 'jpg', mime: 'image/jpeg' };
  } catch (e) {
    console.error('[upload-image] background removal skipped, using original photo:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Downscale + re-encode on upload.
//
// Nothing on this path had ever resized anything, so every image was stored at
// whatever resolution the admin exported or the phone's camera produced. On
// 2026-10-19 that blew the Supabase free-tier egress quota (6.25 GB against a
// 5.5 GB cap, every API request dropped until the cycle refilled): the live
// bucket held three PNGs at 2.1 MB, a 1.23 MB service card and a 1.05 MB
// customer selfie, and the shared screens re-served them to every user. See
// src/imageUrl.js for the full measurement.
//
// src/imageUrl.js fixes DELIVERY by serving transformed variants. This fixes the
// SOURCE, and both are worth having: the render endpoint still pays full origin
// cost on its first miss for each size, a few surfaces (and every already-stored
// absolute URL) still link originals, and a 2 MB upload is 2 MB of stored space
// whatever is done downstream.
// ─────────────────────────────────────────────────────────────────────────────

// Longest-edge cap, by folder. Generous on purpose — this is the SOURCE the
// render endpoint resizes from, not what a screen displays, so it only has to be
// big enough that no surface ever wants more. Anything already smaller is left
// at its own size (`withoutEnlargement`), so a 64px icon is never blown up.
const MAX_EDGE_BY_FOLDER = {
  'astrologer-profiles': 1024,
  'customer-profiles': 1024,
  'profile-photo': 1024,
  'persona-photo': 1024,
  'customer-hands': 1024,
};
const MAX_EDGE_DEFAULT = 1600; // banners, cards, section/icon artwork, blog thumbnails

function maxEdgeFor(folder) {
  // Folder names are truncated by the admin dashboard's field-name-derived values
  // ("profile-photo-url-or", "banner-image-url-or-"), so match on prefix rather
  // than equality or a lookup miss would silently fall through to the default.
  const hit = Object.keys(MAX_EDGE_BY_FOLDER).find((k) => folder.startsWith(k));
  return hit ? MAX_EDGE_BY_FOLDER[hit] : MAX_EDGE_DEFAULT;
}

/**
 * Returns {buffer, ext, mime} with the image downscaled and re-encoded, or null
 * to keep the caller's own buffer. Never throws — a failure here must not cost
 * someone their upload, it just stores the original.
 */
async function downscaleImage(buffer, mime, folder) {
  // Only still raster formats sharp can round-trip safely. Audio (voice notes
  // share this route) is excluded by the mime test, and so are SVG — rasterising
  // a vector logo is a downgrade, not an optimisation — and GIF, which would lose
  // its animation unless decoded with {animated:true}.
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
  try {
    const cap = maxEdgeFor(folder);
    const meta = await sharp(buffer).metadata();

    // .rotate() with no argument applies the EXIF orientation tag. It is REQUIRED
    // and must come before resize: sharp strips metadata on re-encode, so a photo
    // whose uprightness lived in that tag would otherwise be stored sideways —
    // which is exactly how phone-camera portraits arrive.
    let pipeline = sharp(buffer).rotate();
    if ((meta.width || 0) > cap || (meta.height || 0) > cap) {
      pipeline = pipeline.resize({ width: cap, height: cap, fit: 'inside', withoutEnlargement: true });
    }

    // Transparency decides the output format. A photo re-encodes to JPEG, which is
    // where the whole saving is; anything with an alpha channel (logos, icons,
    // background-removed artwork) stays PNG so transparency survives.
    //
    // WebP would beat PNG for an alpha-carrying photo, but CLAUDE.md records
    // admin-uploaded images rendering as a silent blank on some devices after a
    // format change (the AVIF tarot card), so this deliberately introduces no new
    // format on a path with no device coverage.
    const out = meta.hasAlpha
      ? { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png', mime: 'image/png' }
      : { buffer: await pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer(), ext: 'jpeg', mime: 'image/jpeg' };

    // Re-encoding can enlarge an already-optimised file (a crushed PNG, a
    // low-quality JPEG). Keeping whichever is smaller means this can only ever
    // help, so it is safe to leave on for every folder.
    if (out.buffer.length >= buffer.length) return null;
    console.log(`[upload-image] ${folder}: ${(buffer.length / 1024).toFixed(0)} KB -> ${(out.buffer.length / 1024).toFixed(0)} KB`);
    return out;
  } catch (e) {
    console.error('[upload-image] downscale skipped, storing original:', e.message);
    return null;
  }
}

function requireAnyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
  try {
    jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function parseDataUri(dataUri) {
  // Also accepts audio/* — reused by voice notes (POST /api/vendor/voice-notes) so both
  // features share one upload path into Supabase Storage rather than duplicating it.
  const match = /^data:((?:image|audio)\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null;
  const mime = match[1];
  const ext = mime.split('/')[1].split('+')[0];
  return { mime, ext, buffer: Buffer.from(match[2], 'base64') };
}

module.exports = function registerUploadRoutes(app) {
  app.post('/api/upload-image', requireAnyAuth, async (req, res) => {
    try {
      const { base64, folder } = req.body || {};
      if (!base64) {
        return res.status(400).json({ success: false, message: 'base64 is required' });
      }
      // Already a URL (not a data-URI) — nothing to do, pass it through.
      if (!base64.startsWith('data:')) {
        return res.status(200).json({ success: true, url: base64 });
      }
      const parsed = parseDataUri(base64);
      if (!parsed) {
        return res.status(400).json({ success: false, message: 'Invalid base64 data (expected image/* or audio/*)' });
      }
      const safeFolder = (folder || 'misc').replace(/[^a-z0-9_-]/gi, '');
      let { buffer: outBuffer, ext: outExt, mime: outMime } = { buffer: parsed.buffer, ext: parsed.ext, mime: parsed.mime };

      // AVIF/HEIC decode support is inconsistent across Android/iOS versions and
      // devices — React Native's <Image> can render one such file fine and show a
      // silent blank for another (seen with an admin-uploaded tarot card image:
      // small AVIF worked, larger one didn't). Normalize to JPEG at upload time so
      // this can never happen again, regardless of what format was picked.
      if (['image/avif', 'image/heic', 'image/heif'].includes(outMime)) {
        try {
          outBuffer = await sharp(outBuffer).jpeg({ quality: 85 }).toBuffer();
          outExt = 'jpeg';
          outMime = 'image/jpeg';
        } catch (e) {
          console.error('[upload-image] AVIF/HEIC-to-JPEG conversion failed, uploading original:', e.message);
        }
      }

      if (safeFolder === 'astrologer-profiles') {
        const whitened = await whitenAstrologerProfilePhoto(parsed.buffer, parsed.mime);
        if (whitened) ({ buffer: outBuffer, ext: outExt, mime: outMime } = whitened);
      }

      // Last, so it caps whatever the steps above produced (converted AVIF, or a
      // background-removed profile photo) rather than being undone by them.
      const smaller = await downscaleImage(outBuffer, outMime, safeFolder);
      if (smaller) ({ buffer: outBuffer, ext: outExt, mime: outMime } = smaller);

      const filename = `${safeFolder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${outExt}`;

      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(filename, outBuffer, { contentType: outMime, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = db.storage.from(BUCKET).getPublicUrl(filename);
      return res.status(200).json({ success: true, url: publicUrlData.publicUrl });
    } catch (err) {
      console.error('[upload-image] error:', err.message);
      return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
  });
};
