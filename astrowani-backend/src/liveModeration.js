// astrowani-backend/src/liveModeration.js
//
// Moderation for live stream comments (2026-09-16).
//
// Live comments are written by customers and shown to everyone in the stream, which
// makes them user-generated content under App Store Guideline 1.2 and Google Play's UGC
// policy. Both require: filtering objectionable material, a way to report it, a way to
// block abusive users, and the developer acting on reports. Before this, the socket
// relayed any comment from anyone, under any name the client chose.
//
// What lives here:
//   prepareLiveComment()  -- called by the live_comment socket handler in index.js:
//                            verified sender, real name from the database, length cap,
//                            word filter, rate limit, admin ban, astrologer block.
//   isSessionHost()       -- whether a socket identity owns the live session.
//   routes                -- report a comment (customer or astrologer app), and the
//                            admin review / ban endpoints.
//
// Blocking a commenter from ONE astrologer's streams reuses customer_blocks (the same
// block that already stops that customer calling or chatting them). An admin ban
// (live_comment_bans) silences a customer on every stream.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');
const customerModeration = require('./customerModeration');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAX_COMMENT_LENGTH = 200;
const MIN_MS_BETWEEN_COMMENTS = 1000;
const CACHE_MS = 60 * 1000;
const REASONS = ['abusive', 'harassment', 'sexual', 'hate', 'threat', 'spam', 'fraud', 'other'];

// ── Word filter ──────────────────────────────────────────────────────────────
// Deliberately small and conservative: common English and Hindi/Hinglish abuse.
// A matching word is masked (first letter kept), the rest of the comment still shows.
// Long entries match inside a word ("fucking"); short ones only as a whole word, so
// ordinary words that happen to contain them are left alone.
const BLOCKED_LONG = [
  'fuck', 'bitch', 'bastard', 'asshole', 'pussy', 'whore', 'nigger', 'nigga',
  'faggot', 'chutiya', 'chutiye', 'madarchod', 'maderchod', 'bhenchod', 'behenchod',
  'bhanchod', 'bhosdi', 'bhosdike', 'gandu', 'harami', 'kamina', 'lauda', 'lawda',
  'चूतिया', 'चुतिया', 'मादरचोद', 'भेनचोद', 'बहनचोद', 'भोसडी', 'गांडू', 'रंडी', 'हरामी', 'लौड़ा',
];
const BLOCKED_EXACT = ['shit', 'cunt', 'randi', 'dick', 'slut', 'lund', 'chut', 'bsdk', 'mc', 'bc', 'mkc', 'tmkc'];

function maskWord(token) {
  const chars = Array.from(token);
  return chars[0] + '*'.repeat(Math.max(chars.length - 1, 2));
}

function filterComment(text) {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      const bare = token.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
      if (!bare) return token;
      if (BLOCKED_EXACT.includes(bare) || BLOCKED_LONG.some((w) => bare.includes(w))) {
        return maskWord(token);
      }
      return token;
    })
    .join('');
}

// ── Small TTL caches (comments arrive fast; these values rarely change) ─────
function ttlCache() {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit || hit.expires < Date.now()) { map.delete(key); return undefined; }
      return hit.value;
    },
    set(key, value) {
      map.set(key, { value, expires: Date.now() + CACHE_MS });
      if (map.size > 5000) map.delete(map.keys().next().value);
    },
    delete(key) { map.delete(key); },
  };
}
const hostCache = ttlCache();
const identityCache = ttlCache();
const banCache = ttlCache();
const lastCommentAt = new Map();

/**
 * Verified identity from a JWT: { kind: 'customer'|'astrologer', id, name } or null.
 */
