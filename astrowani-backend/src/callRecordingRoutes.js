// astrowani-backend/src/callRecordingRoutes.js
//
// Call audio recording, server side. Each phone records ITS OWN microphone and uploads
// the file directly to private object storage; this module authorises the upload,
// transcribes the audio, checks the words for contact details (same detector as chat)
// and raises a session_flags row when a number is spoken.
//
//   POST /api/call-recordings/start           -> {enabled:false} or {recordingId, uploadUrl, ...}
//   POST /api/call-recordings/:id/complete    -> phone says the upload finished; transcription runs
//   GET  /api/admin/call-recordings/status    -> is it switched on / is storage configured
//   GET  /api/admin/call-recordings/:id/audio -> short-lived playback URL (admin only)
//
// SAFE BY DEFAULT: nothing is issued unless app_settings.call_recording_enabled = 'true'
// AND storage is configured. Every "off" answer is HTTP 200 {enabled:false}, so an app
// treats it as "do not record" rather than as an error.
//
// A phone can only start a recording for a session it is actually a participant of, and can
// only complete its own recording -- identity always comes from the verified token.

const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const storage = require('./objectStorage');
const { analyze } = require('./contactLeakDetector');
const { findCustomerByPhone } = require('./customerLookup');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const MAX_BYTES = 40 * 1024 * 1024;            // hard ceiling on one recording
const MAX_INLINE_TRANSCRIBE_BYTES = 18 * 1024 * 1024; // Gemini inline-audio request limit is 20 MB total
const UPLOAD_URL_SECONDS = 900;
const TRANSCRIBE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));

let settingCache = { at: 0, enabled: false };
async function recordingEnabled() {
  if (Date.now() - settingCache.at < 30000) return settingCache.enabled;
  let enabled = false;
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'call_recording_enabled').maybeSingle();
    enabled = String(data?.value ?? '').replace(/"/g, '') === 'true';
  } catch (_) { enabled = false; }
  settingCache = { at: Date.now(), enabled };
  return enabled;
}

/** { role, id } from the Bearer token, or null. */
async function identify(req) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return null;
  let d;
  try { d = jwt.verify(token, process.env.JWT_SECRET); } catch (_) { return null; }
  if (d.astroId || d.vendorId || d.role === 'astrologer' || d.role === 'vendor') {
    const id = d.astroId || d.vendorId || d.userId || d.id;
    return id ? { role: 'astrologer', id: String(id) } : null;
  }
  let id = d.userId || d.id;
  if (d.phone) {
    const row = await findCustomerByPhone(db, d.phone, 'id');
    if (row) id = row.id;
  }
  return id ? { role: 'customer', id: String(id) } : null;
}

// ── Transcription ──────────────────────────────────────────────────────────────
function geminiKeys() {
  const ks = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_CONSULT || process.env.GEMINI_API_KEY_PAID,
    process.env.GEMINI_API_KEY_PRODUCT || process.env.GEMINI_API_KEY_3];
  return ks.filter(Boolean);
}

const TRANSCRIBE_PROMPT =
  'Transcribe this phone call audio exactly as spoken. The speaker may use Hindi, English or a mix; ' +
  'keep the original language and script (Hindi in Devanagari or Roman, as spoken). ' +
  'Write every spoken digit or number as digits (for example "nine eight seven" -> "987"). ' +
  'Output ONLY the transcript text, with no commentary. If there is no speech, output exactly: [no speech]';

