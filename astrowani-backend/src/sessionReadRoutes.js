// Reads of chat_sessions / chat_requests that used to happen straight from the apps
// on the public anon key.
//
// WHY THIS MODULE EXISTS. Those two tables are the last pair in `public` with RLS off
// and an anon SELECT grant (Supabase advisory rls_disabled_in_public, still 2 findings
// on 2026-10-20). Between them, anyone holding the key that ships inside both APKs can
// download who consulted which astrologer, when, for how long and at what rate, with
// caller_name attached -- 82 real names at the time of writing. There is no WRITE
// exposure (anon has SELECT only, authenticated has nothing, since hardening_15/17), so
// this is a read leak, not a data-loss risk, whatever the advisory email says.
//
// RLS cannot simply be switched on: the apps do not use Supabase Auth, they use our own
// Express JWT, so auth.uid() is NULL and every policy evaluates to deny-everyone. The
// documented pattern (BU/BV/BW, then the availability/fcm-token/notifications trio) is
// endpoint first, migrate the app reads, OTA, wait for adoption, revoke last. This file
// is the first step and is purely ADDITIVE -- nothing is revoked here, and every route
// answers with the same shape the app was already computing for itself.
//
// Each route also does the per-row joins the screens used to do client-side (astrologer
// or customer names), so a list screen costs ONE request instead of two or three, and
// avatars go out through imageUrl so they are resized rather than served full size.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');
const { safeInValues } = require('./pgrstFilter');
const imageUrl = require('./imageUrl');

const SUPABASE_URL = process.env.SUPABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CUSTOMER_COLS = 'id, name, mobile';

// The call_type values a tab may ask for. Whitelisted rather than passed through: this
// value reaches a PostgREST .in() filter, and an unchecked one there changes which rows
// come back (see src/pgrstFilter.js).
const CALL_TYPES = ['chat', 'audio', 'voice', 'video'];

/** JWT -> the real customers row. Same pattern as freeCallRoutes/orderRoutes. */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  let customer = null;
  if (decoded.phone) customer = await findCustomerByPhone(db, decoded.phone, CUSTOMER_COLS);
  const userId = decoded.userId || decoded._id || decoded.id;
  // Guarded: a soft-removed account must not resolve from a retained token.
  if (!customer && userId) customer = await findCustomerById(db, userId, CUSTOMER_COLS);
  return customer;
}

/** Astrologer id from the vendor JWT. */
function resolveAstrologerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

/**
 * ONE PHONE NUMBER CAN BE BOTH A CUSTOMER AND AN ASTROLOGER -- the store-reviewer
 * account is exactly that, and resolveCustomer works by phone. So a customer route
 * reached with a VENDOR token would otherwise be served that person's customer rows.
 * Every customer route below refuses an astrologer token outright, which is the same
 * guard /api/requests/:kind/:id/status and /api/notifications/read already apply.
 */
function looksLikeVendorToken(req) {
  const tk = (req.headers.authorization || '').split(' ')[1];
  if (!tk) return false;
  try {
    const d = jwt.verify(tk, JWT_SECRET);
    return !!(d && (d.role === 'astrologer' || d.astroId || d.vendorId));
  } catch (_) {
    return false;
  }
}

/** ?types=chat,audio -> a whitelisted array. Unknown values are dropped, not passed on. */
function parseTypes(raw, fallback) {
  const wanted = String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => CALL_TYPES.includes(s));
  return wanted.length ? wanted : fallback;
}

