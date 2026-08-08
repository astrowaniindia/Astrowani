// ─────────────────────────────────────────────────────────────────────────────
// Image upload — accepts a base64 data-URI, stores it in Supabase Storage
// ("app-images" bucket), and returns a public URL. Used by the admin dashboard
// and the customer/vendor apps so images are never embedded as base64 in
// database rows or API responses (which was bloating payloads and slowing
// down the single-worker backend).
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

      if (safeFolder === 'astrologer-profiles') {
        const whitened = await whitenAstrologerProfilePhoto(parsed.buffer, parsed.mime);
        if (whitened) ({ buffer: outBuffer, ext: outExt, mime: outMime } = whitened);
      }

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