async function transcribe(buffer, mime) {
  const keys = geminiKeys();
  if (!keys.length) throw new Error('no Gemini key configured');
  const body = {
    contents: [{ parts: [{ text: TRANSCRIBE_PROMPT }, { inline_data: { mime_type: mime, data: buffer.toString('base64') } }] }],
    generationConfig: { temperature: 0 },
  };
  let lastErr = null;
  for (const model of TRANSCRIBE_MODELS) {
    for (const key of keys) {
      try {
        const r = await axios.post(`${GEMINI_BASE}/${model}:generateContent`, body, {
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          timeout: 120000,
          maxBodyLength: Infinity,
        });
        const text = (r.data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (text) return { text, model };
        lastErr = new Error('empty transcript');
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('transcription failed');
}

/** Sentences of a transcript that trip the detector, joined for the flag excerpt. */
function flaggedSentences(transcript) {
  const parts = transcript.split(/(?<=[.!?।\n])\s+/).filter((s) => s.trim());
  const hit = parts.filter((s) => analyze(s).flagged);
  return hit.length ? hit.join(' … ') : null;
}

async function processRecording(row) {
  try {
    if (!row.storage_key) throw new Error('no storage key');
    const buf = await storage.getBuffer(row.storage_key);
    if (buf.length > MAX_INLINE_TRANSCRIBE_BYTES) {
      await db.from('call_recordings').update({ status: 'too_large', error: 'too large to transcribe inline' }).eq('id', row.id);
      return;
    }
    const { text, model } = await transcribe(buf, row.mime || 'audio/aac');
    const whole = analyze(text);
    const update = { status: 'transcribed', transcript: text, transcript_model: model, flagged: whole.flagged, error: null };
    await db.from('call_recordings').update(update).eq('id', row.id);

    if (whole.flagged) {
      const { error } = await db.from('session_flags').insert([{
        source: 'call',
        session_id: row.session_id,
        message_id: row.id,
        sender_role: row.role,
        astrologer_id: row.astrologer_id,
        customer_id: row.customer_id,
        severity: whole.severity,
        kinds: whole.kinds,
        excerpt: (flaggedSentences(text) || text).slice(0, 500),
      }]);
      if (error && String(error.code) !== '23505') console.error('[call-recordings] flag insert failed:', error.message);
    }
  } catch (e) {
    console.error('[call-recordings] processing failed:', e.message);
    await db.from('call_recordings').update({ status: 'failed', error: String(e.message).slice(0, 300) }).eq('id', row.id);
  }
}

// ── Retention ──────────────────────────────────────────────────────────────────
async function purgeExpired() {
  try {
    const { data } = await db.from('call_recordings')
      .select('id, storage_key').not('storage_key', 'is', null)
      .lt('expires_at', new Date().toISOString()).limit(200);
    for (const r of data || []) {
      try {
        await storage.remove(r.storage_key);
        // Retention applies to the audio AND its transcript (90 days by default). What a
        // flag quoted (session_flags.excerpt) stays as the record of the violation itself.
        await db.from('call_recordings').update({ storage_key: null, transcript: null }).eq('id', r.id);
      } catch (e) { console.error('[call-recordings] purge failed for', r.id, e.message); }
    }
  } catch (_) { /* table missing or transient -- try again next hour */ }
}

module.exports = function registerCallRecordingRoutes(app) {
  const { requireAdmin } = require('./adminRoutes');
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[call-recordings]', e.message);
    res.status(500).json({ success: false, message: 'Request failed' });
  });

  const timer = setInterval(purgeExpired, 60 * 60 * 1000);
  if (timer.unref) timer.unref();

  app.post('/api/call-recordings/start', h(async (req, res) => {
    const who = await identify(req);
    if (!who) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { sessionId, callType } = req.body || {};
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    if (!storage.isConfigured() || !(await recordingEnabled())) {
      return res.json({ success: true, enabled: false });
    }

    const { data: sess } = await db.from('chat_sessions')
      .select('id, caller_id, vendor_id').eq('id', sessionId).maybeSingle();
    const mine = who.role === 'astrologer' ? sess?.vendor_id : sess?.caller_id;
    if (!sess || String(mine) !== who.id) {
      return res.status(403).json({ success: false, message: 'Not a participant of this session' });
    }

    const key = `calls/${sessionId}/${who.role}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.aac`;
    const { data: row, error } = await db.from('call_recordings').insert([{
      session_id: String(sessionId),
      call_type: callType || null,
      role: who.role,
      astrologer_id: sess.vendor_id,
      customer_id: sess.caller_id,
      storage_key: key,
      mime: 'audio/aac',
    }]).select('id').single();
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, enabled: false });
      throw error;
    }
    const uploadUrl = await storage.presignPut(key, UPLOAD_URL_SECONDS);
    return res.json({ success: true, enabled: true, recordingId: row.id, uploadUrl, contentType: 'audio/aac', maxBytes: MAX_BYTES });
  }));

  app.post('/api/call-recordings/:id/complete', h(async (req, res) => {
    const who = await identify(req);
    if (!who) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { data: row } = await db.from('call_recordings').select('*').eq('id', req.params.id).maybeSingle();
    const owner = row && (who.role === 'astrologer' ? row.astrologer_id : row.customer_id);
    if (!row || row.role !== who.role || String(owner) !== who.id) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (row.status !== 'pending_upload') return res.json({ success: true, alreadyProcessed: true });

    const info = await storage.head(row.storage_key);
    if (!info.exists || info.bytes <= 0 || info.bytes > MAX_BYTES) {
      await db.from('call_recordings').update({ status: 'failed', error: 'upload missing or out of range' }).eq('id', row.id);
      return res.status(400).json({ success: false, message: 'Upload not found' });
    }
    const durationMs = Math.max(0, Math.min(Number(req.body?.durationMs) || 0, 6 * 3600 * 1000));
    const { data: updated } = await db.from('call_recordings')
      .update({ status: 'uploaded', bytes: info.bytes, duration_ms: durationMs, uploaded_at: new Date().toISOString() })
      .eq('id', row.id).eq('status', 'pending_upload').select('*').maybeSingle();
    res.json({ success: true });
    // After the response: the phone does not wait for transcription.
    if (updated) processRecording(updated);
  }));

  app.get('/api/admin/call-recordings/status', requireAdmin, h(async (req, res) => {
    return res.json({
      success: true,
      storageConfigured: storage.isConfigured(),
      enabled: await recordingEnabled(),
      transcriptionKey: geminiKeys().length > 0,
    });
  }));

  // Short-lived playback link. Read-only, admin only; the bucket itself stays private.
  app.get('/api/admin/call-recordings/:id/audio', requireAdmin, h(async (req, res) => {
    const { data: row } = await db.from('call_recordings').select('storage_key').eq('id', req.params.id).maybeSingle();
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    if (!row.storage_key) return res.status(410).json({ success: false, message: 'Recording was deleted (retention expired)' });
    return res.json({ success: true, url: await storage.presignGet(row.storage_key, 600) });
  }));
};

module.exports.processRecording = processRecording;
module.exports.flaggedSentences = flaggedSentences;
module.exports.purgeExpired = purgeExpired;