/** An ISO instant, or null. Never passed through raw. */
function parseInstant(raw) {
  if (!raw) return null;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function clampLimit(raw, def, max) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

const fullName = (first, last) => [first, last].filter(Boolean).join(' ');

module.exports = function registerSessionReadRoutes(app) {
  /* ---------------------------- customer: my sessions ----------------------------
   * Replaces MySessionScreen's chat_sessions select plus its separate astrologers
   * lookup. The astrologer is joined here, so the screen makes one request.
   */
  app.get('/api/customer/sessions', async (req, res) => {
    try {
      if (looksLikeVendorToken(req)) {
        return res.status(403).json({ success: false, message: 'Not a customer token' });
      }
      const customer = await resolveCustomer(req);
      if (!customer) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const types = parseTypes(req.query.types, CALL_TYPES);
      const limit = clampLimit(req.query.limit, 100, 200);

      const { data: rows, error } = await db
        .from('chat_sessions')
        .select('id, request_id, vendor_id, caller_id, call_type, is_free, is_active, started_at, ended_at, per_minute_charge, had_connectivity_issue')
        .eq('caller_id', customer.id)
        .in('call_type', types)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const sessions = rows || [];
      const vendorIds = [...new Set(sessions.map((r) => r.vendor_id).filter(Boolean))];
      const astroMap = {};
      if (vendorIds.length) {
        const { data: astros } = await db
          .from('astrologers')
          .select('id, first_name, last_name, profile_pic_url')
          .in('id', safeInValues(vendorIds));
        (astros || []).forEach((a) => {
          astroMap[a.id] = {
            id: a.id,
            firstName: a.first_name || '',
            lastName: a.last_name || '',
            name: fullName(a.first_name, a.last_name),
            profilePicUrl: imageUrl.smallAvatarUrl(a.profile_pic_url),
          };
        });
      }

      return res.status(200).json({
        success: true,
        sessions: sessions.map((s) => ({ ...s, astrologer: astroMap[s.vendor_id] || null })),
      });
    } catch (e) {
      console.error('GET /api/customer/sessions error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not load sessions' });
    }
  });

  /* ------------------------ customer: the chat to resume -------------------------
   * Replaces Home's resumeActiveChat pair of reads. Answers 200 with a null session
   * when there is nothing to resume -- Home treats "no chat" as an ordinary outcome,
   * not an error, and must show nothing on failure.
   */
  app.get('/api/customer/active-session', async (req, res) => {
    try {
      if (looksLikeVendorToken(req)) {
        return res.status(403).json({ success: false, message: 'Not a customer token' });
      }
      const customer = await resolveCustomer(req);
      if (!customer) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const { data: rows, error } = await db
        .from('chat_sessions')
        .select('id, request_id, vendor_id, call_type, started_at')
        .eq('caller_id', customer.id)
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) throw error;

      const s = rows && rows[0];
      // Only a chat is resumable by reopening a screen; a dropped call has to be
      // redialled, which is a different flow. The vendor-side active-session route
      // makes the same distinction.
      if (!s || s.call_type !== 'chat' || !s.request_id) {
        return res.status(200).json({ success: true, session: null });
      }

      let astrologer = null;
      try {
        const { data: a } = await db
          .from('astrologers')
          .select('id, first_name, last_name, profile_pic_url')
          .eq('id', s.vendor_id)
          .maybeSingle();
        if (a) {
          astrologer = {
            id: a.id,
            name: fullName(a.first_name, a.last_name),
            profilePicUrl: imageUrl.avatarUrl(a.profile_pic_url),
          };
        }
      } catch (_) { /* a missing name must not hide a resumable chat */ }

      return res.status(200).json({
        success: true,
        session: {
          id: s.id,
          requestId: s.request_id,
          vendorId: s.vendor_id,
          callType: s.call_type,
          startedAt: s.started_at || null,
          astrologer,
        },
      });
    } catch (e) {
      console.error('GET /api/customer/active-session error:', e.message);
      // Fails CLOSED on purpose: "could not tell" must read as "nothing to resume"
      // rather than bouncing the customer into a chat screen we are unsure about.
      return res.status(200).json({ success: true, session: null });
    }
  });

  /* ------------------- customer: is the first session still free? ----------------
   * Replaces utils/freeConsultation.js's head count. The real free-billing window is
   * enforced in sessionManager; this only gates banners and the pre-call wallet gate,
   * so it fails CLOSED (not eligible) exactly as the client version did.
   */
  app.get('/api/customer/first-session-eligible', async (req, res) => {
    try {
      if (looksLikeVendorToken(req)) {
        return res.status(403).json({ success: false, message: 'Not a customer token' });
      }
      const customer = await resolveCustomer(req);
      if (!customer) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const { count, error } = await db
        .from('chat_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('caller_id', customer.id);
      if (error) throw error;
      return res.status(200).json({ success: true, eligible: (count || 0) === 0, sessionCount: count || 0 });
    } catch (e) {
      console.error('GET /api/customer/first-session-eligible error:', e.message);
      return res.status(200).json({ success: true, eligible: false });
    }
  });

  /* ------------------------- vendor: missed calls and chats ----------------------
   * Replaces MissedSessionsHome's two selects, CustomDrawer's two head counts and the
   * MissedSessions tab config. countOnly=1 serves the drawer badge, which wants a
   * number and nothing else.
   *
   * call_requests is read here too: it is NOT part of the RLS finding, but these
   * three screens merge the two tables, and splitting the pair across a backend route
   * and a direct read would leave the merge half-migrated.
   */
  app.get('/api/vendor/missed', async (req, res) => {
    try {
      const astroId = resolveAstrologerId(req);
      if (!astroId) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const from = parseInstant(req.query.from);
      const to = parseInstant(req.query.to);
      const since = parseInstant(req.query.since); // the drawer's missed_seen_at
      const countOnly = req.query.countOnly === '1' || req.query.countOnly === 'true';
      const limit = clampLimit(req.query.limit, 50, 200);

      const range = (q) => {
        let out = q;
        if (from) out = out.gte('created_at', from);
        // EXCLUSIVE, deliberately. The vendor screen's own getRange() builds a
        // "yesterday" window as from=startOfYesterday, to=startOfToday and used .lt
        // here; lte would pull a request created at exactly 00:00:00.000 today into
        // yesterday's list.
        if (to) out = out.lt('created_at', to);
        if (since) out = out.gt('created_at', since);
        return out;
      };

      if (countOnly) {
        const [callRes, chatRes] = await Promise.all([
          range(db.from('call_requests').select('id', { count: 'exact', head: true })
            .eq('astrologer_id', astroId).eq('status', 'missed')),
          range(db.from('chat_requests').select('id', { count: 'exact', head: true })
            .eq('receiver_id', astroId).eq('status', 'missed')),
        ]);
        return res.status(200).json({
          success: true,
          count: (callRes.count || 0) + (chatRes.count || 0),
        });
      }

      const [callRes, chatRes] = await Promise.all([
        range(db.from('call_requests').select('id, customer_name, call_type, created_at')
          .eq('astrologer_id', astroId).eq('status', 'missed'))
          .order('created_at', { ascending: false }).limit(limit),
        range(db.from('chat_requests').select('id, caller_name, created_at')
          .eq('receiver_id', astroId).eq('status', 'missed'))
          .order('created_at', { ascending: false }).limit(limit),
      ]);

      const calls = (callRes.data || []).map((r) => ({
        id: r.id, kind: 'call', name: r.customer_name || '', callType: r.call_type || null, createdAt: r.created_at,
      }));
      const chats = (chatRes.data || []).map((r) => ({
        id: r.id, kind: 'chat', name: r.caller_name || '', callType: 'chat', createdAt: r.created_at,
      }));
      const merged = [...calls, ...chats]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

      return res.status(200).json({ success: true, missed: merged, count: merged.length });
    } catch (e) {
      console.error('GET /api/vendor/missed error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not load missed sessions' });
    }
  });

  /* --------------------------- vendor: my session history ------------------------
   * Replaces SessionHistory's chat_sessions select plus its resolveCustomerNames
   * round trip. Earnings are deliberately NOT included: they come from
   * POST /api/vendor/sessions/earnings, already a backend route and already the
   * authority on the ledger.
   */
  app.get('/api/vendor/sessions', async (req, res) => {
    try {
      const astroId = resolveAstrologerId(req);
      if (!astroId) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const types = parseTypes(req.query.types, CALL_TYPES);
      const limit = clampLimit(req.query.limit, 100, 200);

      const { data: rows, error } = await db
        .from('chat_sessions')
        .select('id, request_id, caller_id, vendor_id, call_type, is_free, is_active, started_at, ended_at, per_minute_charge, had_connectivity_issue')
        .eq('vendor_id', astroId)
        .in('call_type', types)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const sessions = rows || [];
      const callerIds = [...new Set(sessions.map((s) => s.caller_id).filter(Boolean))];
      const nameMap = {};
      if (callerIds.length) {
        const { data: custs } = await db
          .from('customers')
          .select('id, name, profile_image')
          .in('id', safeInValues(callerIds));
        (custs || []).forEach((c) => {
          nameMap[c.id] = {
            name: c.name || '',
            profileImage: imageUrl.smallAvatarUrl(c.profile_image),
          };
        });
      }

      return res.status(200).json({
        success: true,
        sessions: sessions.map((s) => ({
          ...s,
          customerName: (nameMap[s.caller_id] && nameMap[s.caller_id].name) || '',
          customerImage: (nameMap[s.caller_id] && nameMap[s.caller_id].profileImage) || null,
        })),
      });
    } catch (e) {
      console.error('GET /api/vendor/sessions error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not load sessions' });
    }
  });

  /* ------------------ vendor: my newest pending request ------------------------
   * Replaces the vendor HomeScreen's catch-up fetch, which read both request tables
   * directly.
   *
   * WHY A CATCH-UP EXISTS AT ALL: the socket listeners only see requests that arrive
   * AFTER they subscribe, so an app cold-started by the notification's fullScreenAction
   * would otherwise never show the very request that woke it. The newest pending row per
   * table is enough — the app's enqueuePopup de-dupes, so a later socket event for the
   * same row is a harmless no-op.
   */
  app.get('/api/vendor/pending-requests', async (req, res) => {
    try {
      const astroId = resolveAstrologerId(req);
      if (!astroId) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const [callRes, chatRes] = await Promise.all([
        db.from('call_requests')
          .select('id, call_type, customer_name, customer_id, room_token, room_id, session_id, is_free, free_minutes')
          .eq('astrologer_id', astroId).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(1),
        db.from('chat_requests')
          .select('id, request_type, caller_name, caller_id')
          .eq('receiver_id', astroId).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(1),
      ]);

      const call = (callRes.data || [])[0] || null;
      const chat = (chatRes.data || [])[0] || null;

      return res.status(200).json({
        success: true,
        // Shaped as the popup wants it, so the screen does no mapping and cannot drift
        // from the socket payload's field names.
        call: call ? {
          requestId: call.id,
          callType: call.call_type || 'audio',
          callerName: call.customer_name || 'Customer',
          callerId: call.customer_id,
          token: call.room_token,
          table: 'call_requests',
          roomId: call.room_id,
          sessionId: call.session_id || null,
          isFree: call.is_free === true,
          freeMinutes: call.free_minutes || null,
        } : null,
        chat: chat ? {
          requestId: chat.id,
          callType: chat.request_type || 'chat',
          callerName: chat.caller_name || 'Customer',
          callerId: chat.caller_id,
          table: 'chat_requests',
        } : null,
      });
    } catch (e) {
      console.error('GET /api/vendor/pending-requests error:', e.message);
      // 200 with nothing: a failed catch-up must not stop the dashboard painting, and the
      // socket plus the push fallback still deliver anything that arrives from now on.
      return res.status(200).json({ success: true, call: null, chat: null });
    }
  });

  /* ------------- vendor: the session id behind one of my requests ----------------
   * Replaces VendorChatSession's chat_sessions lookup by request_id. Scoped to the
   * asking astrologer's own sessions, so a guessed request id resolves to nothing
   * rather than to somebody else's session.
   */
  app.get('/api/vendor/session-by-request/:requestId', async (req, res) => {
    try {
      const astroId = resolveAstrologerId(req);
      if (!astroId) return res.status(401).json({ success: false, message: 'Not authenticated' });

      const { data, error } = await db
        .from('chat_sessions')
        .select('id, started_at, ended_at, is_active, caller_id')
        .eq('request_id', req.params.requestId)
        .eq('vendor_id', astroId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code === '22P02') {
        return res.status(400).json({ success: false, message: 'Invalid request id' });
      }
      if (error) throw error;
      if (!data) return res.status(200).json({ success: true, sessionId: null });

      return res.status(200).json({
        success: true,
        sessionId: data.id,
        startedAt: data.started_at || null,
        endedAt: data.ended_at || null,
        active: data.is_active === true,
      });
    } catch (e) {
      console.error('GET /api/vendor/session-by-request error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not resolve session' });
    }
  });
};