async function identityFromToken(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(String(token).replace(/^Bearer\s+/i, ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  const cacheKey = String(token).slice(-40);
  const cached = identityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let identity = null;
  if (decoded.astroId || decoded.vendorId || decoded.role === 'astrologer') {
    const id = decoded.astroId || decoded.vendorId || decoded.id;
    if (id) {
      const { data } = await db
        .from('astrologers').select('id, first_name, last_name, phone_number').eq('id', id).maybeSingle();
      if (data && !String(data.phone_number || '').startsWith('deleted:')) {
        identity = {
          kind: 'astrologer',
          id: data.id,
          name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Astrologer',
        };
      }
    }
  } else {
    let row = null;
    if (decoded.phone) row = await findCustomerByPhone(db, decoded.phone, 'id, name, mobile');
    if (!row && (decoded.userId || decoded.id)) {
      row = await findCustomerById(db, decoded.userId || decoded.id, 'id, name, mobile');
    }
    if (row && !String(row.mobile || '').startsWith('deleted:')) {
      identity = { kind: 'customer', id: row.id, name: String(row.name || '').trim() || null };
    }
  }
  identityCache.set(cacheKey, identity);
  return identity;
}

async function sessionHostId(sessionId) {
  const cached = hostCache.get(sessionId);
  if (cached !== undefined) return cached;
  const { data } = await db.from('live_sessions').select('astrologer_id').eq('id', sessionId).maybeSingle();
  const host = data?.astrologer_id || null;
  hostCache.set(sessionId, host);
  return host;
}

async function isBanned(customerId) {
  const cached = banCache.get(customerId);
  if (cached !== undefined) return cached;
  const { data, error } = await db
    .from('live_comment_bans').select('customer_id').eq('customer_id', customerId).maybeSingle();
  // Fails OPEN on a read error: one flaky read must not silence every viewer.
  const banned = !error && !!data;
  banCache.set(customerId, banned);
  return banned;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns a raw live_comment socket payload into the comment everyone should see,
 * or null when it must be dropped. Never throws.
 *
 * `socketKey` identifies the sending socket for the rate limit.
 */
async function prepareLiveComment({ token, socketKey, data }) {
  try {
    const sessionId = data && data.sessionId ? String(data.sessionId) : '';
    if (!UUID_RE.test(sessionId)) return null;

    const raw = String((data && data.message) || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    const sender = await identityFromToken(token);
    // Signed-in users only: an anonymous comment can be neither reported to a
    // person nor blocked.
    if (!sender) return null;

    const now = Date.now();
    if (now - (lastCommentAt.get(socketKey) || 0) < MIN_MS_BETWEEN_COMMENTS) return null;
    lastCommentAt.set(socketKey, now);
    if (lastCommentAt.size > 10000) lastCommentAt.delete(lastCommentAt.keys().next().value);

    const hostId = await sessionHostId(sessionId);
    if (!hostId) return null;

    if (sender.kind === 'customer') {
      if (await isBanned(sender.id)) return null;
      if (await customerModeration.isBlocked(hostId, sender.id)) return null;
    } else if (sender.id !== hostId) {
      // Astrologers only comment on their own stream.
      return null;
    }

    return {
      sessionId,
      commentId: require('crypto').randomUUID(),
      senderId: sender.id,
      senderKind: sender.kind,
      isHost: sender.id === hostId,
      name: sender.name ? filterComment(sender.name) : null,
      message: filterComment(Array.from(raw).slice(0, MAX_COMMENT_LENGTH).join('')),
      createdAt: new Date(now).toISOString(),
    };
  } catch (e) {
    console.error('[live-moderation] prepare comment failed:', e.message);
    return null;
  }
}

/** True when the token belongs to the astrologer hosting this live session. */
async function isSessionHost(token, sessionId) {
  try {
    if (!UUID_RE.test(String(sessionId || ''))) return false;
    const who = await identityFromToken(token);
    if (!who || who.kind !== 'astrologer') return false;
    return (await sessionHostId(String(sessionId))) === who.id;
  } catch (_) {
    return false;
  }
}

function registerLiveModerationRoutes(app) {
  const { requireAdmin } = require('./adminRoutes');

  /**
   * Report one live comment. Works from both apps; the reporter comes from the JWT.
   * Body: { sessionId, senderId, message, reason, note }
   */
  app.post('/api/live/comments/report', async (req, res) => {
    try {
      const reporter = await identityFromToken(req.headers.authorization);
      if (!reporter) return res.status(401).json({ success: false, message: 'Please log in.' });

      const { sessionId, senderId, message, reason, note } = req.body || {};
      if (!UUID_RE.test(String(sessionId || '')) || !UUID_RE.test(String(senderId || ''))) {
        return res.status(400).json({ success: false, message: 'sessionId and senderId are required' });
      }
      if (!REASONS.includes(reason)) {
        return res.status(400).json({ success: false, message: 'Please choose a reason.' });
      }
      if (senderId === reporter.id) {
        return res.status(400).json({ success: false, message: 'You cannot report your own comment.' });
      }

      const hostId = await sessionHostId(String(sessionId));
      const { error } = await db.from('live_comment_reports').insert({
        session_id: String(sessionId),
        astrologer_id: hostId,
        reported_customer_id: senderId,
        reporter_customer_id: reporter.kind === 'customer' ? reporter.id : null,
        reporter_astrologer_id: reporter.kind === 'astrologer' ? reporter.id : null,
        comment_text: String(message || '').slice(0, 500) || null,
        reason,
        note: note ? String(note).slice(0, 1000) : null,
      });
      // 23503: the reported id is not a customer (e.g. the host's own comment).
      if (error && error.code === '23503') {
        return res.status(400).json({ success: false, message: 'This comment cannot be reported.' });
      }
      if (error) throw error;
      return res.json({ success: true, message: 'Report submitted' });
    } catch (e) {
      console.error('[live-moderation] report failed:', e.message);
      return res.status(500).json({ success: false, message: 'Could not submit the report. Please try again.' });
    }
  });

  // ── Admin ──────────────────────────────────────────────────────────────────
  app.get('/api/admin/live-comment-reports', requireAdmin, async (req, res) => {
    try {
      const { data, error } = await db
        .from('live_comment_reports')
        .select(`*,
          reported:customers!live_comment_reports_reported_customer_id_fkey(id, name, mobile),
          reporter_customer:customers!live_comment_reports_reporter_customer_id_fkey(name, mobile),
          reporter_astrologer:astrologers!live_comment_reports_reporter_astrologer_id_fkey(first_name, last_name),
          host:astrologers!live_comment_reports_astrologer_id_fkey(first_name, last_name)`)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const { data: bans } = await db.from('live_comment_bans').select('customer_id');
      const banned = new Set((bans || []).map((b) => b.customer_id));
      return res.json({
        success: true,
        data: (data || []).map((r) => ({ ...r, reported_is_banned: banned.has(r.reported_customer_id) })),
      });
    } catch (e) {
      console.error('[live-moderation] admin list failed:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to load reports' });
    }
  });

  app.patch('/api/admin/live-comment-reports/:id', requireAdmin, async (req, res) => {
    try {
      const { status, admin_note: adminNote } = req.body || {};
      if (!['pending', 'reviewed', 'actioned'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      const { error } = await db.from('live_comment_reports').update({
        status,
        admin_note: adminNote ? String(adminNote).slice(0, 1000) : null,
        reviewed_at: status === 'pending' ? null : new Date().toISOString(),
      }).eq('id', req.params.id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (e) {
      console.error('[live-moderation] admin update failed:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to update report' });
    }
  });

  app.post('/api/admin/live-comment-bans', requireAdmin, async (req, res) => {
    try {
      const { customerId, reason } = req.body || {};
      if (!UUID_RE.test(String(customerId || ''))) {
        return res.status(400).json({ success: false, message: 'customerId is required' });
      }
      const { error } = await db.from('live_comment_bans').upsert({
        customer_id: customerId,
        reason: reason ? String(reason).slice(0, 500) : null,
        created_by: req.admin?.email || 'admin',
      });
      if (error) throw error;
      banCache.delete(customerId);
      return res.json({ success: true });
    } catch (e) {
      console.error('[live-moderation] ban failed:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to ban' });
    }
  });

  app.delete('/api/admin/live-comment-bans/:customerId', requireAdmin, async (req, res) => {
    try {
      const { error } = await db.from('live_comment_bans').delete().eq('customer_id', req.params.customerId);
      if (error) throw error;
      banCache.delete(req.params.customerId);
      return res.json({ success: true });
    } catch (e) {
      console.error('[live-moderation] unban failed:', e.message);
      return res.status(500).json({ success: false, message: 'Failed to remove ban' });
    }
  });
}

module.exports = {
  registerLiveModerationRoutes,
  prepareLiveComment,
  isSessionHost,
  filterComment,
};
