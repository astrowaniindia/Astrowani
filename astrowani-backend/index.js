require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./src/push');
// iOS PushKit/CallKit ring for the vendor app. Degrades to a logged no-op when APNs
// credentials are absent, so this require is safe on an unconfigured deployment.
const { sendVoipPush, isVoipReady } = require('./src/voipPush');
const { computeAstrologerMetrics } = require('./src/astrologerMetrics');
const { logError, installStreamErrorGuards } = require('./src/errorLogger');
const { checkAstrologerBusy, buildBusyMap, checkCustomerBusy } = require('./src/busyStatus');
const { notifyWaitlistIfFree } = require('./src/waitlist');
const { initSentry } = require('./src/sentry');
const razorpay = require('./src/razorpay');
// Every rupee moves through this module — see src/wallet.js for why.
const wallet = require('./src/wallet');

// What the app ADVERTISES for a referral ("Get ₹50 per friend"). This is display
// only — the amount actually credited comes from referrals.reward_amount on the
// row itself, set by that column's DEFAULT when the referral is created.
// MUST match the default in sql/referral_reward_50.sql, or the app promises one
// figure and pays another.
const REFERRAL_REWARD_AMOUNT = 50;
const smsProviders = require('./src/smsProviders');
const { TtlCache } = require('./src/ttlCache');
const { contentCache } = require('./src/contentCache');
const { createLiveAartiPoller } = require('./src/liveAarti');
const { startAstrologerFanout } = require('./src/astrologerFanout');
const { startTableFanout } = require('./src/tableFanout');
const { applyHttpHardening } = require('./src/httpHardening');

// No-op until SENTRY_DSN is set in the environment — see MD files/deployment-and-releases.md.
initSentry();

// Last-resort capture so unexpected errors are visible to the bug-scanning
// agent instead of only scrolling past in console output. Neither handler
// changes existing crash/restart behavior — errors are logged, not swallowed
// into a process.exit() that wasn't there before.
// Must run before anything can log: without it, an EPIPE on stdout/stderr
// becomes an uncaughtException, whose handler logs, which writes to stdout,
// which throws EPIPE again — the loop that produced a 26 GB errors.log.
installStreamErrorGuards();

process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))));

// Falls back to the real project URL if unset — matches src/wallet.js's
// pattern. This ALSO means a local dev override (SUPABASE_URL set before
// `node index.js` starts) now actually takes effect here, not just in
// wallet.js — previously this was hardcoded, so every supabase/supabaseService
// call silently kept hitting production regardless of any local override.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';

// This process runs on our own trusted VPS, so every query it makes should go out
// as the service role — the anon key exists for the two apps, not for us. Using it
// here was the thing blocking anon privileges from being tightened at all: any
// REVOKE aimed at a malicious client also hit our own backend. See
// sql/hardening_02_access_control.sql STEP 1. The anon client is kept only as a
// boot-time fallback so a missing env var degrades to today's behaviour rather
// than taking the API down.
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[startup] SUPABASE_SERVICE_ROLE_KEY is not set — falling back to the anon key. ' +
    'Anon privileges cannot be locked down while this is the case.',
  );
}
const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabaseAnon;

// Kept as a distinct name because ~40 call sites already reference it for
// server-trusted writes; it is now the same client as `supabase` above.
const supabaseService = supabase;

// ─────────────────────────────────────────────────────────────────────────────
// Astrologer formatting — single source of truth for what the customer app sees.
// Reconciles the column names the vendor app actually writes:
//   - profile picture: EditProfile writes `profile_image` (base64); legacy `profile_pic_url`
//   - languages: Registration writes `languages`, EditProfile writes `language`
//   - category/specialties: Registration writes `specialties` as an ARRAY OF category UUIDs
//     (from the `categories` table) — we resolve those to names + expose categoryIds.
// ─────────────────────────────────────────────────────────────────────────────
// Exactly the columns formatAstrologer + astrologerVisibleToCustomers read.
// SELECT * was pulling every column including bank details and admin_notes,
// which the customer app has no business receiving and which bloat the row.
const ASTROLOGER_LIST_COLUMNS = [
  'id', 'first_name', 'last_name', 'email', 'gender', 'experience',
  // NOTE: `languages` and `profile_pic_url` only. formatAstrologer also reads
  // `astro.language` and astrologerProfileComplete reads `row.profile_image`,
  // but neither column exists on this table — they are legacy fallbacks that
  // always evaluate undefined. Naming them here would make PostgREST 400.
  'languages', 'specialties', 'bio', 'profile_pic_url',
  'call_charge_per_minute', 'chat_charge_per_minute', 'video_charge_per_minute',
  'audio_price', 'chat_price', 'video_price',
  'is_call_enabled', 'is_chat_enabled', 'is_video_call_enabled',
  'is_available', 'is_online', 'is_live',
  'average_rating', 'total_reviews',
  'approval_status', 'is_suspended', 'badge',
].join(', ');

// 10s is a deliberate trade: availability can lag by up to that, but a stale
// list cannot cause an incorrect call because /api/call/initiate re-checks busy
// state and 409s. See src/ttlCache.js.
const astrologerListCache = new TtlCache({ ttlMs: 10_000, maxEntries: 50 });

async function buildCategoryMap() {
  try {
    const { data } = await supabase.from('categories').select('id, name');
    const map = {};
    (data || []).forEach((c) => { map[c.id] = c.name; });
    return map;
  } catch (_) {
    return {};
  }
}

function formatAstrologer(astro, index, categoryMap = {}, busyMap = {}) {
  const rawCats = Array.isArray(astro.specialties)
    ? astro.specialties
    : (astro.specialties ? [astro.specialties] : []);
  const catNames = rawCats.map((s) => categoryMap[s] || s).filter(Boolean);
  const languages = astro.languages || astro.language || ['Hindi', 'English'];

  return {
    _id: astro.id,
    userId: astro.id, // real Supabase UUID — must match vendor's astroId
    name: `${astro.first_name || ''} ${astro.last_name || ''}`.trim() || 'Astrologer',
    email: astro.email || '',
    gender: astro.gender || '',
    // profile_pic_url is normally a Supabase Storage URL, but some legacy rows (written
    // before EditProfile.js switched to uploading via /api/upload-image) have a raw
    // base64 data-URI sitting directly in this column. Serving that in list responses
    // (potentially dozens of astrologers per request) bloats the payload to several MB
    // and causes "Network Error" on slower connections/devices — so a data: value is
    // never trusted here, even if the one-time backfill (scripts/backfillAstrologerImages.js)
    // hasn't reached this row yet.
    profileImage: (astro.profile_pic_url && !astro.profile_pic_url.startsWith('data:'))
      ? astro.profile_pic_url
      : `https://backend.astrowani.com/public/images/astro${(index % 4) + 1}.png`,
    chargePerMinute: astro.call_charge_per_minute || 15,
    pricing: astro.call_charge_per_minute || 15,
    chatPrice: astro.chat_charge_per_minute || 0,
    videoPrice: astro.video_charge_per_minute || 0,
    isFree: false,
    // Service-toggle flags — drive per-card button visibility
    isChatEnabled: astro.is_chat_enabled === true,
    isCallEnabled: astro.is_call_enabled === true,
    isVideoEnabled: astro.is_video_call_enabled === true,
    isAvailable: astro.is_available === true,
    // Master online/offline switch — independent of is_available (GO LIVE) and the
    // per-service toggles above. null/undefined (pre-migration rows) treated as online.
    isOnline: astro.is_online !== false,
    // Busy = already in an active session or an unanswered pending request with someone
    // else. Independent of the toggles above (a fully-enabled astrologer can still be busy).
    isBusy: busyMap[astro.id]?.isBusy === true,
    busySince: busyMap[astro.id]?.busySince || null,
    // 'live' = currently broadcasting (see Live Streaming), 'session' = an ordinary
    // active/pending chat or call — apps show a distinct "Live now" state for the former.
    busyReason: busyMap[astro.id]?.reason || null,
    // Lets the "Live now" pill navigate straight into LiveViewerScreen instead of just
    // announcing the state — only present when busyReason is 'live'.
    liveSessionId: busyMap[astro.id]?.liveSessionId || null,
    // Category/specialty — resolved names for display + ids for filtering
    specialties: catNames.length ? catNames.map((n) => ({ name: n })) : [{ name: 'Vedic Astrology' }],
    categoryIds: rawCats,
    categoryNames: catNames,
    experience: astro.experience || 5,
    language: Array.isArray(languages) ? languages : [languages],
    // Real, computed values (see recomputeAstrologerRating). 0 / 0 for a new astrologer
    // with no reviews — the app shows an empty 5-star outline + "New".
    rating: Number(astro.average_rating) || 0,
    totalReviews: astro.total_reviews || 0,
    bio: astro.bio || '',
    // Admin-assigned recognition badge — 'verified' | 'celebrity' | 'top_rated' | null.
    // Set only from astrowani-admin's Astrologers page; astrologers cannot self-assign it.
    badgeType: astro.badge || null,
  };
}

// Recomputes an astrologer's cached average_rating + total_reviews from their
// non-hidden reviews. Called after any review insert/update/delete/hide so the
// list/profile endpoints can read the aggregate without a per-row join.
async function recomputeAstrologerRating(astrologerId) {
  try {
    // Aggregate in SQL instead of pulling every review row into Node — a
    // popular astrologer's full review history no longer has to cross the
    // wire just to compute an average. Falls back to the old full-fetch
    // behavior if the RPC isn't installed yet (see sql/hardening_05_identity_and_review_indexes.sql).
    const { data: rpcRows, error: rpcError } = await supabaseService
      .rpc('astrologer_review_stats', { p_astrologer_id: astrologerId });
    let avg;
    let total;
    if (!rpcError && rpcRows && rpcRows.length) {
      avg = Math.round((Number(rpcRows[0].avg_rating) || 0) * 10) / 10;
      total = Number(rpcRows[0].review_count) || 0;
    } else {
      const { data: rows } = await supabaseService
        .from('reviews')
        .select('rating')
        .eq('astrologer_id', astrologerId)
        .eq('is_hidden', false);
      const list = rows || [];
      total = list.length;
      avg = total
        ? Math.round((list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) * 10) / 10
        : 0;
    }
    await supabaseService
      .from('astrologers')
      .update({ average_rating: avg, total_reviews: total })
      .eq('id', astrologerId);
    return { averageRating: avg, totalReviews: total };
  } catch (e) {
    console.error('[reviews] recompute error:', e.message);
    return null;
  }
}

const axios = require('axios');

const app = express();
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
// Exposed so route modules (e.g. src/notificationRoutes.js) can emit to a user's
// personal room without needing io threaded through as a constructor argument —
// same app.locals convention already used for endLiveSession below.
app.locals.io = io;

const sessionManager = require('./src/sessionManager'); // Import the SessionManager

// SECURITY (2026-08-08 — see MD files/security-audit-2026-08-08.md): join_room(userId) used
// to trust the client-supplied id with zero verification — anyone who obtained/guessed a
// customer or astrologer UUID could join that user's personal room and silently eavesdrop on
// their incoming_call/call_accepted/session_ended/new_notification/new_chat_message events.
// Every join now requires the same JWT used for HTTP auth; the claimed id is only used for
// logging a mismatch, never trusted for the actual socket.join().
async function resolveSocketIdentity(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.astroId || decoded.vendorId || decoded.role === 'astrologer') {
      return decoded.astroId || decoded.vendorId || decoded.id || null;
    }
    // Customer token — reconcile by phone the same way resolveCustomerFromReq does, since
    // older tokens can carry a stale user_<timestamp> id instead of the real UUID.
    let id = decoded.userId || decoded.id || null;
    if (decoded.phone) {
      const { data } = await supabaseService.from('customers').select('id').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) id = data[0].id;
    }
    return id;
  } catch (_) {
    return null;
  }
}

// MONEY-LEAK GUARD (2026-08-14): if a participant's app is fully killed (not just
// backgrounded) mid-session, their socket disconnects and — previously — nothing at all
// happened server-side. sessionManager's 30s billing poll doesn't check connectivity, so
// billing kept running indefinitely against a customer's wallet with no app left alive to
// even show them the "still connected" notification, and the other party's screen never
// got a session_ended signal either. Grace period tolerates a real reconnect (brief
// network drop, quick background-then-resume — the client re-emits join_session on every
// socket reconnect, see VoiceCallScreen.tsx/VideoCallScreen.tsx/ChatSessionScreen.js);
// only a participant that never comes back within it gets the session force-ended, on
// both sides, via the same terminateSession() used by every other end-of-call path.
const SESSION_ABANDON_GRACE_MS = 25000;
const pendingSessionTerminations = new Map(); // "sessionId:participantId" -> Timeout

function cancelPendingSessionTermination(sessionId, participantId) {
  const key = `${sessionId}:${participantId}`;
  const timer = pendingSessionTerminations.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingSessionTerminations.delete(key);
    console.log(`[socket] ${participantId} rejoined session ${sessionId} within grace period — termination cancelled`);
  }
}

function scheduleSessionAbandonCheck(sessionId, participantId) {
  const key = `${sessionId}:${participantId}`;
  if (pendingSessionTerminations.has(key)) return; // already scheduled — e.g. duplicate disconnect events
  const timer = setTimeout(async () => {
    pendingSessionTerminations.delete(key);
    try {
      const { data: session } = await supabaseService
        .from('chat_sessions')
        .select('id, is_active')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session || !session.is_active) return; // already ended some other way — nothing to do
      console.warn(`[socket] Participant ${participantId} did not reconnect to session ${sessionId} within ${SESSION_ABANDON_GRACE_MS}ms — force-ending session (money-leak guard).`);
      await sessionManager.terminateSession(sessionId, 'Participant disconnected (app closed or lost connection)');
    } catch (e) {
      console.error('[socket] abandon-check error:', e.message);
    }
  }, SESSION_ABANDON_GRACE_MS);
  pendingSessionTerminations.set(key, timer);
}

io.on('connection', (socket) => {
  console.log('A user connected via Socket.io:', socket.id);

  socket.on('join_room', async (userId) => {
    const realId = await resolveSocketIdentity(socket.handshake.auth && socket.handshake.auth.token);
    if (!realId) {
      console.warn(`[socket] join_room rejected for claimed id ${userId} — missing/invalid auth token`);
      return;
    }
    if (String(realId) !== String(userId)) {
      console.warn(`[socket] join_room: claimed id ${userId} did not match verified id ${realId} — joining the verified room only`);
    }
    socket.join(realId);
    console.log(`User ${realId} joined their personal room (verified).`);
  });

  // SECURITY (2026-08-08 — see MD files/security-audit-2026-08-08.md, "chat room-membership
  // injection"): previously any authenticated (or unauthenticated) socket could join ANY
  // session's room by guessing/enumerating its sessionId, and — combined with
  // /api/chat/message's lack of a matching check — could inject a message into a session
  // they are not part of, or silently eavesdrop on its live message/signaling events. Both
  // sides of this are now closed: joining requires a verified identity that is actually
  // caller_id or vendor_id on the session row.
  socket.on('join_session', async (sessionId) => {
    if (!sessionId) return;
    const realId = await resolveSocketIdentity(socket.handshake.auth && socket.handshake.auth.token);
    if (!realId) {
      console.warn(`[socket] join_session rejected for ${sessionId} — missing/invalid auth token`);
      return;
    }
    const { data: sessionRow } = await supabaseService
      .from('chat_sessions').select('id, caller_id, vendor_id').eq('id', sessionId).maybeSingle();
    if (!sessionRow
      || (String(sessionRow.caller_id) !== String(realId) && String(sessionRow.vendor_id) !== String(realId))) {
      console.warn(`[socket] join_session rejected — ${realId} is not a participant of session ${sessionId}`);
      return;
    }
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session room: ${sessionId} (verified participant ${realId})`);

    // Track for the disconnect handler below, and cancel any abandon-check already
    // running for this exact participant+session (a reconnect within the grace period).
    socket.data.sessionId = sessionId;
    socket.data.participantId = realId;
    cancelPendingSessionTermination(sessionId, realId);
  });

  socket.on('initiate_call', (data) => {
    console.log('Incoming call to:', data.astrologer_id);
    io.to(data.astrologer_id).emit('incoming_call', data);
  });

  socket.on('accept_call', (data) => {
    console.log('Call accepted by vendor, notifying customer:', data.customer_id);
    io.to(data.customer_id).emit('call_accepted', data);
  });

  socket.on('reject_call', (data) => {
    console.log('Call rejected by vendor, notifying customer:', data.customer_id);
    io.to(data.customer_id).emit('call_rejected', data);
  });

  // Customer cancelled/backed out (manually, or the client-side ring timeout) before the
  // vendor answered — dismiss the vendor's in-app popup AND its heads-up OS notification.
  socket.on('cancel_call', (data) => {
    if (!data || !data.astrologer_id) return;
    console.log('Call cancelled by customer, notifying vendor:', data.astrologer_id);
    io.to(data.astrologer_id).emit('call_cancelled', data);

    // Push fallback — the socket above only reaches a vendor whose HomeScreen is currently
    // mounted; without this, a backgrounded/killed vendor keeps showing a live "Incoming
    // Call" notification with working Accept/Reject long after the customer has given up.
    //
    // DO NOT add a VoIP push here. iOS requires that EVERY PushKit push results in the app
    // reporting a call to CallKit — a push that does not gets the app terminated, and
    // repeat offences get its VoIP privilege revoked outright. A "cancel" push has no call
    // to report, so it is exactly the shape iOS punishes.
    // It is also unnecessary: a VoIP push has, by definition, already woken the app, so by
    // the time a cancel happens the vendor app is running with a live socket and receives
    // the `call_cancelled` emit above. Its handler calls RNCallKeep.endCall() to dismiss the
    // CallKit screen (see src/utils/callKeep.js in the vendor app).
    supabase.from('astrologers').select('fcm_token').eq('id', data.astrologer_id).single()
      .then(({ data: astro }) => {
        if (astro?.fcm_token) {
          sendPush(astro.fcm_token, {
            data: { type: 'cancel_incoming_request', roomId: data.roomId || '' },
          }).catch((e) => console.error('[cancel_call] push send error:', e.message));
        }
      })
      .catch((e) => console.error('[cancel_call] push lookup error:', e.message));
  });

  // SECURITY (2026-08-14 — money/billing audit): previously accepted any sessionId from any
  // connected socket with no identity check at all, unlike join_session's verified-participant
  // guard above. Combined with activateSession() being replayable, this let a non-participant
  // (or a participant replaying the event) push a session's billing clock forward indefinitely
  // — see sessionManager.js activateSession() for the other half of the fix. Now requires the
  // same verified-participant check as join_session before touching billing state.
  socket.on('signal_connection', async (data) => {
    if (!data || !data.sessionId) return;
    const realId = await resolveSocketIdentity(socket.handshake.auth && socket.handshake.auth.token);
    if (!realId) {
      console.warn(`[socket] signal_connection rejected for ${data.sessionId} — missing/invalid auth token`);
      return;
    }
    const { data: sessionRow } = await supabaseService
      .from('chat_sessions').select('id, caller_id, vendor_id').eq('id', data.sessionId).maybeSingle();
    if (!sessionRow
      || (String(sessionRow.caller_id) !== String(realId) && String(sessionRow.vendor_id) !== String(realId))) {
      console.warn(`[socket] signal_connection rejected — ${realId} is not a participant of session ${data.sessionId}`);
      return;
    }
    console.log('Connection signal received for session:', data.sessionId);
    const success = await sessionManager.activateSession(data.sessionId);
    if (success) {
      io.to(data.sessionId).emit('session_activated', { sessionId: data.sessionId });
    }
  });

  socket.on('end_session', async (data) => {
    console.log('Manual end session requested:', data.sessionId);
    await sessionManager.terminateSession(data.sessionId, 'User ended session');
    io.to(data.sessionId).emit('session_ended', { sessionId: data.sessionId, reason: 'User ended session' });
  });

  // Typing indicator relay for the active chat screens (ChatSessionScreen.js,
  // VendorChatSession.js) — replaces a Supabase Realtime broadcast channel with a plain
  // passthrough over the session room both sides already join for signal_connection/
  // session_ended. No DB write, no persistence — purely ephemeral, same as the broadcast
  // channel it replaces.
  socket.on('chat_typing', (data) => {
    if (!data || !data.sessionId) return;
    socket.to(data.sessionId).emit('chat_typing', { isTyping: !!data.isTyping });
  });

  // ── LIVE STREAMING (WebRTC mesh: one broadcaster → many viewers) ────────────
  // Viewer joins a stream: subscribe to the live room (comments/gifts) + tell the
  // broadcaster (in their personal room) so it can open a peer connection for them.
  socket.on('live_join', async (data) => {
    if (!data?.sessionId || !data?.astrologerId || !data?.viewerId) return;
    // The client's viewerId comes from a locally-cached AsyncStorage id, which can be
    // stale (same "user_<timestamp>" issue documented for the call flow above). join_room
    // already ignores that value and joins the socket to the JWT-verified room instead —
    // but live_offer/live_answer/live_ice below route by the viewerId field itself, so a
    // mismatch here means the offer is emitted to a room nobody actually joined: the
    // broadcaster's viewer count still increments (astrologerId is always correct) while
    // the viewer's PeerConnection never receives a remote description and sits on
    // "Connecting" forever. Resolve and use the verified id everywhere from this point on,
    // and tell the client what id to use so its own live_offer/live_ice filters still match.
    const realId = await resolveSocketIdentity(socket.handshake.auth && socket.handshake.auth.token);
    const viewerId = realId || data.viewerId; // fall back for unauthenticated/guest viewers
    socket.join('live_' + data.sessionId);
    socket.emit('live_join_ack', { viewerId });
    io.to(data.astrologerId).emit('live_viewer_joined', { ...data, viewerId });
  });
  // Broadcaster → specific viewer (offer); viewer → broadcaster (answer); both ways (ICE).
  socket.on('live_offer', (data) => {
    if (data?.viewerId) io.to(data.viewerId).emit('live_offer', data);
  });
  socket.on('live_answer', (data) => {
    if (data?.astrologerId) io.to(data.astrologerId).emit('live_answer', data);
  });
  socket.on('live_ice', (data) => {
    if (data?.to) io.to(data.to).emit('live_ice', data);
  });
  socket.on('live_leave', (data) => {
    if (data?.sessionId) socket.leave('live_' + data.sessionId);
    if (data?.astrologerId) io.to(data.astrologerId).emit('live_viewer_left', data);
  });
  // Comments + gift toasts broadcast to everyone watching the stream.
  socket.on('live_comment', (data) => {
    if (data?.sessionId) io.to('live_' + data.sessionId).emit('live_comment', data);
  });
  socket.on('live_gift', (data) => {
    if (data?.sessionId) io.to('live_' + data.sessionId).emit('live_gift', data);
  });
  // Broadcaster ended the stream — drop all viewers.
  socket.on('end_live', (data) => {
    if (data?.sessionId) io.to('live_' + data.sessionId).emit('live_ended', data);
  });

  // WebRTC signaling relay — both peers join the session room; relay to the other peer
  socket.on('webrtc_ready', (data) => {
    if (data?.sessionId) socket.to(data.sessionId).emit('webrtc_ready', data);
  });
  socket.on('webrtc_offer', (data) => {
    if (data?.sessionId) socket.to(data.sessionId).emit('webrtc_offer', data);
  });
  socket.on('webrtc_answer', (data) => {
    if (data?.sessionId) socket.to(data.sessionId).emit('webrtc_answer', data);
  });
  socket.on('webrtc_ice_candidate', (data) => {
    if (data?.sessionId) socket.to(data.sessionId).emit('webrtc_ice_candidate', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const { sessionId, participantId } = socket.data || {};
    if (sessionId && participantId) {
      scheduleSessionAbandonCheck(sessionId, participantId);
    }
  });
});

// helmet + compression + CORS allowlist + a general per-IP rate limit.
// Must run before any route is registered. See src/httpHardening.js.
applyHttpHardening(app);
app.use(express.json({ limit: '10mb' })); // blog/banner images may be base64 data-URIs
app.use('/public', express.static(path.join(__dirname, 'public')));

// Admin dashboard — built from astrowani-admin/ into admin-dist/
app.use('/admin', express.static(path.join(__dirname, 'admin-dist')));
app.get('/admin/*', (_req, res) => res.sendFile(path.join(__dirname, 'admin-dist', 'index.html')));

const PORT = process.env.PORT || 4500;

// Refuse to boot on a weak or publicly-known signing secret. The old fallback
// ('super_secret_astrowani_key_123') was hardcoded here AND written out in
// CLAUDE.md, so anyone with repo access could mint a valid token for any
// customer, any astrologer, or the admin dashboard — and production was in fact
// running on exactly that value. Rotating it signs everyone out once (tokens are
// 30d); that is the intended effect, not a regression.
const JWT_SECRET = process.env.JWT_SECRET;
const WEAK_SECRETS = new Set(['super_secret_astrowani_key_123', 'secret', 'changeme']);
if (!JWT_SECRET || JWT_SECRET.length < 32 || WEAK_SECRETS.has(JWT_SECRET)) {
  console.error(
    '[startup] FATAL: JWT_SECRET must be set to a random value of at least 32 characters ' +
    'and must not be the old hardcoded default. Generate one with:\n' +
    "  node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"\n" +
    'then set it in the backend process environment and restart.',
  );
  process.exit(1);
}

// Admin dashboard routes (auth + content/management CRUD under /api/admin)
require('./src/adminRoutes')(app);
require('./src/bugAgentRoutes')(app);
require('./src/postHogRoutes')(app);
require('./src/sentryRoutes')(app);

// Notification management (admin broadcast/personal send + history)
require('./src/notificationRoutes')(app);

// Admin-triggerable referral popup (broadcast/personal send + history)
require('./src/referralPopupRoutes')(app);

// Paid astrology reports (JyotishamAstroAPI) — /api/astro/* + public /api/astro-services
require('./src/astroRoutes')(app);

// Free astrology services (JyotishamAstroAPI) — /api/free-services/* (panchang, horoscope,
// janam-kundali, kundali-match). No auth, no wallet charge.
require('./src/freeServicesRoutes')(app);

// Image upload — base64 -> Supabase Storage URL (POST /api/upload-image)
require('./src/uploadRoutes')(app);

// Remedies commerce — saved addresses, multi-item cart checkout (Razorpay + wallet),
// order history and cancellation. Owns /api/addresses/* and all of /api/orders/*,
// including the GET /api/orders/mine that used to live in this file.
require('./src/orderRoutes')(app);
// Astrologer referral commission on remedy orders. Registered after orderRoutes
// because it requires adminRoutes' requireAdmin, which is exported there.
require('./src/remedyReferralRoutes')(app);

// OTPs are persisted in Supabase (table: otp_codes), not an in-memory Map —
// a plain Map is wiped on every process restart, and `pm2 restart` runs on
// every single deploy. A user mid-login when that happens would have their
// just-sent OTP silently vanish server-side (the SMS still arrives, but
// verify fails with "No OTP requested for this number"), and only a fresh
// Resend issued after the restart would actually work. See
// sql/otp_codes_schema.sql. Same failure class as the earnings-reset restart
// bug fixed earlier this project.
// --- OTP policy knobs -------------------------------------------------------
// Tuned to be invisible to a real person and restrictive to a script. A human
// signing up needs one OTP and types it once; these ceilings sit far above
// that and far below what makes abuse worthwhile.
const OTP_MAX_ATTEMPTS = 5;                       // wrong guesses before the code is burned
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;         // min gap between sends to one number
const OTP_SEND_WINDOW_MS = 20 * 60 * 1000;        // rolling window for the send cap
const OTP_MAX_SENDS_PER_WINDOW = 25;              // max SMS to one number per window
const OTP_TTL_MS = 5 * 60 * 1000;

// WHY THESE TWO WERE LOOSENED (audit 2026-08-18): they were 8 sends per 60
// minutes, and the row carrying the counter is deleted only on a SUCCESSFUL
// verify. That combination aims squarely at the one user who most needs to get
// through — the person whose OTP never arrived. They tap Resend; the UI timer
// is 60s; eight sends is about eight minutes of ordinary retrying. Then they
// are locked out for the rest of the hour, and cannot clear it, because
// clearing it requires verifying a code they never received. That is the
// reported "after multiple attempts it stops working", exactly.
//
// 25 sends per 20 minutes makes a lockout drain in minutes rather than an hour.
// The protection that actually matters against brute force is OTP_MAX_ATTEMPTS,
// which is keyed to the code rather than to the sender, and is unchanged.
//
// BE AWARE OF WHAT THIS CAP NOW DOES, before "tidying" either number: at 25 it
// is close to non-binding. OTP_RESEND_COOLDOWN_MS already forces a 45s gap, so
// the most sends physically possible inside a 20-minute window is
// 1200 / 45 ~= 27. A cap of 25 therefore only ever trips for someone hammering
// Resend at almost exactly the cooldown boundary for the full 20 minutes — in
// practice the cooldown, not this cap, is what limits a single number.
//
// That is a deliberate choice: the cost of blocking a real user mid-login is
// judged higher than the cost of the extra SMS. The remaining protections are
// the 45s cooldown (one number), OTP_MAX_ATTEMPTS (brute force), and
// OTP_GLOBAL_HOURLY_CAP (a spray across many numbers). If SMS spend ever needs
// reining in, lower this number rather than raising the cooldown — the cooldown
// is what real users feel.
//
// The counter is also now REFUNDED when the carrier does not deliver (see
// verifyEnxDelivery) — a send the user never received should not spend their
// budget.

// Identifies WHICH terms a user accepted. Bump this whenever the published
// Terms & Conditions change materially — an acceptance record that doesn't say
// what was accepted is not much of a record. Stored on the account row alongside
// the timestamp (sql/terms_acceptance_schema.sql).
const TERMS_VERSION = '2026-08-16';

/**
 * Columns recording a Terms & Conditions acceptance, stamped when an account row
 * is created.
 *
 * Built on the SERVER, from the server's own clock, and never merged from the
 * request body. A client-supplied "termsAcceptedAt" would be worth nothing as
 * evidence — the whole point of this record is that the app cannot fabricate it.
 * The only thing the client contributes is `source`, which is a label for which
 * screen the account came from, not the acceptance itself.
 */
function termsAcceptanceFields(source) {
  return {
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
    terms_accepted_source: source,
  };
}

/**
 * True when a write failed only because a column does not exist.
 *
 * TWO codes, and the second is the one that actually fires: writes go through
 * PostgREST, which rejects an unknown column against its cached schema and
 * returns its own PGRST204 ("Could not find the 'x' column ... in the schema
 * cache") before Postgres is ever asked. Postgres's native 42703 is only seen
 * when a statement does reach the database. Checking 42703 alone looks correct
 * and catches nothing — verified against the live schema, where an insert of a
 * not-yet-migrated column returned PGRST204.
 */
function isMissingColumnError(error) {
  if (!error) return false;
  return error.code === 'PGRST204'
    || error.code === '42703'
    || /could not find the .* column|column .* does not exist/i.test(error.message || '');
}

/**
 * Insert an account row, stamping the terms acceptance, and survive the columns
 * not existing yet.
 *
 * The backend redeploys automatically on push, but sql/terms_acceptance_schema.sql
 * is applied by hand in the Supabase editor like every other migration in this
 * repo. Between those two moments a strict insert would fail with 42703
 * (undefined column) and take out signup on BOTH apps. Creating the account
 * matters more than recording the acceptance, so a missing column costs the
 * record and a loud warning, not the registration.
 *
 * Remove the fallback once the migration is applied everywhere.
 */
async function insertAccountRow(table, row, source) {
  const first = await supabaseService
    .from(table).insert([{ ...row, ...termsAcceptanceFields(source) }]).select('id').single();
  if (!first.error || !isMissingColumnError(first.error)) return first;

  console.warn(
    `[terms] ${table} has no terms_* columns — run sql/terms_acceptance_schema.sql. ` +
    'Creating the account WITHOUT an acceptance record.',
  );
  return supabaseService.from(table).insert([row]).select('id').single();
}

// OTPs are HMAC'd, not stored in the clear. A plain hash would be pointless —
// only 1,000,000 possible 6-digit codes, enumerable offline in milliseconds —
// so the secret is what actually protects them: reading the table is no longer
// enough to impersonate a user mid-login. Falls back to JWT_SECRET, which
// index.js already refuses to boot without.
const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET || JWT_SECRET;
const hashOtp = (otp) =>
  crypto.createHmac('sha256', OTP_HMAC_SECRET).update(String(otp)).digest('hex');

// Compare digests without leaking how much of the value matched via timing.
const safeEqualHex = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (_) {
    return false;
  }
};

const otpStore = {
  // `sendMeta` carries the rolling-window counters forward. Passing it keeps
  // the throttle state on the same row as the code, so it survives restarts
  // and is shared across processes — an in-memory counter would reset on every
  // deploy and would not be seen by a second PM2 worker.
  // Unconditional upsert. ONLY the Play Store reviewer path uses this now — a
  // single fixed number with no concurrency to worry about, which must always
  // succeed. Every real send goes through claimAndSet below, which is race-safe.
  // Do not reach for this one for normal sends.
  //
  // Returns the `last_sent_at` it wrote. That value identifies THIS specific
  // send, so the delivery check can later refund the send counter without
  // clobbering a newer send that has since replaced the row.
  async set(phoneNumber, { otp, sessionId, expiresAt, sendMeta }) {
    const now = new Date();
    const lastSentAt = now.toISOString();
    await supabaseService.from('otp_codes').upsert({
      phone_number: phoneNumber,
      otp: null,                  // never persist the code itself
      otp_hash: hashOtp(otp),
      session_id: sessionId,
      expires_at: new Date(expiresAt).toISOString(),
      attempts: 0,                // a new code gets a fresh guess budget
      last_sent_at: lastSentAt,
      sends_in_window: sendMeta?.sendsInWindow ?? 1,
      window_started_at: (sendMeta?.windowStartedAt ?? now).toISOString(),
    });
    return lastSentAt;
  },

  /**
   * Give back one send from the rolling window, for an SMS the carrier never
   * delivered. The user did not receive that code, so it must not spend their
   * budget — otherwise a run of carrier failures is exactly what locks out the
   * person already struggling to log in.
   *
   * Compare-and-set on `last_sent_at`: if a newer send has replaced the row
   * since, or the row is gone (verified, expired, purged), this does nothing
   * rather than corrupting a counter that no longer belongs to this send.
   */
  async refundSend(phoneNumber, expectedLastSentAt) {
    const { data } = await supabaseService
      .from('otp_codes')
      .select('sends_in_window, last_sent_at')
      .eq('phone_number', phoneNumber)
      .eq('last_sent_at', expectedLastSentAt)
      .maybeSingle();
    if (!data) return false;

    const next = Math.max(0, (data.sends_in_window ?? 1) - 1);
    const { error } = await supabaseService
      .from('otp_codes')
      .update({ sends_in_window: next })
      .eq('phone_number', phoneNumber)
      .eq('last_sent_at', expectedLastSentAt);
    return !error;
  },

  async get(phoneNumber) {
    const { data } = await supabaseService
      .from('otp_codes')
      .select('otp, otp_hash, session_id, expires_at, attempts, last_sent_at, sends_in_window, window_started_at')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (!data) return null;
    return {
      otp: data.otp,                        // legacy plaintext, only on pre-migration rows
      otpHash: data.otp_hash,
      sessionId: data.session_id,
      expiresAt: new Date(data.expires_at).getTime(),
      attempts: data.attempts ?? 0,
      lastSentAt: data.last_sent_at ? new Date(data.last_sent_at).getTime() : 0,
      // The DB's own representation, kept verbatim for the compare-and-set in
      // claimAndSet. Parsing to ms and back would risk not matching the stored
      // value exactly, which would silently turn every claim into a lost race.
      lastSentAtRaw: data.last_sent_at || null,
      sendsInWindow: data.sends_in_window ?? 0,
      windowStartedAt: data.window_started_at ? new Date(data.window_started_at) : new Date(),
    };
  },

  /**
   * Store a new code, but only if no concurrent request has already done so.
   *
   * WHY (audit 2026-08-18, double-tap race). The throttle was read-then-write:
   * two requests for the same number could both call get(), both see the same
   * state, both pass checkOtpSendThrottle, and both send an SMS. The upsert
   * then kept only the LAST hash — so the user received two codes and the one
   * that happened to arrive FIRST was already dead. They type it, get "Invalid
   * OTP", and burn an attempt for something they did nothing wrong to cause.
   *
   * The fix makes claiming the send atomic, using the row itself as the lock,
   * with no new table, migration or stored procedure:
   *
   *   - No row existed: plain INSERT (never upsert). The primary key on
   *     phone_number IS the mutex — the loser gets 23505.
   *   - A row existed: UPDATE guarded by the exact last_sent_at that was read.
   *     Only one writer can advance it; everyone else matches 0 rows.
   *
   * `expectedLastSentAt` is existing.lastSentAtRaw, or null when get() found
   * nothing. Returns {ok:true, lastSentAt} to the winner, {ok:false} to a loser.
   */
  async claimAndSet(phoneNumber, { otp, sessionId, expiresAt, sendMeta }, expectedLastSentAt) {
    const now = new Date();
    const lastSentAt = now.toISOString();
    const row = {
      phone_number: phoneNumber,
      otp: null,                  // never persist the code itself
      otp_hash: hashOtp(otp),
      session_id: sessionId,
      expires_at: new Date(expiresAt).toISOString(),
      attempts: 0,                // a new code gets a fresh guess budget
      last_sent_at: lastSentAt,
      sends_in_window: sendMeta?.sendsInWindow ?? 1,
      window_started_at: (sendMeta?.windowStartedAt ?? now).toISOString(),
    };

    if (expectedLastSentAt) {
      const { data, error } = await supabaseService
        .from('otp_codes')
        .update(row)
        .eq('phone_number', phoneNumber)
        .eq('last_sent_at', expectedLastSentAt)
        .select('phone_number');
      if (error) throw error;
      if (data && data.length > 0) return { ok: true, lastSentAt };
      // 0 rows can mean either "a concurrent request advanced it" (lost) or
      // "the row was deleted under us" (a successful verify, an expiry, or the
      // purge sweep). Those are different, and treating the second as a lost
      // race would tell a user to wait 45s when nothing is actually in flight.
      // Fall through to the insert, which distinguishes them: it succeeds if
      // the row really is gone, and 23505s if someone else holds it.
    }

    const { error } = await supabaseService.from('otp_codes').insert(row);
    if (!error) return { ok: true, lastSentAt };
    if (error.code === '23505') return { ok: false };  // unique_violation — lost the race
    throw error;
  },

  async recordFailedAttempt(phoneNumber, currentAttempts) {
    const next = (currentAttempts ?? 0) + 1;
    await supabaseService
      .from('otp_codes').update({ attempts: next }).eq('phone_number', phoneNumber);
    return next;
  },

  async delete(phoneNumber) {
    await supabaseService.from('otp_codes').delete().eq('phone_number', phoneNumber);
  },
};

/**
 * Server-side send throttle, keyed by phone number.
 *
 * Deliberately per-NUMBER rather than per-IP. Indian mobile carriers use
 * CGNAT, so thousands of unrelated subscribers share one public IP — a per-IP
 * OTP budget gets eaten by strangers and blocks legitimate first-time signups,
 * which is the most likely cause of the production 429s on 2026-08-15. Abuse
 * worth stopping is "this number is being flooded", and that is exactly what
 * this measures.
 *
 * Returns {allowed} or {allowed:false, retryAfterSeconds, message}.
 */
async function checkOtpSendThrottle(existing) {
  if (!existing) return { allowed: true, sendMeta: null };

  const now = Date.now();

  const sinceLast = now - existing.lastSentAt;
  if (existing.lastSentAt && sinceLast < OTP_RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000),
      message: 'An OTP was just sent. Please wait a few seconds before requesting another.',
    };
  }

  // Roll the window forward if it has elapsed, otherwise keep counting in it.
  const windowStartedMs = existing.windowStartedAt.getTime();
  const windowElapsed = now - windowStartedMs >= OTP_SEND_WINDOW_MS;
  if (windowElapsed) {
    return { allowed: true, sendMeta: { sendsInWindow: 1, windowStartedAt: new Date(now) } };
  }

  if (existing.sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
    const resetInSec = Math.ceil((windowStartedMs + OTP_SEND_WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: resetInSec,
      message: 'Too many OTP requests for this number. Please try again later.',
    };
  }

  return {
    allowed: true,
    sendMeta: {
      sendsInWindow: existing.sendsInWindow + 1,
      windowStartedAt: existing.windowStartedAt,
    },
  };
}

// Ceiling on OTPs sent across the WHOLE system per hour.
//
// Per-number throttling cannot see the attack that actually threatens the SMS
// bill: one OTP each to thousands of *different* numbers. Every one of those
// requests is under the per-number cap, so only a global view catches it.
// Counting otp_codes rows works because rows are deleted on successful verify
// — a spray targets numbers nobody will ever verify, so those rows sit there
// until they expire, which is exactly the signal we want.
//
// Set well above real peak signup traffic. If it ever trips in normal use the
// number is too low; raise it rather than leaving it tripping, because a
// tripped breaker blocks legitimate logins too.
//
// Raised 500 -> 20000 on 2026-08-15 to leave generous headroom for a
// marketing-driven signup surge, since a breaker that trips during a campaign
// locks out real customers too.
//
// At this height it is a last-resort sanity limit rather than a meaningful
// cost control: 20000/hour is ~333/min sustained, so the worst-case spend in
// an abused hour is 20000 x the EnableX per-message rate. The protection that
// actually does the work is the per-number cooldown and hourly cap, which stop
// any single number being flooded; this only catches a spray broad enough to
// evade those. Override per-environment via OTP_GLOBAL_HOURLY_CAP.
const OTP_GLOBAL_HOURLY_CAP = Number(process.env.OTP_GLOBAL_HOURLY_CAP || 20000);

async function isGlobalOtpCapExceeded() {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseService
    .from('otp_codes')
    .select('phone_number', { count: 'exact', head: true })
    .gte('last_sent_at', since);
  // Fail OPEN: a counting failure must never block real logins. The whole
  // point of this breaker is cost control, not correctness of auth.
  if (error) return false;
  if ((count ?? 0) >= OTP_GLOBAL_HOURLY_CAP) {
    logError('otp-global-cap', new Error('Global hourly OTP cap reached'), {
      count,
      cap: OTP_GLOBAL_HOURLY_CAP,
    });
    return true;
  }
  return false;
}

// Expired codes are dead weight: one row per distinct phone number ever seen,
// growing forever and slowing every lookup. Purge on an interval rather than
// per-request so a user waiting on an OTP never pays for the cleanup.
async function purgeExpiredOtps() {
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabaseService.from('otp_codes').delete().lt('expires_at', cutoff);
  } catch (err) {
    console.log('[otp-purge] failed:', err.message);
  }
}
setInterval(purgeExpiredOtps, 30 * 60 * 1000).unref?.();

// EnableX Credentials for the SMS/OTP project specifically ("OTP Atrowani").
// Distinct from ENABLEX_APP_ID/ENABLEX_APP_KEY, which belong to a different EnableX project.
const ENABLEX_APP_ID = process.env.ENABLEX_APP_ID_otp_message;
const ENABLEX_APP_KEY = process.env.ENABLEX_APP_KEY_otp_message;

// EnableX SMS project "OTP Atrowani" — Campaign Cloud campaign "OTP astrowani"
const ENABLEX_SMS_CAMPAIGN_ID = '1245560';
const ENABLEX_SMS_TEMPLATE_ID = '463430427'; // "OTP for astrowani" (DLT 1207172007863021380)
const ENABLEX_SMS_SENDER_ID = 'ASTRWI';

// SMS delivery here is INTERMITTENT, not systematically broken. This payload is
// correct — `var1` is the template's variable and it substitutes and delivers.
// Do not "fix" the payload; that has been tried and measured, see below.
//
// 2026-08-18 investigation, and a WRONG conclusion recorded so nobody re-derives
// it. Two sends carrying a real code (09:12, 09:20 UTC) stuck at `sent` and
// never arrived. Three sends whose `data` key did NOT match the template — so
// the message went out still containing the literal `{$var1}` — delivered in
// 1-2s (09:31, 09:33). That looked like proof that the DLT template had been
// registered with `{$var1}` as literal approved TEXT, so only unsubstituted
// messages matched the operator's content check.
//
// It was not. The variable was confounded with TIME: all the failures fell in
// one 13-minute window and all the successes after it. A controlled re-test
// firing both variants CONCURRENTLY had every one delivered, including two
// carrying real codes:
//
//   data {var1:'771001'} -> delivered (SX_SUCCESSFULLY_DELIVERED)
//   data omitted         -> delivered
//   data {var1:'771002'} -> delivered
//
// Independent corroboration: `customers` and `astrologers` both hold rows for
// +917877724833 created on 2026-08-18, and a row cannot exist without a
// successful OTP verify — so real codes were being delivered and used the same
// day, both before and after that window.
//
// The real behaviour to design around is therefore a transient delivery failure
// (carrier/operator congestion), not a content mismatch. That is what the
// retry/backoff in verifyEnxDelivery is for: it polls to a terminal status
// instead of declaring failure at 20s, so an intermittent stall is visible in
// the logs as exactly that rather than being misread as a systematic fault —
// which is precisely the mistake made above.
//
// `role` (customer vs vendor) does NOT affect this payload at all; it only
// selects which table the account-existence check reads. Both apps send an
// identical SMS, so "works in one app but not the other" can never be explained
// by anything in this block.

// Referral codes — 7 chars, excludes visually-ambiguous characters (0/O, 1/I).
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Validates and normalizes a phone number for actually SENDING an SMS.
 * Returns a `+91XXXXXXXXXX` E.164 string, or null if the input cannot
 * confidently be turned into one — the caller must refuse to send rather than
 * guess, because a wrong-but-plausible-looking number either bounces silently
 * at the carrier or (worse) reaches a real person who isn't the customer.
 *
 * Replaces a previous `toE164` whose fallback for anything that wasn't
 * exactly-10-plain-digits was `'+' + digits` — accepting literally any digit
 * string. Reported 2026-08-16 as "OTP works for my number, not my friend's":
 * both apps' phone fields only ever checked "at least 10 characters long", so
 * a pasted country code, a leading landline-style 0, or a stray character all
 * slipped through as a plausible-looking but wrong number, and EnableX/the
 * carrier then either rejected it or queued it and silently never delivered
 * — indistinguishable, from the app's side, from a real send.
 *
 * Handles the three common ways a legitimate 10-digit Indian mobile number
 * arrives mangled: pasted with the country code (12 digits, "91" prefix),
 * typed with a leading landline-style 0 (11 digits), or with stray
 * formatting characters (spaces, dashes, parens) that a plain \D strip
 * already removes. Anything else — too short, too long, doesn't start with
 * 6-9 after normalization — is rejected rather than sent anyway.
 */
function toE164Strict(phoneNumber) {
  const digits = normalizePhone(phoneNumber);
  return digits ? `+91${digits}` : null;
}

/**
 * THE canonical form of a phone number everywhere in this system: bare 10
 * digits, no country code, no punctuation. Returns null if the input cannot
 * confidently be turned into one.
 *
 * WHY THIS EXISTS (audit 2026-08-18). toE164Strict was previously the only
 * normalizer, and it was applied ONLY to the EnableX `to:` field. The raw
 * request-body string was still what keyed everything that establishes
 * *identity*:
 *
 *   - otp_codes.phone_number   (primary key, and therefore the throttle key)
 *   - customers.mobile         (both the lookup and the insert)
 *   - astrologers.phone_number (via the JWT `phone` claim -> /api/vendor/register)
 *   - the `phone` claim in every issued JWT
 *
 * Both apps accept 10, 11 or 12 digits, so "9876543210", "09876543210" and
 * "919876543210" all text the same handset but were three different *people*
 * as far as the database was concerned. Verified in production: a real
 * customer stored as "+919119395097" got 404 NO_ACCOUNT (and therefore no SMS
 * at all, ever) when they typed their number normally, and one astrologer had
 * two separate accounts under "8600638210" and "918600638210".
 *
 * Ten bare digits is the canonical form rather than E.164 because 44 of the 48
 * account rows already in production are in that shape, so it is the form that
 * requires the least migration. toE164Strict is now derived from this, which
 * keeps the two definitions from drifting apart again.
 *
 * Normalizing at the two OTP endpoints is sufficient to fix the whole chain:
 * every downstream identity write draws either from the verify lookup or from
 * the JWT claim minted there, so there is no second write path.
 */
function normalizePhone(phoneNumber) {
  let digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

// EnableX accepting a send (result:0 + job_id) only means it was queued — the
// carrier can still fail it afterwards (DND, invalid number, operator drop).
// Poll the job until it reaches a terminal state and log the outcome, so a "the
// OTP never arrived" report can actually be traced to a cause instead of
// guessing. Deliberately fire-and-forget: never blocks or fails the OTP
// response, and never throws into the request path.
//
// STATUS SEMANTICS — from EnableX's published spec, re-read and confirmed
// against live API responses on 2026-08-18:
//
//   sent      Message accepted and queued for delivery. An ordinary IN-FLIGHT
//             state, NOT a failure. Indian carrier delivery receipts routinely
//             take longer than a few seconds to come back.
//   delivered Reached the handset. Terminal success.
//   failed    Terminal failure; error_code / error_des carry the reason.
//   unknown   The carrier never returned a final status.
//
// THE BUG THIS REPLACES (found 2026-08-18). This polled exactly ONCE, 20s after
// sending, and treated anything that was not yet `delivered` as a delivery
// failure — so a message merely still in flight at the 20s mark was logged as
// "SMS not delivered" and had its send refunded. Two consequences, both real:
//
//   1. It poisoned the ONLY signal we have for answering "did this user's OTP
//      actually arrive?". The log filled with failures that were not failures —
//      which is exactly how a genuine non-delivery was misread as a carrier
//      fault during this very audit, from our own log line.
//   2. The refund fired on sends that had not failed, so `sends_in_window`
//      under-counted and a number could quietly exceed OTP_MAX_SENDS_PER_WINDOW.
//
// Now: poll on a backoff until a terminal status, and only refund on an outcome
// the user demonstrably could not use — an explicit `failed`, or a code still
// undelivered by the time it is too stale to be worth typing.
const ENX_DELIVERY_POLLS_MS = [20000, 60000, 150000]; // last poll is still inside OTP_TTL_MS

function verifyEnxDelivery(jobId, e164, authHeader, refund, schedule = ENX_DELIVERY_POLLS_MS) {
  const settle = async (reason, detail, summary) => {
    logError('enablex-sms', new Error(`SMS not delivered: ${reason}`), {
      phone: e164,
      jobId,
      status: detail?.status,
      errorCode: detail?.error_code,
      errorDesc: detail?.error_des,
      summary,
    });
    // The user never got a usable code — don't spend their send budget on it.
    // Without this, a run of real delivery failures is precisely what pushes
    // someone into the lockout described at OTP_MAX_SENDS_PER_WINDOW.
    if (refund) {
      const refunded = await refund();
      console.log(`[enablex-sms] send-budget refund for ${e164}: ${refunded ? 'applied' : 'skipped (row changed or gone)'}`);
    }
  };

  const poll = (index) => {
    setTimeout(async () => {
      let detail;
      let summary;
      try {
        // Documented path is SINGULAR /message/{job_id}; the plural form is the
        // send collection and answers "Invalid job id" without one.
        const { data } = await axios.get(`https://api.enablex.io/sms/v1/message/${jobId}`, {
          headers: { Authorization: `Basic ${authHeader}` },
          timeout: 15000,
        });
        detail = data?.detailed?.[0] || {};
        summary = data?.summary;
      } catch (err) {
        // Status lookup is diagnostics only — its failure must stay silent-ish,
        // and must not be mistaken for the SMS itself failing. Retry on the
        // next tick if there is one.
        console.log(`[enablex-sms] status check failed for job ${jobId}: ${err.message}`);
        if (index + 1 < schedule.length) poll(index + 1);
        return;
      }

      if (detail.status === 'delivered') {
        console.log(`[enablex-sms] delivered ${e164} (job ${jobId})`);
        return;
      }

      if (detail.status === 'failed') {
        // Terminal, and the carrier told us why — no point waiting longer.
        await settle(detail.error_des || 'failed', detail, summary);
        return;
      }

      // 'sent' or 'unknown' — still inconclusive. Wait for a later poll rather
      // than declaring a failure that has not happened.
      if (index + 1 < schedule.length) {
        poll(index + 1);
        return;
      }

      // Out of polls. The code is now too old to be worth typing, so whatever
      // the carrier eventually decides, this one did not reach the user in time.
      // Logged as a distinct reason from `failed` so the two stay tellable apart.
      //
      // Distinguish "never dispatched" from "dispatched, no receipt". These read
      // identically in `detail` (both leave status empty), and conflating them
      // actively misled a live investigation on 2026-08-20: an exhausted SMS
      // credit balance was logged as "no delivery receipt after 150s", which
      // reads like a slow carrier and sent the diagnosis toward the network
      // instead of the account. The summary counters are what tell them apart —
      // a real in-flight message has sent >= 1 and credit_used >= 1.
      const neverDispatched = summary
        && Number(summary.total) === 0
        && Number(summary.sent) === 0
        && Number(summary.failed) === 0
        && Number(summary.credit_used) === 0;
      const reason = neverDispatched
        ? 'never dispatched by the provider (0 sent, 0 credits used) — SMS credit balance is likely exhausted'
        : `no delivery receipt after ${Math.round(schedule[schedule.length - 1] / 1000)}s (last status: ${detail.status || 'none'})`;
      await settle(reason, detail, summary);
    }, schedule[index]).unref?.();
  };

  poll(0);
}

// Google Play reviewer test account (both apps) — real phone+SMS OTP login is
// unreviewable as-is: a reviewer has no way to receive the SMS, and even if they did,
// the 5-minute OTP expiry routinely lapses before a reviewer actually gets to the login
// screen. This one fixed number always gets a fixed OTP with no real SMS sent and a long
// expiry.
//
// Customer app: skips the normal "must already have an account to log in" gate below —
// its customers row is auto-created on first successful verify, same as any brand-new
// signup, so no DB seeding is needed for that side.
//
// Vendor app: astrologer accounts are NEVER auto-created on verify (they require the
// full Registration flow) — so this fixed OTP alone is not enough on its own. A real
// astrologers row for this exact phone number must be pre-seeded via
// sql/play_store_reviewer_astrologer.sql (run once in the Supabase SQL editor) so
// verify's existing-astrologer lookup actually finds something and logs the reviewer
// straight into the dashboard.
const PLAY_STORE_REVIEWER_PHONE = '9999999999';
const PLAY_STORE_REVIEWER_OTP = '123456';

/**
 * Endpoint to request an OTP
 */
app.post('/api/users/mobile-otp-request', async (req, res) => {
  const { phoneNumber: rawPhoneNumber, role, intent } = req.body;

  if (!rawPhoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  // Canonicalize ONCE, here, and use the result for everything below — the OTP
  // row key, the throttle key, the account lookup, and the JWT that verify will
  // later mint. Before this, the raw string was used for all of those while only
  // the SMS itself was normalized, so the same handset could be several
  // different accounts depending on how the number was typed. See normalizePhone.
  const phoneNumber = normalizePhone(rawPhoneNumber);

  // Fail fast and cheaply on a malformed number — before it can consume this
  // number's throttle budget or reach EnableX at all. Reported 2026-08-16:
  // "OTP works for my number but not for my friend's" — the most likely
  // explanation for a report shaped exactly like that (one specific number
  // fails, everything else about the flow works) is the number itself being
  // entered wrong: a pasted country code, a leading landline-style 0, or a
  // stray character. Both apps' phone fields only ever checked "is this at
  // least 10 characters", so any of those slipped straight through to
  // EnableX, which either rejects it (visible) or queues it and never
  // delivers (silent — indistinguishable from a working send). This does not
  // apply to the reviewer bypass just below: PLAY_STORE_REVIEWER_PHONE is
  // itself a well-formed 10-digit number, so it passes normalizePhone on its
  // own and no longer needs to be special-cased out of this check.
  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PHONE_NUMBER',
      message: 'That does not look like a valid 10-digit Indian mobile number. Please check it and try again.',
    });
  }

  if (phoneNumber === PLAY_STORE_REVIEWER_PHONE) {
    await otpStore.set(phoneNumber, {
      otp: PLAY_STORE_REVIEWER_OTP,
      sessionId: Date.now().toString(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days — reviewers can take a while
    });
    console.log(`[reviewer-otp] Fixed OTP issued for Play Store reviewer number ${phoneNumber}`);
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      result: { Details: Date.now().toString() },
    });
  }

  // Login must not silently create an account, and signup must not silently log an
  // existing user in — both would send an OTP either way, hiding the actual problem.
  // Only enforced when the caller explicitly says which flow this is (`intent`); callers
  // that don't send it keep the old permissive (either-is-fine) behavior.
  if (intent === 'login' || intent === 'signup') {
    const table = role === 'astrologer' || role === 'vendor' ? 'astrologers' : 'customers';
    const idColumn = table === 'astrologers' ? 'phone_number' : 'mobile';
    const selectCols = table === 'astrologers' ? 'id, approval_status, is_suspended' : 'id';
    const { data: existingRows } = await supabase.from(table).select(selectCols).eq(idColumn, phoneNumber);
    // Admin "delete" soft-deletes astrologers with session/earnings history by setting
    // approval_status='rejected' + is_suspended=true together (see DELETE
    // /api/admin/astrologers/:id) — that specific combination means the account is meant
    // to be gone from the product's perspective, so it must not block the phone number
    // from signing up again. A plain suspension alone (is_suspended without the reject)
    // still counts as an existing account.
    const isSoftDeleted = (row) => table === 'astrologers' && row.approval_status === 'rejected' && row.is_suspended === true;
    const existing = (existingRows || []).filter((row) => !isSoftDeleted(row));
    const accountExists = existing.length > 0;

    if (intent === 'login' && !accountExists) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACCOUNT',
        message: 'No account found for this number. Please sign up first.',
      });
    }
    if (intent === 'signup' && accountExists) {
      return res.status(409).json({
        success: false,
        code: 'ACCOUNT_EXISTS',
        message: 'An account already exists for this number. Please log in instead.',
      });
    }
  }

  // Server-side send throttle. The 60s cooldown in both apps is UI only and is
  // bypassed by calling this endpoint directly, so the real limit has to live
  // here. Runs after the reviewer short-circuit above (that path returns early
  // and is intentionally exempt) and before any SMS is billed.
  const existingOtpRow = await otpStore.get(phoneNumber);
  const throttle = await checkOtpSendThrottle(existingOtpRow);
  if (!throttle.allowed) {
    res.set('Retry-After', String(throttle.retryAfterSeconds));
    return res.status(429).json({
      success: false,
      code: 'OTP_THROTTLED',
      retryAfterSeconds: throttle.retryAfterSeconds,
      message: throttle.message,
    });
  }

  // Cost circuit-breaker for the spray attack the per-number cap cannot see.
  if (await isGlobalOtpCapExceeded()) {
    return res.status(503).json({
      success: false,
      code: 'OTP_TEMPORARILY_UNAVAILABLE',
      message: 'We are unable to send OTPs right now. Please try again shortly.',
    });
  }

  // Generate a 6-digit OTP.
  // crypto.randomInt, not Math.random: Math.random is a non-cryptographic PRNG
  // whose internal state can be recovered from observed outputs, which for a
  // credential means OTPs become predictable without ever seeing the SMS.
  const otp = String(crypto.randomInt(100000, 1000000));
  const sessionId = Date.now().toString(); // Simple session ID

  // Store the OTP (hashed — see otpStore) with the rolling send counters.
  // Atomic claim — see otpStore.claimAndSet. checkOtpSendThrottle above is a
  // read-then-write and cannot, on its own, stop two simultaneous requests for
  // the same number from both passing it.
  // claimAndSet THROWS on an unexpected DB error (unlike the old fire-and-forget
  // upsert, which swallowed everything). This handler has no outer try/catch, so
  // an uncaught rejection here would leave the request hanging with no response
  // at all — the customer app has a 20s timeout and the vendor app 20s, but the
  // user still sits on a dead spinner until then, which is the exact failure
  // mode this audit exists to remove. Fail loudly and quickly instead.
  let claim;
  try {
    claim = await otpStore.claimAndSet(
      phoneNumber,
      { otp, sessionId, expiresAt: Date.now() + OTP_TTL_MS, sendMeta: throttle.sendMeta },
      existingOtpRow?.lastSentAtRaw || null,
    );
  } catch (err) {
    logError('otp-claim', err instanceof Error ? err : new Error(JSON.stringify(err)), { phone: phoneNumber });
    return res.status(503).json({
      success: false,
      message: 'Could not send the OTP right now. Please try again in a moment.',
    });
  }

  if (!claim.ok) {
    // Another request for this same number is already sending a code. Answering
    // with the normal throttle shape is the honest outcome: an OTP genuinely is
    // on its way, and both apps already adopt retryAfterSeconds into their
    // resend countdown. Critically, we do NOT send a second SMS — that is the
    // whole bug, since the upsert would leave the first-arriving code dead.
    const retryAfterSeconds = Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      code: 'OTP_THROTTLED',
      retryAfterSeconds,
      message: 'An OTP was just sent. Please wait a few seconds before requesting another.',
    });
  }

  const sentAt = claim.lastSentAt;

  // The code itself is deliberately NOT logged. It was previously printed in
  // full, which put live credentials into PM2 logs (and anywhere those get
  // shipped) for anyone with server or log access to read and use.
  console.log(`Generated OTP for ${phoneNumber} (role: ${role || 'unspecified'}, intent: ${intent || 'unspecified'}, session: ${sessionId})`);

  // Send the OTP, with automatic failover between providers (src/smsProviders.js).
  //
  // Was a single inline EnableX call. On 2026-08-20 OTP delivery stopped, and the
  // investigation showed the cause was NOT in this codebase — a message sent from
  // EnableX's own dashboard, with our backend entirely out of the loop, failed
  // identically. The real defect was that one provider going quiet took down
  // login and signup for both apps with no alternative route. sendOtpSms tries
  // the primary, confirms it actually DISPATCHED (acceptance is not dispatch —
  // that outage returned result:0 with a job id and every counter zero), and
  // falls through to a second provider when it can prove the first did nothing.
  //
  // The same `otp` goes to every provider on purpose: only one code is stored,
  // so issuing a fresh one per provider would risk the first SMS to arrive being
  // the dead one.
  if (smsProviders.enablexConfigured()) {
    const result = await smsProviders.sendOtpSms(toE164Strict(phoneNumber), otp, logError);

    if (!result.ok) {
      logError('otp-sms', new Error('Every SMS provider failed to send the OTP'), {
        phone: toE164Strict(phoneNumber),
        attempts: result.attempts,
      });
      // Roll the stored code back — telling the app it was sent when it was not
      // is what made the 2026-08-20 outage look random instead of like an outage.
      await otpStore.delete(phoneNumber);
      // HTTP 200 with success:false, NOT a 5xx — deliberate, and load-bearing.
      // backend.astrowani.com sits behind Cloudflare (confirmed: `Server:
      // cloudflare`), which REPLACES the body of any 5xx from the origin with
      // its own "error code: 502" page. The first version of this returned 502
      // and the apps showed a bare "something went wrong": axios threw, and
      // `error.response.data.message` did not exist because Cloudflare had
      // discarded our JSON. The explanation never reached the user.
      //
      // Both apps already branch on `res.data.success` and display
      // `res.data.message` when it is false (see Login.js in each app), so a
      // 200 carrying success:false is the one shape guaranteed to surface the
      // real reason through the CDN. Do not "fix" this back to a 5xx.
      return res.status(200).json({
        success: false,
        code: 'OTP_SEND_FAILED',
        message: 'We could not send the OTP right now. Our SMS provider is not delivering messages at the moment. Please try again shortly.',
      });
    }

    console.log(`OTP SMS sent via ${result.provider} for ${toE164Strict(phoneNumber)} (id: ${result.id})`);

    // Acceptance is still not DELIVERY. Confirm the carrier actually delivered it
    // and log the outcome, so a "no OTP arrived" report can be traced to a cause
    // instead of guessed at. Fire-and-forget: never delays the OTP response.
    // Only EnableX exposes a job-status API we poll; a fallback send is left to
    // its own provider's reporting.
    if (result.provider === 'enablex') {
      verifyEnxDelivery(
        result.id,
        toE164Strict(phoneNumber),
        Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64'),
        () => otpStore.refundSend(phoneNumber, sentAt),
      );
    }
  } else {
    console.log('EnableX keys not configured. Skipping actual SMS sending. OTP is:', otp);
  }

  // Return success to the app
  return res.status(200).json({
    success: true,
    message: 'OTP sent successfully',
    result: {
      Details: sessionId, // This maps to response.data.result.Details in Login.js
    }
  });
});

/**
 * Endpoint to verify an OTP
 */
app.post('/api/users/mobile-otp-verify', async (req, res) => {
  // `termsAccepted` tells us the account came from the Register screen's explicit
  // checkbox rather than the Login screen's passive notice. It is a label only —
  // the timestamp itself is stamped server-side (see termsAcceptanceFields).
  const { phoneNumber: rawPhoneNumber, otp, fcmToken, role, referralCode, termsAccepted } = req.body;

  if (!rawPhoneNumber || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
  }

  // Same canonicalization as the request endpoint — this is what makes the
  // account lookup below and the JWT `phone` claim consistent regardless of how
  // the number was typed. See normalizePhone.
  const phoneNumber = normalizePhone(rawPhoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PHONE_NUMBER',
      message: 'That does not look like a valid 10-digit Indian mobile number. Please check it and try again.',
    });
  }

  const otpKey = phoneNumber;
  const storedData = await otpStore.get(phoneNumber);

  if (!storedData) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this number' });
  }

  if (Date.now() > storedData.expiresAt) {
    await otpStore.delete(otpKey);
    return res.status(400).json({ success: false, message: 'OTP has expired' });
  }

  // Burn the code once the guess budget is spent. Without this the endpoint
  // counted nothing: a wrong OTP left the code live, so all 1,000,000 six-digit
  // combinations could be ground down with concurrent requests inside the
  // 5-minute window. The attempt cap — not the HTTP rate limiter — is what
  // actually makes a short numeric OTP safe, because it is keyed to the code
  // rather than to the caller's IP (which CGNAT makes meaningless anyway).
  if (storedData.attempts >= OTP_MAX_ATTEMPTS) {
    await otpStore.delete(otpKey);
    return res.status(429).json({
      success: false,
      code: 'OTP_ATTEMPTS_EXCEEDED',
      message: 'Too many incorrect attempts. Please request a new OTP.',
    });
  }

  // New rows store only the HMAC; `otp` is populated solely on rows written by
  // the previous code path, so keep that comparison alive for codes already in
  // flight across the deploy. Both sides use a constant-time compare.
  const submitted = String(otp).trim();
  const matches = storedData.otpHash
    ? safeEqualHex(storedData.otpHash, hashOtp(submitted))
    : storedData.otp === submitted;

  if (!matches) {
    const used = await otpStore.recordFailedAttempt(otpKey, storedData.attempts);
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - used);
    if (remaining === 0) {
      await otpStore.delete(otpKey);
      return res.status(429).json({
        success: false,
        code: 'OTP_ATTEMPTS_EXCEEDED',
        message: 'Too many incorrect attempts. Please request a new OTP.',
      });
    }
    return res.status(400).json({
      success: false,
      code: 'OTP_INVALID',
      attemptsRemaining: remaining,
      message: `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    });
  }

  // OTP is valid!
  await otpStore.delete(otpKey); // Clear OTP after successful use

  const isVendor = role === 'astrologer' || role === 'vendor';
  let supabaseCustomerId = null;
  try {
    if (isVendor) {
      // Vendors are never auto-created here — an astrologer account needs the full
      // Registration form (specialties, experience, etc.), which runs *after* this verify
      // succeeds for a brand-new number. Login-time verify just looks up the existing row.
      const { data: astroList, error } = await supabaseService
        .from('astrologers')
        .select('id')
        .eq('phone_number', phoneNumber)
        .limit(1);
      if (error) throw error;
      if (astroList && astroList.length > 0) {
        supabaseCustomerId = astroList[0].id;
        if (fcmToken) {
          const { error: updateError } = await supabaseService
            .from('astrologers').update({ fcm_token: fcmToken }).eq('id', supabaseCustomerId);
          if (updateError) console.error('Failed to update astrologer fcm_token:', updateError.message);
        }
      }
      // else: no row yet (signup) — leave supabaseCustomerId null, app completes
      // registration next and gets a real token from that step instead.
    } else {
      // Look up or create the customer in Supabase to get the real UUID.
      // Uses the service-role client so this write can't be silently blocked by RLS.
      const { data: customersList, error } = await supabaseService
        .from('customers')
        .select('id, name')
        .eq('mobile', phoneNumber)
        .limit(1);

      if (error) throw error;

      if (customersList && customersList.length > 0) {
        supabaseCustomerId = customersList[0].id;
        if (fcmToken) {
          const { error: updateError } = await supabaseService
            .from('customers').update({ fcm_token: fcmToken }).eq('id', supabaseCustomerId);
          if (updateError) console.error('Failed to update customer fcm_token:', updateError.message);
        }
      } else {
        // Create a new customer row — gets their own referral code to share, and (if they
        // signed up using someone else's code) a pending referral row. The referrer isn't
        // rewarded yet — that happens once this new customer completes their first session
        // (see sessionManager.js's maybeRewardReferral), not just for signing up.
        let referrerId = null;
        if (referralCode) {
          const { data: referrerRow } = await supabaseService
            .from('customers').select('id').eq('referral_code', String(referralCode).toUpperCase()).limit(1).maybeSingle();
          referrerId = referrerRow?.id || null;
        }

        // Account creation IS the acceptance point for a customer: both the
        // Register screen (explicit checkbox) and the Login screen (the "By
        // signing up, you agree…" notice above the button) lead here. The source
        // column keeps the two distinguishable, because they are not equally
        // strong evidence.
        const { data: newCustomer, error: insertError } = await insertAccountRow(
          'customers',
          {
            mobile: phoneNumber,
            wallet_balance: 0,
            fcm_token: fcmToken || null,
            referral_code: generateReferralCode(),
          },
          termsAccepted ? 'signup_form' : 'login_notice',
        );
        if (insertError) throw insertError;
        supabaseCustomerId = newCustomer?.id;

        if (referrerId && supabaseCustomerId && referrerId !== supabaseCustomerId) {
          await supabaseService.from('referrals').insert([{
            referrer_customer_id: referrerId,
            referred_customer_id: supabaseCustomerId,
            referral_code: String(referralCode).toUpperCase(),
            status: 'pending',
          }]);
        }
      }
    }
  } catch (e) {
    console.error('Could not look up/create Supabase account:', e.message);
  }

  // Generate JWT token with the real Supabase UUID
  const token = jwt.sign(
    { id: supabaseCustomerId || `user_${Date.now()}`, userId: supabaseCustomerId, phone: phoneNumber, role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  console.log(`User ${phoneNumber} logged in successfully. Supabase ID: ${supabaseCustomerId}`);

  // Return token to the app
  return res.status(200).json({
    success: true,
    message: 'OTP verified successfully',
    token: token,
    user: { id: supabaseCustomerId || `user_${Date.now()}`, phoneNumber, role }
  });
});

/**
 * Endpoint for Email OTP Request (Placeholder)
 */
app.post('/api/users/login-with-email', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Email OTP flow not fully implemented in this backend yet',
  });
});

app.get('/', (req, res) => {
  res.send('Astrowani Backend API is running!');
});

// Cheap, unauthenticated liveness check — polled by .github/workflows/uptime-check.yml.
// Deliberately does no DB round-trip: this must answer even if Supabase itself is having
// problems, so a slow/failing DB doesn't look identical to "the whole VPS is down."
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

// ==========================================
// MOCK ENDPOINTS TO PREVENT 404 CRASHES
// ==========================================

// Whether a customer row has the core profile fields filled (hand/palm photo excluded).
function customerProfileComplete(row) {
  if (!row) return false;
  const s = (v) => (v == null ? '' : String(v)).trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(row.email));
  return !!(s(row.name) && emailOk && s(row.gender) && s(row.dob) && s(row.place_of_birth));
}

// Whether an astrologer's core profile is complete: full name, valid email, gender,
// experience, profile photo, at least one language, and at least one per-minute charge.
function astrologerProfileComplete(row) {
  if (!row) return false;
  const s = (v) => (v == null ? '' : String(v)).trim();
  const name = (s(row.first_name) + ' ' + s(row.last_name)).trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(row.email));
  const hasPhoto = !!(s(row.profile_image) || s(row.profile_pic_url));
  const langs = row.languages || row.language;
  const hasLang = Array.isArray(langs) ? langs.length > 0 : !!s(langs);
  const expOk = Number(row.experience) > 0;
  const hasCharge =
    Number(row.chat_charge_per_minute) > 0 ||
    Number(row.call_charge_per_minute) > 0 ||
    Number(row.video_charge_per_minute) > 0;
  return !!(name && emailOk && s(row.gender) && expOk && hasPhoto && hasLang && hasCharge);
}

// An astrologer shows in the customer app only when admin-approved, not suspended,
// AND profile-complete. New signups (approval_status='pending') and half-filled
// profiles therefore stay hidden until both gates pass.
function astrologerVisibleToCustomers(row) {
  return (
    row &&
    row.approval_status === 'approved' &&
    row.is_suspended !== true &&
    astrologerProfileComplete(row)
  );
}

// Maps a customers row to the profile shape the app consumes.
function toProfile(row, decoded = {}) {
  return {
    id: row?.id || decoded.userId || decoded.id || null,
    name: row?.name || 'User',
    email: row?.email || '',
    phone: row?.mobile || decoded.phone || '',
    gender: row?.gender || '',
    dob: row?.dob || '',
    timeOfBirth: row?.time_of_birth || '',
    placeOfBirth: row?.place_of_birth || '',
    state: row?.state || '',
    maritalStatus: row?.marital_status || '',
    profilePic: row?.profile_image || '',
    handPic: row?.hand_image || '',
    isProfileComplete: customerProfileComplete(row),
    freeBotChatCredited: !!row?.free_bot_chat_credited_at,
  };
}

// Resolves the customer row for the request's JWT (by phone, then UUID).
async function getCustomerRowFromReq(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return { decoded: null, row: null };
  const token = authHeader.replace('Bearer ', '');
  const decoded = jwt.verify(token, JWT_SECRET);
  const userId = decoded.userId || decoded._id || decoded.id;
  let row = null;
  if (decoded.phone) {
    const { data } = await supabase.from('customers').select('*').eq('mobile', decoded.phone).limit(1);
    if (data && data.length > 0) row = data[0];
  }
  if (!row && String(userId).includes('-')) {
    const { data } = await supabase.from('customers').select('*').eq('id', userId).single();
    if (data) row = data;
  }
  return { decoded, row };
}

// User Profile — read
app.get('/api/users/profile', async (req, res) => {
  try {
    const { decoded, row } = await getCustomerRowFromReq(req);
    return res.status(200).json({ success: true, data: toProfile(row, decoded) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// User Profile — update. Writes every customer-entered field to the customers row.
app.put('/api/users/profile', async (req, res) => {
  try {
    const { decoded, row } = await getCustomerRowFromReq(req);
    if (!row || !row.id) return res.status(404).json({ success: false, message: 'Customer not found' });

    const b = req.body || {};
    const upd = {};
    // Accept both flat + legacy shapes the app may send.
    if (b.name != null || b.firstName != null) upd.name = (b.name ?? b.firstName) || null;
    if (b.email != null) upd.email = b.email || null;
    if (b.gender != null) upd.gender = b.gender || null;
    if (b.dob != null || b.dateOfBirth != null) {
      const d = b.dob ?? b.dateOfBirth;
      upd.dob = d ? new Date(d).toISOString().split('T')[0] : null;
    }
    if (b.timeOfBirth != null || b.time_of_birth != null) upd.time_of_birth = (b.timeOfBirth ?? b.time_of_birth) || null;
    if (b.placeOfBirth != null || b.place_of_birth != null || b.city != null) {
      upd.place_of_birth = (b.placeOfBirth ?? b.place_of_birth ?? b.city) || null;
    }
    if (b.state != null) upd.state = b.state || null;
    if (b.maritalStatus != null || b.marital_status != null) upd.marital_status = (b.maritalStatus ?? b.marital_status) || null;
    if (b.profilePic != null || b.profile_image != null) upd.profile_image = (b.profilePic ?? b.profile_image) || null;
    if (b.handPic != null || b.hand_image != null) upd.hand_image = (b.handPic ?? b.hand_image) || null;

    const { data, error } = await supabase
      .from('customers').update(upd).eq('id', row.id).select('*').single();
    if (error) throw error;
    return res.status(200).json({ success: true, data: toProfile(data, decoded) });
  } catch (err) {
    console.error('PUT /api/users/profile error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Reads a single app_settings value, falling back to `fallback` if missing/error.
async function getSetting(key, fallback) {
  try {
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', key).limit(1);
    if (data && data.length && data[0].value != null) return data[0].value;
  } catch (_) {}
  return fallback;
}

// Banners — admin-authored (table `banners`), shape preserved for both apps.
// `?app=customer|vendor` returns banners targeted at that app plus any 'both';
// no param returns all active (back-compat). `?placement=` selects which slot
// (home_primary, home_secondary, chat_top, video_top, call_top, ...) — defaults
// to 'home_primary' so existing callers that don't pass it keep working.
// `intervalSeconds` is the admin-set rotation interval (default 4s).
app.get('/api/banners/all', async (req, res) => {
  try {
    const app_ = req.query.app;
    const language = req.query.language;
    const placement = req.query.placement || 'home_primary';
    // Admin-edited, hit on nearly every Home load — cache per (app, language,
    // placement) combination. See src/contentCache.js.
    const cacheKey = `banners:${app_ || 'all'}:${language || 'all'}:${placement}`;
    const payload = await contentCache.get(cacheKey, async () => {
      let bannerQuery = supabase
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .eq('placement', placement)
        .order('sort_order', { ascending: true });
      if (app_ === 'customer' || app_ === 'vendor') {
        bannerQuery = bannerQuery.or(`app.eq.${app_},app.eq.both`);
      }
      if (language === 'english' || language === 'hindi') {
        bannerQuery = bannerQuery.or(`language.eq.${language},language.eq.both`);
      }
      const [{ data, error }, intervalRaw] = await Promise.all([
        bannerQuery,
        getSetting('banner_interval_seconds', '4'),
      ]);
      if (error) throw error;
      const intervalSeconds = Math.max(1, Number(intervalRaw) || 4);
      return {
        intervalSeconds,
        data: (data || []).map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          imageUrl: b.image,
          link: b.link,
          placement: b.placement,
          actionType: b.action_type,
          actionValue: b.action_value,
          hindi: { title: b.title_hi || b.title, description: b.description_hi || b.description },
        })),
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/banners/all error:', err.message);
    return res.status(200).json({ data: [], intervalSeconds: 4 });
  }
});

// Live Aarti / Pooja stream — admin-set YouTube URL (app_settings key
// live_aarti_youtube_url, see sql/live_aarti_schema.sql). Returns {url: null}
// when unset so the customer app hides the section entirely rather than
// showing an empty/placeholder player.
app.get('/api/live-aarti', async (req, res) => {
  try {
    const url = await contentCache.get('live-aarti:url', async () => {
      const raw = await getSetting('live_aarti_youtube_url', '');
      return raw && raw.trim() ? raw.trim() : null;
    });
    return res.status(200).json({ url });
  } catch (err) {
    console.error('GET /api/live-aarti error:', err.message);
    return res.status(200).json({ url: null });
  }
});

// Every Aarti/Pooja channel that is live RIGHT NOW — the app shows all of them
// in a horizontal scroller, so this deliberately returns a list with no
// ranking. Served from the cached state the poller writes
// (src/liveAarti.js), never by calling YouTube inline: opening Home must not
// wait on, or spend API quota against, a third party.
//
// `fallbackUrl` is the old single admin-set URL. The app uses it only when
// nothing is live, which keeps the previous behaviour working for anyone who
// has set it.
app.get('/api/live-aarti/live', async (req, res) => {
  try {
    const payload = await contentCache.get('live-aarti:live', async () => {
      const { data, error } = await supabase
        .from('live_aarti_channels')
        .select('id, name, live_video_id, live_title, live_thumbnail, is_embeddable')
        .eq('is_enabled', true)
        .eq('is_live', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      const channels = (data || [])
        .filter((c) => c.live_video_id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          videoId: c.live_video_id,
          title: c.live_title || '',
          thumbnail: c.live_thumbnail || '',
          // false => the channel forbids embedding, so the app must offer
          // "Watch on YouTube" instead of a player that renders black.
          embeddable: c.is_embeddable !== false,
        }));

      const raw = await getSetting('live_aarti_youtube_url', '');
      return { channels, fallbackUrl: raw && raw.trim() ? raw.trim() : null };
    });
    return res.status(200).json(payload);
  } catch (err) {
    // The table may not exist yet (migration not run). Degrade to "nothing
    // live" rather than 500-ing the Home screen.
    console.error('GET /api/live-aarti/live error:', err.message);
    return res.status(200).json({ channels: [], fallbackUrl: null });
  }
});

// "We're not there yet" popup shown on Remedies' Place Order (fulfillment
// isn't live — see RemedyShop.js). Admin-editable text, app_settings keys
// remedy_unavailable_title / remedy_unavailable_message, see
// sql/remedy_unavailable_popup_schema.sql. Defaults here match that seed in
// case the migration hasn't been run yet.
app.get('/api/remedy-unavailable-popup', async (req, res) => {
  try {
    const payload = await contentCache.get('remedy-unavailable-popup:text', async () => {
      const [title, message] = await Promise.all([
        getSetting('remedy_unavailable_title', "We're not there yet"),
        getSetting(
          'remedy_unavailable_message',
          "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.",
        ),
      ]);
      return { title, message };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/remedy-unavailable-popup error:', err.message);
    return res.status(200).json({
      title: "We're not there yet",
      message: "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.",
    });
  }
});

// Thought of the Day — latest active row (table `thoughts`).
app.get('/api/thoughts/latest', async (req, res) => {
  try {
    const payload = await contentCache.get('thoughts:latest', async () => {
      const { data } = await supabase
        .from('thoughts')
        .select('text, author, text_hi, author_hi')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      const latest = data && data[0];
      return {
        thoughtText: latest?.text || 'Welcome to Astrowani!',
        author: latest?.author || '',
        hindi: {
          thoughtText: latest?.text_hi || latest?.text || 'एस्ट्रोवाणी में आपका स्वागत है!',
          author: latest?.author_hi || latest?.author || '',
        },
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/thoughts/latest error:', err.message);
    return res.status(200).json({ thoughtText: 'Welcome to Astrowani!' });
  }
});

// Categories — admin-authored (table `categories`), shape preserved.
app.get('/api/categories', async (req, res) => {
  try {
    const payload = await contentCache.get('categories:all', async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return {
        categories: (data || []).map((c) => ({
          _id: c.id,
          name: c.name,
          image: c.image,
          hindi: { name: c.name_hi || c.name },
        })),
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/categories error:', err.message);
    return res.status(200).json({ categories: [] });
  }
});

// Blogs — admin-authored & published (table `blogs`), mapped to the shape that
// BlogList.js / BlogScreen.js / Home.js already consume.
app.get('/api/blogs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('blogs')
      .select('*, categories(name)', { count: 'exact' })
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;

    const mapped = (data || []).map((b) => ({
      _id: b.id,
      title: b.title,
      excerpt: b.excerpt,
      metaDescription: b.meta_description,
      thumbnail: b.thumbnail,
      category: { name: b.categories?.name || '' },
      createdAt: b.created_at,
      english: { title: b.title_en || b.title, content: b.content_en || '' },
      hindi: {
        title: b.title_hi || '', content: b.content_hi || '',
        metaDescription: b.meta_description_hi || '', excerpt: b.excerpt_hi || '',
      },
    }));

    // NOTE: Hindi translation is NOT triggered here. It used to be, and that was
    // the wrong place — see src/autoTranslate.js. A read path making third-party
    // calls meant volume scaled with app launches rather than with content, which
    // rate-limited the provider into refusing us outright. Translation now happens
    // when an admin SAVES a blog (adminRoutes.js crud('blogs') afterWrite).

    return res.status(200).json({
      data: mapped,
      totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    });
  } catch (err) {
    console.error('GET /api/blogs error:', err.message);
    return res.status(200).json({ data: [], totalPages: 1 });
  }
});

// Remedies shop — list active items by type (puja | gemstone | specific_puja).
app.get('/api/remedies', async (req, res) => {
  try {
    const cacheKey = `remedies:${req.query.type || 'all'}`;
    const payload = await contentCache.get(cacheKey, async () => {
      let query = supabase
        .from('remedy_items')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (req.query.type) query = query.eq('type', req.query.type);
      const { data, error } = await query;
      if (error) throw error;
      return {
        data: (data || []).map((r) => ({
          _id: r.id,
          type: r.type,
          title: r.title,
          description: r.description,
          price: r.price,
          image: r.image,
          // Retail presentation, added with the cart checkout (2026-08-21). mrp drives the
          // struck-through "was ₹X" and the discount badge; unitLabel is the "5.25 ratti"
          // line under the name. All three are null on rows an admin hasn't filled in yet,
          // and the product card simply omits whatever is missing.
          mrp: r.mrp,
          unitLabel: r.unit_label,
          // Exposed only as a boolean: the app needs to grey out a sold-out card, but has
          // no business knowing inventory counts. NULL stock means unlimited.
          inStock: r.stock === null || r.stock === undefined ? true : r.stock > 0,
          hindi: { title: r.title_hi || r.title, description: r.description_hi || r.description },
        })),
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/remedies error:', err.message);
    return res.status(200).json({ data: [] });
  }
});

// Remedies shop — the 4 top-level category cards (Puja/Gemstones/Specific Puja/
// Life Reports) shown on the Remedies landing screen. Admin-editable via
// astrowani-admin's Remedies page (table remedy_categories, see
// sql/remedy_categories_schema.sql). Falls back to the previously-hardcoded
// defaults (image: null → app uses its bundled image) if the table hasn't been
// migrated yet, so this never blocks the screen from rendering.
const REMEDY_CATEGORY_DEFAULTS = [
  { type: 'puja', title: 'Puja', description: 'Join shared rituals by renowned Purohits and Pandits for blessings and positivity.' },
  { type: 'gemstone', title: 'Gemstones', description: 'Buy certified gemstones to balance energies and support your astrological goals.' },
  { type: 'specific_puja', title: 'Specific Puja', description: 'Book a dedicated puja performed specifically for you.' },
  { type: 'life_report', title: 'Life Reports', description: 'One-time detailed reports on your career, marriage, health, or finances.' },
];

app.get('/api/remedy-categories', async (req, res) => {
  try {
    const payload = await contentCache.get('remedy-categories:all', async () => {
      const { data, error } = await supabase
        .from('remedy_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = data && data.length ? data : REMEDY_CATEGORY_DEFAULTS;
      return {
        data: rows.map((r) => ({
          type: r.type,
          title: r.title,
          description: r.description,
          image: r.image || null,
          // NULL when the admin hasn't written Hindi — NOT the English text.
          // This used to read `r.title_hi || r.title`, so an unfilled Hindi
          // column came back holding the English string. The app cannot tell
          // that apart from a real admin-authored Hindi title, so it preferred
          // it over its own bundled Hindi translation, and the Remedies cards
          // stayed English under the Hindi toggle even though a perfectly good
          // translation was sitting in LanguageContext all along. Reporting the
          // absence honestly is what lets the client fall back to it.
          hindi: { title: r.title_hi || null, description: r.description_hi || null },
        })),
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/remedy-categories error:', err.message);
    return res.status(200).json({
      // Null Hindi here too — these hardcoded defaults are English-only, and
      // echoing them as "Hindi" would suppress the app's bundled translation on
      // exactly the failure path where the fallback matters most.
      data: REMEDY_CATEGORY_DEFAULTS.map((d) => ({ ...d, image: null, hindi: { title: null, description: null } })),
    });
  }
});

// Remedy orders moved to src/orderRoutes.js (2026-08-21).
//
// POST /api/orders was a single-item insert with no payment leg and no caller — the app's
// Place Order deliberately never called it. GET /api/orders/mine re-implemented the
// JWT-phone-to-UUID lookup inline and fed a legacy `user_<timestamp>` id straight into
// .eq() on a uuid column, which is an unconditional 500 for anyone holding an old token.
// Both are replaced by the cart-aware, payment-verified versions in that module, which
// also owns /api/addresses/*. Registered near the other route modules above.

const MOCK_ASTROLOGERS = [
  { _id: 1, userId: "astro_1", name: 'Aacharya Sharma', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 15, isFree: false, specialties: [{name: 'Vedic Astrology'}], experience: 10, language: ['English', 'Hindi'], rating: 4.8 },
  { _id: 2, userId: "astro_2", name: 'Guruji Verma', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 20, isFree: false, specialties: [{name: 'Tarot Card'}], experience: 8, language: ['Hindi'], rating: 4.9 },
  { _id: 3, userId: "astro_3", name: 'Pandit Shastri', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 10, isFree: true, specialties: [{name: 'Numerology'}], experience: 5, language: ['English'], rating: 4.5 },
  { _id: 4, userId: "astro_4", name: 'Swami Raj', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 25, isFree: false, specialties: [{name: 'Vastu Shastra'}], experience: 15, language: ['Hindi', 'Sanskrit'], rating: 5.0 },
  { _id: 5, userId: "astro_5", name: 'Yogi Patel', profileImage: 'https://astrowani.onrender.com/public/images/astro1.png', chargePerMinute: 12, isFree: false, specialties: [{name: 'Palmistry'}], experience: 6, language: ['English', 'Gujarati'], rating: 4.7 },
  { _id: 6, userId: "astro_6", name: 'Astrologer Gupta', profileImage: 'https://astrowani.onrender.com/public/images/astro2.png', chargePerMinute: 30, isFree: false, specialties: [{name: 'Prashna Kundali'}], experience: 12, language: ['Hindi'], rating: 4.6 },
  { _id: 7, userId: "astro_7", name: 'Rishi Kumar', profileImage: 'https://astrowani.onrender.com/public/images/astro3.png', chargePerMinute: 18, isFree: true, specialties: [{name: 'Nadi Astrology'}], experience: 9, language: ['English', 'Tamil'], rating: 4.9 },
  { _id: 8, userId: "astro_8", name: 'Devi Singh', profileImage: 'https://astrowani.onrender.com/public/images/astro4.png', chargePerMinute: 22, isFree: false, specialties: [{name: 'Face Reading'}], experience: 11, language: ['Hindi', 'Punjabi'], rating: 4.8 },
];

app.get('/api/astrologers', async (req, res) => {
  try {
    const { service } = req.query;
    const cacheKey = `astrologers:${service || 'all'}`;

    // Cached + single-flighted: the four customer list screens all refetch this
    // on any astrologers-table change, so under load hundreds of identical
    // requests arrive at once. See src/ttlCache.js for why that is safe here.
    let formattedData = await astrologerListCache.get(cacheKey, async () => {
      // Push the cheap, high-selectivity predicates into SQL instead of pulling
      // the whole table and filtering in Node. approval_status/is_suspended
      // eliminate most rows and are covered by idx_astrologers_visible.
      let query = supabase
        .from('astrologers')
        .select(ASTROLOGER_LIST_COLUMNS)
        .eq('approval_status', 'approved')
        .not('is_suspended', 'is', true)
        .gt('experience', 0);

      // Optional service filter — section screens pass ?service=chat|audio|video
      // to get only astrologers who have that toggle enabled.
      if (service === 'chat')  query = query.eq('is_chat_enabled', true);
      if (service === 'audio') query = query.eq('is_call_enabled', true);
      if (service === 'video') query = query.eq('is_video_call_enabled', true);

      const { data, error } = await query;
      if (error) throw error;

      // The rest of "visible" (email shape, photo, languages, has-a-charge) is
      // not expressible in PostgREST, but it now runs over a far smaller set.
      const visibleRows = (data || []).filter(astrologerVisibleToCustomers);

      const [categoryMap, busyMap] = await Promise.all([buildCategoryMap(), buildBusyMap(supabase)]);
      return visibleRows.map((astro, index) => formatAstrologer(astro, index, categoryMap, busyMap));
    });

    // Optional category filter — ?category=<categoryId|name>. Matches by category UUID
    // (what the vendor stores) or by resolved category name (case-insensitive).
    const { category } = req.query;
    if (category) {
      const wanted = String(category).toLowerCase();
      formattedData = formattedData.filter(
        (a) =>
          (a.categoryIds || []).map(String).includes(String(category)) ||
          (a.categoryNames || []).some((n) => String(n).toLowerCase() === wanted),
      );
    }

    return res.status(200).json({ data: formattedData });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch astrologers' });
  }
});

app.get('/api/astrologers/specialty/:id', (req, res) => {
  return res.status(200).json({
    data: [
      { _id: 1, userId: "astro_1", name: 'Aacharya Sharma', profileImage: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', chargePerMinute: 15, isFree: false, specialties: [{name: 'Vedic Astrology'}], experience: 10, language: ['English', 'Hindi'], rating: 4.8 },
      { _id: 2, userId: "astro_2", name: 'Guruji Verma', profileImage: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png', chargePerMinute: 20, isFree: false, specialties: [{name: 'Tarot Card'}], experience: 8, language: ['Hindi'], rating: 4.9 },
    ]
  });
});

// Live Astrologers — real data from Supabase where is_available = true.
// Cached + column-projected the same way GET /api/astrologers already is —
// this endpoint used to skip both (SELECT *, no TTL cache), paying the full
// buildCategoryMap()+buildBusyMap() cost on every single hit.
app.get('/api/astrologers/liveAstrologers', async (req, res) => {
  try {
    const formattedData = await astrologerListCache.get('astrologers:live', async () => {
      const { data, error } = await supabase
        .from('astrologers')
        .select(ASTROLOGER_LIST_COLUMNS)
        .eq('is_available', true);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Live section also respects the approval + profile-complete gates.
      const visibleRows = data.filter(astrologerVisibleToCustomers);

      const [categoryMap, busyMap] = await Promise.all([buildCategoryMap(), buildBusyMap(supabase)]);
      return visibleRows.map((astro, index) => formatAstrologer(astro, index, categoryMap, busyMap));
    });

    return res.status(200).json({ data: formattedData });
  } catch (err) {
    console.error('liveAstrologers error:', err.message);
    return res.status(500).json({ data: [] });
  }
});

// Resolve the real Supabase customer UUID from the request JWT. Stale tokens may
// carry a user_<timestamp> id, so we always reconcile by phone (same as /api/call/initiate).
async function resolveCustomerFromReq(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let id = decoded.userId || decoded.id;
    let name = decoded.name || 'User';
    if (decoded.phone) {
      const { data } = await supabase
        .from('customers').select('id, name').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) { id = data[0].id; name = data[0].name || name; }
    }
    return { id, name };
  } catch (_) {
    return null;
  }
}

// Store/refresh the customer's FCM token so the backend can push notifications
// (incoming chat while backgrounded, missed sessions, admin broadcasts).
app.post('/api/users/fcm-token', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer?.id) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'fcmToken is required' });
    await supabaseService.from('customers').update({ fcm_token: fcmToken }).eq('id', customer.id);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[push] fcm-token save error:', e.message);
    return res.status(500).json({ success: false, message: 'Could not save token' });
  }
});

// Store/refresh the astrologer's iOS PushKit (VoIP) token, so an incoming consultation
// can ring a KILLED app via CallKit. This is a DIFFERENT token from fcm_token — it is
// issued by PKPushRegistry, not FCM — hence its own column (sql/astrologer_voip_token.sql).
//
// iOS only. The vendor app posts here right after PushKit hands it a token, and again on
// every token refresh. Android keeps using the existing FCM data push +
// CallForegroundService path, which already works and is untouched.
//
// Deliberately keyed off the JWT's astrologer id rather than anything in the body: a token
// is a routing target for incoming calls, so letting a caller name the astrologer it
// belongs to would let one astrologer hijack another's ring.
app.post('/api/vendor/voip-token', async (req, res) => {
  try {
    const astroId = await resolveVendorIdFromReq(req);
    if (!astroId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { voipToken, platform } = req.body || {};
    if (!voipToken) return res.status(400).json({ success: false, message: 'voipToken is required' });
    if (platform && platform !== 'ios') {
      return res.status(400).json({ success: false, message: 'VoIP tokens are iOS-only' });
    }
    const { error } = await supabaseService
      .from('astrologers')
      .update({ voip_token: voipToken, voip_platform: 'ios' })
      .eq('id', astroId);
    if (error) {
      // Most likely cause: sql/astrologer_voip_token.sql has not been applied yet. Answer
      // 503 rather than 500 so the app can tell "not deployed" from "broken", and keep the
      // message specific enough to be actionable in a log.
      console.error('[voip] token save error:', error.message);
      return res.status(503).json({
        success: false,
        message: 'VoIP token storage unavailable — has sql/astrologer_voip_token.sql been applied?',
      });
    }
    return res.status(200).json({ success: true, voipConfigured: isVoipReady() });
  } catch (e) {
    console.error('[voip] token save error:', e.message);
    return res.status(500).json({ success: false, message: 'Could not save VoIP token' });
  }
});

// The customer app's SupportScreen.js has always posted here for "Refund Request" /
// technical/account/feedback tickets — this route never existed, so every submission
// silently failed (generic Error alert, nothing reached anyone). Found during the
// pre-launch readiness pass, 2026-08-08. See sql/support_tickets_schema.sql.
app.post('/api/support/create-support', async (req, res) => {
  try {
    const { name, email, issueType, message, mobile } = req.body || {};
    if (!name || !email || !issueType || !message) {
      return res.status(400).json({ success: false, message: 'name, email, issueType and message are required' });
    }
    const customer = await resolveCustomerFromReq(req);
    const { data: ticket, error } = await supabaseService
      .from('support_tickets')
      .insert([{
        customer_id: customer?.id || null,
        name, email, mobile: mobile || null,
        issue_type: issueType, message,
      }])
      .select('id')
      .single();
    if (error) throw error;
    return res.status(200).json({ success: true, ticketId: ticket.id });
  } catch (e) {
    console.error('[support] create-support error:', e.message);
    return res.status(500).json({ success: false, message: 'Could not submit support request' });
  }
});

// Called by the vendor app right after it inserts a chat_messages row, so the customer
// gets a push if their app is backgrounded/killed (chat itself runs over Supabase Realtime,
// which the Node backend has no visibility into).
//
// SECURITY (2026-08-08 — see MD files/security-audit-2026-08-08.md): this had NO auth at
// all — anyone could POST an arbitrary customerId + fabricated message text and trigger a
// real push notification (spam/phishing under an astrologer's name) to that customer's
// phone. Now requires a valid vendor JWT, and astrologerId comes from the token — the
// client-supplied astrologerId (used only for the push's display name lookup) can no
// longer be spoofed to impersonate a different astrologer.
app.post('/api/push/notify-chat-message', async (req, res) => {
  try {
    const astrologerId = await resolveVendorIdFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { customerId, message } = req.body;
    if (!customerId || !message) return res.status(400).json({ success: false, message: 'customerId and message are required' });

    const [{ data: customerRow }, { data: astroRow }] = await Promise.all([
      supabaseService.from('customers').select('fcm_token').eq('id', customerId).limit(1).single(),
      supabaseService.from('astrologers').select('first_name, last_name').eq('id', astrologerId).limit(1).single(),
    ]);

    const astroName = `${astroRow?.first_name || ''} ${astroRow?.last_name || ''}`.trim() || 'Your Astrologer';
    if (customerRow?.fcm_token) {
      await sendPush(customerRow.fcm_token, {
        title: astroName,
        body: message.length > 100 ? message.slice(0, 97) + '...' : message,
        data: { type: 'chat_message', astrologerId: astrologerId || '' },
      });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[push] notify-chat-message error:', e.message);
    return res.status(200).json({ success: false });
  }
});

// Chat *request* (not an in-conversation message) — customer app inserts chat_requests
// directly into Supabase with no backend involvement, so it calls this right after as a
// fire-and-forget push fallback for a backgrounded/killed vendor app. Data-only payload,
// same accept/reject notification path as incoming_call.
// SECURITY (2026-08-08): had no auth — anyone could POST an arbitrary vendorId and trigger
// a fake "New Chat Request" push to that astrologer's phone (griefing / social engineering,
// e.g. luring them to open the app expecting a paying customer). Now requires a valid
// customer JWT; callerId/callerName come from the resolved customer, not the request body.
app.post('/api/push/notify-chat-request', async (req, res) => {
  try {
    const caller = await resolveCustomerFromReq(req);
    if (!caller?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { vendorId } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });

    const { data: vendorRow } = await supabaseService
      .from('astrologers').select('fcm_token').eq('id', vendorId).limit(1).single();

    if (vendorRow?.fcm_token) {
      await sendPush(vendorRow.fcm_token, {
        data: {
          type: 'chat_request',
          callerName: caller.name || 'Customer',
          callerId: caller.id,
        },
      });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[push] notify-chat-request error:', e.message);
    return res.status(200).json({ success: false });
  }
});

// Customer cancelled/backed out of a pending chat request (manual cancel, or its own 60s
// ring timeout) — dismiss the vendor's heads-up "New Chat Request" notification, same
// reasoning as the call side's 'cancel_call' socket handler above. Chats have no backend
// touchpoint at request time (customer inserts chat_requests directly into Supabase), so
// this mirrors notify-chat-request as a fire-and-forget call from the customer app.
// SECURITY (2026-08-08): had no auth — anyone could POST an arbitrary vendorId and fire a
// fake "request cancelled" push, e.g. to dismiss a real astrologer's heads-up for a request
// that is actually still pending. Now requires a valid customer JWT; callerId comes from
// the resolved customer, not the request body.
app.post('/api/push/notify-chat-cancelled', async (req, res) => {
  try {
    const caller = await resolveCustomerFromReq(req);
    if (!caller?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { vendorId } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });

    const { data: vendorRow } = await supabaseService
      .from('astrologers').select('fcm_token').eq('id', vendorId).limit(1).single();

    if (vendorRow?.fcm_token) {
      await sendPush(vendorRow.fcm_token, {
        data: { type: 'cancel_incoming_request', callerId: caller.id },
      });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[push] notify-chat-cancelled error:', e.message);
    return res.status(200).json({ success: false });
  }
});

// Reviews list for an astrologer — non-hidden, newest first, with reviewer first name.
app.get('/api/reviews/astrologer/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from('reviews')
      .select('id, rating, comment, admin_reply, created_at, customer_id')
      .eq('astrologer_id', req.params.id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    // Resolve reviewer names in one query.
    const ids = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const { data: custs } = await supabaseService
        .from('customers').select('id, name').in('id', ids);
      (custs || []).forEach((c) => { names[c.id] = (c.name || '').trim().split(' ')[0] || 'Customer'; });
    }
    return res.status(200).json(rows.map((r) => ({
      user: { firstName: names[r.customer_id] || 'Customer' },
      rating: r.rating,
      comment: r.comment || '',
      adminReply: r.admin_reply || '',
      createdAt: r.created_at,
    })));
  } catch (e) {
    console.error('[reviews] list error:', e.message);
    return res.status(200).json([]);
  }
});

// Favorite Astrologers — real, per-customer (resolved from JWT).
app.get('/api/favoriteAstrologer', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(200).json({ favoriteAstrologer: [] });

    const { data: favs } = await supabaseService
      .from('favorites')
      .select('astrologer_id, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    const ids = (favs || []).map((f) => f.astrologer_id);
    if (!ids.length) return res.status(200).json({ favoriteAstrologer: [] });

    const { data: astros } = await supabaseService
      .from('astrologers').select('*').in('id', ids);
    const categoryMap = await buildCategoryMap();
    // Preserve the favorites order (most-recently-added first).
    const byId = {};
    (astros || []).forEach((a) => { byId[a.id] = a; });
    const formatted = ids
      .map((id, i) => (byId[id] ? formatAstrologer(byId[id], i, categoryMap) : null))
      .filter(Boolean)
      .map((a) => ({ ...a, isFavorite: true }));
    return res.status(200).json({ favoriteAstrologer: formatted });
  } catch (e) {
    console.error('[favorites] list error:', e.message);
    return res.status(200).json({ favoriteAstrologer: [] });
  }
});

app.post('/api/favoriteAstrologer/add', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(401).json({ success: false, message: 'Please log in.' });
    const astrologerId = req.body?.astrologerId;
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId required' });
    const { error } = await supabaseService
      .from('favorites')
      .upsert({ customer_id: customer.id, astrologer_id: astrologerId }, { onConflict: 'customer_id,astrologer_id' });
    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Added to favorites' });
  } catch (e) {
    console.error('[favorites] add error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to add favorite' });
  }
});

app.post('/api/favoriteAstrologer/remove', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(401).json({ success: false, message: 'Please log in.' });
    const astrologerId = req.body?.astrologerId;
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId required' });
    const { error } = await supabaseService
      .from('favorites')
      .delete()
      .eq('customer_id', customer.id)
      .eq('astrologer_id', astrologerId);
    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Removed from favorites' });
  } catch (e) {
    console.error('[favorites] remove error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to remove favorite' });
  }
});

// Customer reports an astrologer (moderation) — visible to admin under Reports.
app.post('/api/reports', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(401).json({ success: false, message: 'Please log in.' });
    const { astrologerId, reason, note } = req.body || {};
    if (!astrologerId || !reason) {
      return res.status(400).json({ success: false, message: 'astrologerId and reason are required' });
    }
    const { error } = await supabaseService
      .from('astrologer_reports')
      .insert([{ customer_id: customer.id, astrologer_id: astrologerId, reason, note: note || null }]);
    if (error) throw error;
    return res.status(200).json({ success: true, message: 'Report submitted' });
  } catch (e) {
    console.error('[reports] submit error:', e.message);
    return res.status(500).json({ success: false, message: 'Failed to submit report' });
  }
});

// Average rating — read the cached aggregate off the astrologer row.
app.get('/api/reviews/astrologer/:id/average-rating', async (req, res) => {
  try {
    const { data } = await supabaseService
      .from('astrologers').select('average_rating, total_reviews').eq('id', req.params.id).single();
    return res.status(200).json({
      averageRating: Number(data?.average_rating) || 0,
      totalReviews: data?.total_reviews || 0,
    });
  } catch (e) {
    return res.status(200).json({ averageRating: 0, totalReviews: 0 });
  }
});

// Whether the current customer is allowed to review this astrologer (completed session).
app.get('/api/reviews/eligibility/:id', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(200).json({ eligible: false });
    const { data } = await supabaseService
      .from('chat_sessions')
      .select('id')
      .eq('caller_id', customer.id)
      .eq('vendor_id', req.params.id)
      .not('ended_at', 'is', null)
      .limit(1);
    return res.status(200).json({ eligible: !!(data && data.length) });
  } catch (e) {
    return res.status(200).json({ eligible: false });
  }
});

// Post / update a review (one editable review per customer per astrologer).
// Gated to customers who completed a session with this astrologer.
app.post('/api/reviews/astrologer/:id/review', async (req, res) => {
  try {
    const astrologerId = req.params.id;
    const { rating, comment } = req.body || {};
    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Please provide a rating between 1 and 5.' });
    }
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) {
      return res.status(401).json({ error: 'Please log in to submit a review.' });
    }
    // Eligibility: a completed session must exist.
    const { data: sessions } = await supabaseService
      .from('chat_sessions')
      .select('id')
      .eq('caller_id', customer.id)
      .eq('vendor_id', astrologerId)
      .not('ended_at', 'is', null)
      .limit(1);
    if (!sessions || !sessions.length) {
      return res.status(403).json({ error: 'You can review an astrologer only after a session with them.' });
    }
    // Upsert on (astrologer_id, customer_id) — re-submission updates the existing review.
    const { error } = await supabaseService
      .from('reviews')
      .upsert(
        {
          astrologer_id: astrologerId,
          customer_id: customer.id,
          rating: numRating,
          comment: (comment || '').trim(),
          is_hidden: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'astrologer_id,customer_id' }
      );
    if (error) throw error;
    await recomputeAstrologerRating(astrologerId);
    return res.status(200).json({ success: true, message: 'Review submitted successfully' });
  } catch (e) {
    console.error('[reviews] submit error:', e.message);
    return res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// Recent reviews across all astrologers — for the customer Home carousel.
app.get('/api/reviews/astrologers/reviews', async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from('reviews')
      .select('rating, comment, created_at, customer_id, astrologer_id')
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) throw error;
    const rows = data || [];
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
    // profile_image is the column name on customers — the app's Image source
    // key is `profilePic`, kept as-is below so the existing card (which already
    // falls back to a placeholder when it's absent) needs no change.
    let custNames = {}, custPics = {}, astroNames = {};
    if (custIds.length) {
      const { data: c } = await supabaseService.from('customers').select('id, name, profile_image').in('id', custIds);
      (c || []).forEach((x) => {
        custNames[x.id] = (x.name || '').trim().split(' ')[0] || 'Customer';
        custPics[x.id] = x.profile_image || null;
      });
    }
    if (astroIds.length) {
      const { data: a } = await supabaseService.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (a || []).forEach((x) => { astroNames[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer'; });
    }
    const formatted = rows.map((r) => ({
      user: { firstName: custNames[r.customer_id] || 'Customer', profilePic: custPics[r.customer_id] || null },
      astrologerName: astroNames[r.astrologer_id] || 'Astrologer',
      rating: r.rating,
      comment: r.comment || '',
      createdAt: r.created_at,
    }));
    // Reviews with a real photo lead the carousel — a wall of the same
    // placeholder head reads as fake, a real face reads as a real customer.
    // A stable sort (has-photo first) rather than a hard filter, so a quiet
    // week with mostly photo-less reviews still fills the row instead of
    // going empty. Within each group, original recency order is preserved.
    const withPhoto = formatted.filter((r) => r.user.profilePic);
    const withoutPhoto = formatted.filter((r) => !r.user.profilePic);
    return res.status(200).json([...withPhoto, ...withoutPhoto].slice(0, 20));
  } catch (e) {
    console.error('[reviews] all error:', e.message);
    return res.status(200).json([]);
  }
});

// WebRTC Call Initiate — no third-party room server needed; signaling goes through socket.io
app.post('/api/call/initiate', async (req, res) => {
  try {
    const { receiverId, callType } = req.body;
    if (!receiverId) return res.status(400).json({ success: false, message: 'receiverId required' });

    // Reject up front if the astrologer is already in a session or has an unanswered
    // pending request — prevents a second customer from ringing/inserting a call_requests
    // row for someone who's already occupied. Client call sites already check this
    // response's status before inserting their own call_requests row (see ReusableList.js,
    // Home.js, Call.js, AstrologerInfo.js, ExpertsList.js), so this is a real gate, not
    // just informational.
    const busyStatus = await checkAstrologerBusy(supabase, receiverId);
    if (busyStatus.busy) {
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, reason: busyStatus.reason, message: busyStatus.reason === 'live' ? 'Astrologer is live right now and cannot take calls or chats' : 'Astrologer is busy right now' });
    }

    // Resolve caller identity from JWT
    const authHeader = req.headers.authorization;
    const token_jwt = authHeader && authHeader.split(' ')[1];
    let callerInfo = { name: 'User', id: null };
    if (token_jwt) {
      try {
        const decoded = jwt.verify(token_jwt, process.env.JWT_SECRET);
        callerInfo.id = decoded.userId || decoded.id;

        // Always resolve to real Supabase UUID by phone — stale JWTs may carry a
        // user_<timestamp> id that is not a valid UUID for billing.
        if (decoded.phone) {
          const { data: byPhone } = await supabase
            .from('customers')
            .select('id, name')
            .eq('mobile', decoded.phone)
            .limit(1);
          if (byPhone && byPhone.length > 0) {
            callerInfo.id = byPhone[0].id;
            callerInfo.name = byPhone[0].name || callerInfo.name;
          }
        }
      } catch(e) {}
    }

    // FAIRNESS FIX (added 2026-08-14 — money/billing audit): checkAstrologerBusy above only
    // ever gated the astrologer side — nothing stopped this same customer from also being
    // mid-session/mid-request with someone else, double-booking one wallet across two
    // simultaneous sessions. See busyStatus.js checkCustomerBusy for the full reasoning.
    if (callerInfo.id) {
      const customerBusyStatus = await checkCustomerBusy(supabase, callerInfo.id);
      if (customerBusyStatus.busy) {
        return res.status(409).json({ success: false, busy: true, selfBusy: true, busySince: customerBusyStatus.busySince, message: 'You already have an active or pending call/chat — finish that one first.' });
      }
    }

    const sessionId = crypto.randomUUID();
    const roomId = crypto.randomUUID();

    // The row itself, not just the socket/push notifications — moved server-side so the
    // anon key no longer needs a direct INSERT grant on call_requests. See
    // DATABASE_HARDENING_HANDOFF.md STEP 3. room_token stays null: it was already
    // vestigial (this endpoint never returned a real vendorToken for clients to store).
    // session_id is stored here too (not just sent over the socket) so the Supabase
    // Realtime backup listener on the vendor side (HomeScreen.js — used when the socket
    // event is missed) has the same sessionId the customer already has. Without this, a
    // vendor accepting via the Realtime path got sessionId: null and /api/session/accept
    // let a fresh random id get generated for chat_sessions — different from the id the
    // customer's call screen was already listening on, so the call never connected.
    const { data: requestRow, error: requestErr } = await supabase
      .from('call_requests')
      .insert([{
        customer_id: callerInfo.id,
        astrologer_id: receiverId,
        customer_name: callerInfo.name,
        call_type: callType || 'audio',
        status: 'pending',
        room_id: roomId,
        room_token: null,
        session_id: sessionId,
      }])
      .select('id')
      .single();
    if (requestErr) {
      // 23505 = unique_violation on uq_one_pending_call_per_astrologer (hardening_04) —
      // another request for this astrologer landed between our busy-check read and this
      // insert (confirmed race under concurrency via scripts/testConcurrency.js). Treat it
      // exactly like the pre-check finding the astrologer busy, not a server error.
      if (requestErr.code === '23505') {
        return res.status(409).json({ success: false, busy: true, busySince: new Date().toISOString(), reason: 'session', message: 'Astrologer is busy right now' });
      }
      throw requestErr;
    }
    const requestId = requestRow.id;

    // Notify vendor via socket — no ENX tokens, WebRTC signaling happens via socket.io
    io.to(receiverId).emit('incoming_call', {
      callType: callType || 'audio',
      callerName: callerInfo.name,
      callerId: callerInfo.id,
      sessionId: sessionId,
      roomId: roomId,
    });

    console.log(`[Call] Notified vendor ${receiverId} of incoming ${callType || 'audio'} call (WebRTC)`);

    // Push fallback — the socket above only reaches a vendor whose HomeScreen is currently
    // mounted; a backgrounded/killed app gets nothing without this. Data-only payload (no
    // `notification` key) so the vendor app's own code renders the accept/reject notification
    // instead of Android auto-displaying a plain one.
    // One lookup now serves both channels: the FCM data push (Android, and iOS while the
    // app is alive) and the iOS PushKit VoIP push (the only thing that can ring a KILLED
    // iOS app — see src/voipPush.js for why FCM cannot).
    supabase.from('astrologers').select('fcm_token, voip_token').eq('id', receiverId).single()
      .then(({ data }) => {
        if (data?.fcm_token) {
          sendPush(data.fcm_token, {
            data: {
              type: callType === 'video' ? 'incoming_video_call' : 'incoming_call',
              callerName: callerInfo.name,
              callerId: callerInfo.id || '',
              sessionId,
              roomId,
            },
          }).catch((e) => console.error('[Call] push send error:', e.message));
        }

        // iOS VoIP ring. The payload's keys are consumed in AppDelegate.mm's PushKit
        // handler, which must report the call to CallKit immediately (iOS kills the app
        // and eventually revokes the VoIP privilege otherwise), so keep it flat, small,
        // and stable. `uuid` is the CallKit call identifier and MUST be a real UUID —
        // sessionId already is one (crypto.randomUUID from this endpoint), so reusing it
        // means the app can end the right CallKit call later without extra bookkeeping.
        if (data?.voip_token) {
          sendVoipPush(data.voip_token, {
            type: callType === 'video' ? 'incoming_video_call' : 'incoming_call',
            uuid: sessionId,
            callerName: callerInfo.name || 'Astrowani',
            callerId: callerInfo.id || '',
            callType: callType || 'audio',
            sessionId,
            roomId,
          })
            .then((r) => {
              if (r && r.unregistered) {
                // Dead token: app uninstalled, or (very common during the iOS rollout) a
                // sandbox token being sent to the production APNs host. Clear it so we stop
                // paying the latency of a doomed send on every call.
                console.warn(`[Call] clearing dead VoIP token for astrologer ${receiverId} (${r.reason})`);
                supabaseService
                  .from('astrologers')
                  .update({ voip_token: null, voip_platform: null })
                  .eq('id', receiverId)
                  .then(() => {})
                  .catch((e) => console.error('[Call] voip token clear error:', e.message));
              }
            })
            .catch((e) => console.error('[Call] voip send error:', e.message));
        }
      })
      .catch((e) => console.error('[Call] push lookup error:', e.message));

    return res.status(200).json({
      data: {
        sessionId: sessionId,
        roomId: roomId,
        requestId: requestId,
        receiver: { name: 'Astrologer', image: '' },
      }
    });
  } catch (error) {
    console.error('[Call] initiate error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

// Chat has no backend request-creation route (the customer app inserts chat_requests
// directly into Supabase — see useChatRequest.js) — this is the pre-check it calls
// immediately before that insert, mirroring the gate built into /api/call/initiate above.
app.post('/api/chat/check-availability', async (req, res) => {
  try {
    const { astrologerId } = req.body;
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId required' });
    const busyStatus = await checkAstrologerBusy(supabase, astrologerId);
    if (busyStatus.busy) {
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, reason: busyStatus.reason, message: busyStatus.reason === 'live' ? 'Astrologer is live right now and cannot take calls or chats' : 'Astrologer is busy right now' });
    }
    return res.status(200).json({ success: true, busy: false });
  } catch (error) {
    console.error('[Chat] check-availability error:', error.message);
    // Fail open — don't block a legitimate chat over a transient error here either.
    return res.status(200).json({ success: true, busy: false });
  }
});

// Creates the chat_requests row server-side — moved off the anon key's direct INSERT
// grant (see DATABASE_HARDENING_HANDOFF.md STEP 3). Re-checks busy status (the client
// already called /api/chat/check-availability, this closes the last-moment race) and
// resolves the caller's real customer UUID from the JWT instead of trusting the client.
app.post('/api/chat/initiate', async (req, res) => {
  try {
    const { astrologerId } = req.body;
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId required' });

    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(401).json({ success: false, message: 'Please log in.' });

    const busyStatus = await checkAstrologerBusy(supabase, astrologerId);
    if (busyStatus.busy) {
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, reason: busyStatus.reason, message: busyStatus.reason === 'live' ? 'Astrologer is live right now and cannot take calls or chats' : 'Astrologer is busy right now' });
    }

    // FAIRNESS FIX (added 2026-08-14 — money/billing audit): mirrors the same check added to
    // /api/call/initiate — one customer shouldn't be able to double-book a second astrologer
    // while already active/pending with another. See busyStatus.js checkCustomerBusy.
    const customerBusyStatus = await checkCustomerBusy(supabase, customer.id);
    if (customerBusyStatus.busy) {
      return res.status(409).json({ success: false, busy: true, selfBusy: true, busySince: customerBusyStatus.busySince, message: 'You already have an active or pending call/chat — finish that one first.' });
    }

    const { data: row, error } = await supabase
      .from('chat_requests')
      .insert([{
        caller_id: customer.id,
        receiver_id: astrologerId,
        status: 'pending',
        request_type: 'chat',
        caller_name: customer.name || 'Customer',
      }])
      .select('id')
      .single();
    if (error) {
      // 23505 = unique_violation on uq_one_pending_chat_per_astrologer (hardening_04) —
      // same race as /api/call/initiate, closed the same way.
      if (error.code === '23505') {
        return res.status(409).json({ success: false, busy: true, busySince: new Date().toISOString(), reason: 'session', message: 'Astrologer is busy right now' });
      }
      throw error;
    }

    return res.status(200).json({ success: true, requestId: row.id, callerId: customer.id });
  } catch (error) {
    console.error('[Chat] initiate error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send chat request' });
  }
});

// Creates a chat_messages row server-side — moved off the anon key's direct INSERT
// grant (see DATABASE_HARDENING_HANDOFF.md STEP 3).
//
// LOAD-SCALING FIX (2026-08-08 — see security-audit-2026-08-08.md): message delivery to
// the other party used to happen via each screen's own direct Supabase Realtime
// subscription on this table — one more per-screen Realtime connection alongside the
// notification badge fix in the same pass, and unlike that fix this one is often
// long-lived (a paid chat session can run many minutes). Since this endpoint is the
// ONLY writer of chat_messages for the two main chat screens (ChatSessionScreen.js,
// VendorChatSession.js — the legacy PersonToPersonChat.js path is untouched, see that
// file), the backend already knows the instant a message is created — no Realtime
// subscription was ever structurally necessary, same reasoning as notifications. Now
// relays over the session's socket room (already joined via 'join_session' for
// signal_connection/session_ended) instead.
app.post('/api/chat/message', async (req, res) => {
  try {
    const { roomId, sessionId, receiverId, message } = req.body;
    if (!roomId || !message) {
      return res.status(400).json({ success: false, message: 'roomId and message are required' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Works for both customer and vendor tokens. Vendor tokens carry astroId/vendorId
    // or role='astrologer' and their real UUID is already decoded.id/userId; customer
    // tokens need the usual phone -> real UUID resolution.
    let senderId = decoded.userId || decoded.id;
    const isVendor = decoded.role === 'astrologer' || decoded.role === 'vendor' || !!decoded.astroId || !!decoded.vendorId;
    if (!isVendor && decoded.phone) {
      const { data } = await supabase.from('customers').select('id').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) senderId = data[0].id;
    }

    // SECURITY (2026-08-08): previously nothing checked that senderId is actually a
    // participant of sessionId — any authenticated user could inject a message into ANY
    // session by guessing/enumerating its id. The row is only trusted for real sessions;
    // messages sent without a sessionId (a stale/legacy caller) are still inserted as
    // before but obviously cannot be relayed into a session room they don't identify.
    if (sessionId) {
      const { data: sessionRow } = await supabaseService
        .from('chat_sessions').select('id, caller_id, vendor_id').eq('id', sessionId).maybeSingle();
      if (!sessionRow
        || (String(sessionRow.caller_id) !== String(senderId) && String(sessionRow.vendor_id) !== String(senderId))) {
        return res.status(403).json({ success: false, message: 'Not a participant of this session' });
      }
    }

    const { data, error } = await supabaseService.from('chat_messages').insert([{
      room_id: roomId,
      session_id: sessionId || null,
      sender_id: senderId,
      receiver_id: receiverId || null,
      message,
    }]).select().single();
    if (error) throw error;

    if (sessionId) io.to(sessionId).emit('new_chat_message', data);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[Chat] message send error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// "Notify me" waitlist — join/leave. Writes via service role since the table has no
// client-facing RLS policy (see sql/astrologer_waitlist_schema.sql).
app.post('/api/astrologer/:id/notify-me', async (req, res) => {
  try {
    const astrologerId = req.params.id;
    const { requestType } = req.body || {};
    const customer = await resolveCustomerFromReq(req);
    if (!customer || !customer.id) return res.status(401).json({ success: false, message: 'Please log in.' });

    const { error } = await supabaseService
      .from('astrologer_waitlist')
      .upsert(
        { astrologer_id: astrologerId, customer_id: customer.id, request_type: requestType || 'chat' },
        { onConflict: 'astrologer_id,customer_id' }
      );
    if (error) throw error;
    return res.status(200).json({ success: true, message: "We'll notify you when they're free." });
  } catch (error) {
    console.error('[waitlist] notify-me error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not join waitlist' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Vendor accept/reject — moved server-side from astrowani_vendors-main's
// incomingRequestActions.js (see DATABASE_HARDENING_HANDOFF.md STEP 3, the
// deliberately-deferred "risky" migration). Ported function-for-function to
// preserve the exact race-condition handling that file's own comments describe:
// resolving a request id two different ways (live in-app popup vs a
// backgrounded/killed-app notification action, which only carries
// callerId/callerName), and disambiguating "not inserted yet — safe to proceed"
// from "already handled elsewhere — must not proceed" before creating a session.
// astroId is resolved from the vendor's JWT here rather than trusted from the
// client, unlike the original client-side version which read it from AsyncStorage.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveVendorIdFromReq(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

// SECURITY (fixed 2026-08-08 — see security-audit-2026-08-08.md): this used to trust
// req.requestId/req.roomId as sufficient proof of ownership on their own, and fell through
// to creating a session with ZERO matching request row when neither was supplied. Both were
// a direct wallet-theft path — any authenticated vendor could accept/create a session against
// an arbitrary customer id. Every lookup below now filters by the CALLING astrologer's own id
// (astrologer_id / receiver_id) as well, and the caller (below) refuses to proceed at all when
// no owned row is found — there is no longer a "no request, but safe to proceed anyway" branch.
// Confirmed safe against the legitimate flow: both /api/call/initiate and /api/chat/initiate
// insert the request row and return its id BEFORE the vendor is notified by any channel
// (socket, push, or Realtime), so a real pending row always exists by the time accept/reject
// can be called for a genuine request.
async function resolveOwnedRequestRow(astroId, targetTable, reqBody) {
  const ownerColumn = targetTable === 'call_requests' ? 'astrologer_id' : 'receiver_id';
  // call_requests' customer column is `customer_id`; chat_requests' is `caller_id` — the
  // real caller for billing MUST come from this column on the resolved row, never from
  // reqBody.callerId, or a vendor with one legitimate pending request could swap in an
  // arbitrary victim's id while still passing the ownership/row-exists check above.
  const callerColumn = targetTable === 'call_requests' ? 'customer_id' : 'caller_id';
  let query = supabaseService.from(targetTable).select(`id, status, ${callerColumn}`).eq(ownerColumn, astroId);

  if (reqBody.requestId) {
    query = query.eq('id', reqBody.requestId);
  } else if (targetTable === 'call_requests' && reqBody.roomId) {
    query = query.eq('room_id', reqBody.roomId).order('created_at', { ascending: false }).limit(1);
  } else if (targetTable === 'chat_requests' && reqBody.callerId) {
    query = query.eq('caller_id', reqBody.callerId).order('created_at', { ascending: false }).limit(1);
  } else {
    return null;
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;
  return { id: data.id, status: data.status, callerId: data[callerColumn] };
}

app.post('/api/session/accept', async (req, res) => {
  try {
    const astroId = await resolveVendorIdFromReq(req);
    if (!astroId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

    const reqBody = req.body || {};
    const targetTable = reqBody.table || 'chat_requests';
    const ownedRow = await resolveOwnedRequestRow(astroId, targetTable, reqBody);
    if (!ownedRow) {
      return res.status(200).json({ ok: false, reason: 'not_found' });
    }
    if (ownedRow.status !== 'pending') {
      return res.status(200).json({ ok: false, reason: 'cancelled' });
    }
    const resolvedRequestId = ownedRow.id;
    // Real caller, taken from the owned request row itself — never from the client-supplied
    // reqBody.callerId (see resolveOwnedRequestRow's comment on why that field can't be trusted).
    const realCallerId = ownedRow.callerId;
    if (!realCallerId) {
      return res.status(200).json({ ok: false, reason: 'not_found' });
    }

    const { data: astroData } = await supabaseService
      .from('astrologers')
      .select('chat_charge_per_minute, call_charge_per_minute, video_charge_per_minute')
      .eq('id', astroId)
      .single();

    const perMinuteCharge =
      reqBody.callType === 'chat'
        ? astroData?.chat_charge_per_minute ?? 0
        : reqBody.callType === 'video'
        ? astroData?.video_charge_per_minute ?? 0
        : astroData?.call_charge_per_minute ?? 0;

    const sessionInsertPayload = {
      request_id: targetTable === 'chat_requests' ? resolvedRequestId : null,
      per_minute_charge: perMinuteCharge,
      vendor_id: astroId,
      caller_id: realCallerId,
      started_at: new Date().toISOString(),
      call_type: reqBody.callType || 'chat',
      room_id: reqBody.roomId || null,
      call_request_id: targetTable === 'call_requests' ? resolvedRequestId : null,
      is_active: false,
      next_billing_at: null,
    };
    if (reqBody.sessionId) {
      sessionInsertPayload.id = reqBody.sessionId;
    }
    const { data: sessionData, error: sessionErr } = await supabaseService
      .from('chat_sessions')
      .insert([sessionInsertPayload])
      .select('id')
      .single();

    if (sessionErr) throw sessionErr;
    const sessionId = sessionData?.id;

    if (resolvedRequestId) {
      const fullPayload = { status: 'accepted', responded_at: new Date().toISOString() };
      if (targetTable === 'call_requests' && sessionId) {
        fullPayload.session_id = sessionId;
      }
      const { error: updateErr } = await supabaseService
        .from(targetTable)
        .update(fullPayload)
        .eq('id', resolvedRequestId);

      if (updateErr) {
        await supabaseService
          .from(targetTable)
          .update({ status: 'accepted' })
          .eq('id', resolvedRequestId);
      }
    }

    return res.status(200).json({
      ok: true,
      resolvedRequestId,
      sessionId,
      perMinuteCharge,
      navigationParams: {
        requestId: resolvedRequestId,
        sessionId,
        callerName: reqBody.callerName,
        callerId: realCallerId,
        perMinuteCharge,
        token: reqBody.token,
        callType: reqBody.callType,
      },
    });
  } catch (error) {
    console.error('[session/accept] error:', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to accept request' });
  }
});

app.post('/api/session/reject', async (req, res) => {
  try {
    const astroId = await resolveVendorIdFromReq(req);
    if (!astroId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

    const reqBody = req.body || {};
    const targetTable = reqBody.table || 'chat_requests';
    const ownedRow = await resolveOwnedRequestRow(astroId, targetTable, reqBody);
    if (!ownedRow) return res.status(200).json({ ok: false, reason: 'not_found' });

    await supabaseService
      .from(targetTable)
      .update({ status: 'rejected', responded_at: new Date().toISOString() })
      .eq('id', ownedRow.id);

    return res.status(200).json({ ok: true, resolvedRequestId: ownedRow.id });
  } catch (error) {
    console.error('[session/reject] error:', error.message);
    return res.status(500).json({ ok: false, message: 'Failed to reject request' });
  }
});

// End a call/session — terminates billing and notifies both parties
//
// SECURITY (fixed 2026-08-14 — money/billing audit): had no authorization check at all — any
// unauthenticated request with a guessed/leaked sessionId could terminate someone else's
// active, still-being-billed session early. Not a fund-theft path on its own, but a griefing/
// availability gap sitting directly next to billing logic. Now requires the caller's JWT to
// resolve to either the session's caller_id or its vendor_id before anything is terminated.
app.post('/api/call/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const { data: sessionRow } = await supabaseService
      .from('chat_sessions').select('id, caller_id, vendor_id').eq('id', sessionId).maybeSingle();
    if (!sessionRow) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const customer = await resolveCustomerFromReq(req);
    const vendorId = await resolveVendorIdFromReq(req);
    const isParticipant =
      (customer?.id && String(customer.id) === String(sessionRow.caller_id)) ||
      (vendorId && String(vendorId) === String(sessionRow.vendor_id));
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not a participant of this session' });
    }

    await sessionManager.terminateSession(sessionId, 'Call ended by user');

    return res.status(200).json({ success: true, message: 'Session ended' });
  } catch (error) {
    console.error('POST /api/call/end error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to end session' });
  }
});

// Mock Gemstones
app.get('/api/astro-services/gemstones', (req, res) => {
  return res.status(200).json({
    totalPages: 1,
    gemstones: [
      { _id: 'gem_1', name: 'Ruby', price: 5000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_2', name: 'Emerald', price: 8000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_3', name: 'Sapphire', price: 12000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] },
      { _id: 'gem_4', name: 'Pearl', price: 2000, images: ['https://cdn-icons-png.flaticon.com/512/11264/11264366.png'] }
    ]
  });
});

// Mock Gemstone Query
app.post('/api/astro-services/gemstone-query', (req, res) => {
  return res.status(200).json({ success: true, message: 'Query submitted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// WALLET: Get customer wallet balance + transactions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/wallet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    let userRow = null;
    let actualUserId = userId;

    if (decoded.phone) {
      const { data: cData } = await supabase
        .from('customers')
        .select('id, wallet_balance')
        .eq('mobile', decoded.phone)
        .limit(1);
      if (cData && cData.length > 0) {
        userRow = cData[0];
        actualUserId = cData[0].id;
      }
    }

    if (!userRow && String(userId).includes('-')) { // crude uuid check
      const { data, error } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userId)
        .single();
      if (!error) userRow = data;
    }

    // Fetch recent wallet transactions
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', actualUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({
      success: true,
      data: {
        balance: userRow?.wallet_balance ?? 0,
        transactions: (txns || []).map(t => ({
          id: t.id,
          description: t.description || (t.type === 'credit' ? 'Money Added' : 'Chat/Call Charge'),
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
});

// Real referral program — replaces the customer app's old ReferAndEarnScreen.js mock
// (identical hardcoded code for every user, dead reward button). Lazily generates a code
// for customers who signed up before this feature existed.
app.get('/api/customer/referral-info', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    let customerRow = null;
    if (decoded.phone) {
      const { data } = await supabaseService
        .from('customers').select('id, referral_code').eq('mobile', decoded.phone).limit(1).maybeSingle();
      customerRow = data;
    }
    if (!customerRow && String(userId).includes('-')) {
      const { data } = await supabaseService
        .from('customers').select('id, referral_code').eq('id', userId).maybeSingle();
      customerRow = data;
    }
    if (!customerRow) return res.status(404).json({ success: false, message: 'Customer not found' });

    let code = customerRow.referral_code;
    if (!code) {
      code = generateReferralCode();
      await supabaseService.from('customers').update({ referral_code: code }).eq('id', customerRow.id);
    }

    const { data: referrals } = await supabaseService
      .from('referrals').select('status, reward_amount').eq('referrer_customer_id', customerRow.id);

    const totalReferred = (referrals || []).length;
    const totalEarned = (referrals || [])
      .filter((r) => r.status === 'rewarded')
      .reduce((sum, r) => sum + Number(r.reward_amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: { code, totalReferred, totalEarned, rewardAmount: REFERRAL_REWARD_AMOUNT },
    });
  } catch (err) {
    console.error('GET /api/customer/referral-info error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch referral info' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REMOVED 2026-08-07: POST /api/wallet/deduct-and-credit
//
// Dead code that was still live. No screen in either app called it (verified by
// grep across both src trees), yet it accepted an arbitrary `amount` from any
// authenticated customer and moved it from that customer to whichever vendor
// owned the supplied sessionId — with no session-membership check at all.
//
// It also wrote its ledger row using the raw JWT userId instead of the resolved
// customer UUID, which is where the 11 orphaned wallet_transactions rows
// belonging to "user_1781452835500" came from.
//
// Per-minute billing does not go through here — it runs server-side in
// sessionManager.processBilling() via the process_session_billing RPC.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER WALLET RECHARGE (Razorpay) — server-verified, replaces the old
// client-only RazorpayCheckout.open() call that never touched the backend at all.
//
// Flow: create-order (server creates the Razorpay Order, amount is server-trusted)
//   → app pays against that order_id → verify-payment (HMAC signature check,
//   idempotent on razorpay_payment_id) → only then is wallet_balance credited.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_RECHARGE_RUPEES = 1;
const MAX_RECHARGE_RUPEES = 100000; // sanity ceiling — adjust if a legitimate need arises

app.post('/api/wallet/create-order', async (req, res) => {
  try {
    if (!razorpay.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Payments are temporarily unavailable' });
    }
    const customer = await resolveCustomerFromReq(req);
    if (!customer?.id) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < MIN_RECHARGE_RUPEES || amount > MAX_RECHARGE_RUPEES) {
      return res.status(400).json({ success: false, message: `Amount must be between ₹${MIN_RECHARGE_RUPEES} and ₹${MAX_RECHARGE_RUPEES}` });
    }

    const order = await razorpay.createOrder(amount, `wr_${Date.now()}`);

    const { error: insertErr } = await supabaseService.from('wallet_recharges').insert([{
      customer_id: customer.id,
      amount,
      razorpay_order_id: order.id,
      status: 'created',
    }]);
    if (insertErr) throw insertErr;

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount,
      currency: order.currency,
      keyId: razorpay.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('POST /api/wallet/create-order error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Could not start payment' });
  }
});

app.post('/api/wallet/verify-payment', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer?.id) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    const validSignature = razorpay.verifySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!validSignature) {
      await supabaseService.from('wallet_recharges')
        .update({ status: 'failed' })
        .eq('razorpay_order_id', razorpay_order_id)
        .eq('customer_id', customer.id)
        .eq('status', 'created');
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Atomic claim: only succeeds once per order, for the customer that created it. A second
    // verify call for the same order (retry, double-tap, replay) finds 0 rows and is a no-op —
    // NOT an error, since the first call may have already credited the wallet successfully.
    const { data: claimed, error: claimErr } = await supabaseService
      .from('wallet_recharges')
      .update({ razorpay_payment_id, status: 'paid', paid_at: new Date().toISOString() })
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('customer_id', customer.id)
      .eq('status', 'created')
      .select();
    if (claimErr) throw claimErr;

    if (!claimed || !claimed.length) {
      const { data: existing } = await supabaseService
        .from('wallet_recharges')
        .select('status')
        .eq('razorpay_order_id', razorpay_order_id)
        .eq('customer_id', customer.id)
        .single();
      if (existing?.status === 'paid') {
        const { data: cust } = await supabaseService.from('customers').select('wallet_balance').eq('id', customer.id).single();
        return res.status(200).json({ success: true, alreadyProcessed: true, newBalance: cust?.wallet_balance ?? null });
      }
      return res.status(409).json({ success: false, message: 'Order not found or not payable' });
    }

    const rechargeRow = claimed[0];

    // Balance change + ledger row in one transaction. Keyed on the Razorpay
    // payment id, so even if the status claim above were somehow bypassed the
    // credit still cannot be applied twice.
    const newBalance = await wallet.adjustCustomerWallet(customer.id, Number(rechargeRow.amount), {
      description: `Wallet recharge via Razorpay (payment ${razorpay_payment_id})`,
      idempotencyKey: `razorpay:${razorpay_payment_id}`,
    });

    return res.status(200).json({ success: true, newBalance });
  } catch (err) {
    console.error('POST /api/wallet/verify-payment error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not verify payment' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FREE BOT CHAT: no wallet reward anymore — this just marks the one-time free
// 5-min demo chat as used (column name kept as-is; it no longer means "paid").
// Called the moment the chat screen mounts, not on completion, so it sticks
// regardless of how the customer leaves — natural end, manual end, or the app
// getting closed/killed mid-chat. The referral nudge shown after the chat ends
// (ReferralPromptHost) is the replacement incentive.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/free-bot-chat/mark-used', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer?.id) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { data: custRow, error: readErr } = await supabaseService
      .from('customers')
      .select('free_bot_chat_credited_at')
      .eq('id', customer.id)
      .single();
    if (readErr) throw readErr;

    if (!custRow?.free_bot_chat_credited_at) {
      await supabaseService
        .from('customers')
        .update({ free_bot_chat_credited_at: new Date().toISOString() })
        .eq('id', customer.id);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/free-bot-chat/mark-used error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not update' });
  }
});

// Persona/card shown in the free-bot-chat welcome popup — admin-editable via
// PATCH /api/admin/settings (key: free_bot_chat_persona, a JSON string), same
// key/value app_settings table already used for the banner interval and
// session-replay toggle, so no new migration is needed. Falls back to the
// original hardcoded demo persona if never configured or on any error, so an
// unconfigured/misconfigured value can never break the popup for customers.
const FREE_BOT_CHAT_PERSONA_DEFAULT = {
  enabled: true,
  name: 'Acharya Priya',
  image: '',
  experience: '12 years',
  specialities: 'Love & Relationship, Career, Vedic Astrology',
  headerText: "🎁 Here's your free chat for 5 minutes with an astrologer!",
  ctaText: 'Start Free Chat Now',
};
app.get('/api/free-bot-chat/persona', async (req, res) => {
  try {
    const raw = await getSetting('free_bot_chat_persona', null);
    if (!raw) return res.status(200).json(FREE_BOT_CHAT_PERSONA_DEFAULT);
    const parsed = JSON.parse(raw);
    return res.status(200).json({ ...FREE_BOT_CHAT_PERSONA_DEFAULT, ...parsed });
  } catch (err) {
    console.error('GET /api/free-bot-chat/persona error:', err.message);
    return res.status(200).json(FREE_BOT_CHAT_PERSONA_DEFAULT);
  }
});

// Customer-app "guide avatar" hint (Login + Register screens) — admin-editable
// via PATCH /api/admin/settings (key: guide_avatar_config, a JSON string), same
// app_settings table as the free-bot-chat persona above. Falls back to the
// original hardcoded copy so an unconfigured/misconfigured value never breaks
// either screen. Only enabled/text is admin-controlled — position/animation
// stay hardcoded per screen, not sensible to expose as raw pixel offsets.
const GUIDE_AVATAR_CONFIG_DEFAULT = {
  login: {
    enabled: true,
    textEn: 'First time here? Tap Register to sign up!',
    textHi: 'पहली बार यहाँ आए हैं? पंजीकरण करने के लिए टैप करें!',
  },
  register: {
    enabled: true,
    textEn: 'Fill the Information for Astrologer',
    textHi: 'ज्योतिषी के लिए जानकारी भरें',
  },
};
app.get('/api/guide-avatar/config', async (req, res) => {
  try {
    const raw = await getSetting('guide_avatar_config', null);
    if (!raw) return res.status(200).json(GUIDE_AVATAR_CONFIG_DEFAULT);
    const parsed = JSON.parse(raw);
    return res.status(200).json({
      login: { ...GUIDE_AVATAR_CONFIG_DEFAULT.login, ...parsed.login },
      register: { ...GUIDE_AVATAR_CONFIG_DEFAULT.register, ...parsed.register },
    });
  } catch (err) {
    console.error('GET /api/guide-avatar/config error:', err.message);
    return res.status(200).json(GUIDE_AVATAR_CONFIG_DEFAULT);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR WALLET: Get vendor wallet balance + transactions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/vendor/wallet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data: astroRow, error } = await supabase
      .from('astrologers')
      .select('wallet_balance')
      .eq('id', vendorId)
      .single();

    if (error) throw error;

    const { data: txns } = await supabase
      .from('vendor_wallet_transactions')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Resolve customer_id -> name in one batched query instead of one lookup per row.
    // customer_id is only populated going forward (sql/hardening_06_vendor_txn_counterparty.sql)
    // — older rows and non-customer transactions (withdrawals, admin corrections) have it
    // NULL and simply show no counterparty name, same as before this feature existed.
    const customerIds = [...new Set((txns || []).map(t => t.customer_id).filter(Boolean))];
    let nameById = {};
    if (customerIds.length > 0) {
      const { data: custRows } = await supabase
        .from('customers').select('id, name').in('id', customerIds);
      (custRows || []).forEach(c => { nameById[c.id] = c.name; });
    }

    return res.status(200).json({
      success: true,
      data: {
        balance: astroRow?.wallet_balance ?? 0,
        transactions: (txns || []).map(t => ({
          id: t.id,
          description: t.description || 'Consultation Earning',
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
          counterpartyName: t.customer_id ? (nameById[t.customer_id] || null) : null,
        })),
      },
    });
  } catch (err) {
    console.error('GET /vendor/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor wallet' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR WALLET: Request a withdrawal (deducts balance immediately, pending admin payout)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/vendor/wallet/withdraw', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid amount' });
    }

    // Service-role client — this endpoint is its own authorization boundary (JWT verified
    // above), and withdrawal_requests has RLS enabled with no anon-key insert policy.
    const db = supabaseService || supabase;

    const { data: astroRow, error: astroErr } = await db
      .from('astrologers')
      .select('wallet_balance, bank_account_holder, bank_account_number, bank_ifsc, bank_name, upi_id')
      .eq('id', vendorId)
      .single();
    if (astroErr) throw astroErr;

    // Admin has no way to actually pay out without either a bank account or a UPI id —
    // block the request at the source rather than accepting money-nowhere-to-go requests.
    const hasBankDetails = astroRow?.bank_account_number && astroRow?.bank_ifsc && astroRow?.bank_account_holder;
    const hasUpi = !!astroRow?.upi_id;
    if (!hasBankDetails && !hasUpi) {
      return res.status(400).json({
        success: false,
        message: 'Please add your bank account or UPI details in Edit Profile before requesting a withdrawal.',
      });
    }

    const currentBalance = astroRow?.wallet_balance ?? 0;
    if (amount > currentBalance) {
      return res.status(400).json({ success: false, message: 'Amount exceeds wallet balance' });
    }

    // Create the request row FIRST, before touching the balance — if this fails (as it did
    // under RLS), nothing has moved yet. Deducting first and inserting second left a prior
    // test run with money silently gone from wallet_balance and no request row to show for it.
    const { data: withdrawal, error: insertErr } = await db
      .from('withdrawal_requests')
      .insert([{
        astrologer_id: vendorId,
        amount,
        status: 'pending',
        bank_account_holder: astroRow.bank_account_holder || null,
        bank_account_number: astroRow.bank_account_number || null,
        bank_ifsc: astroRow.bank_ifsc || null,
        bank_name: astroRow.bank_name || null,
        upi_id: astroRow.upi_id || null,
      }])
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Put the money on hold. countEarnings:false — a withdrawal reduces the
    // balance but must not reduce today_earnings/total_earnings, which are
    // reporting figures on their own reset schedule.
    // The balance check above is advisory only; the authoritative one is inside
    // the function's UPDATE, so two withdrawal taps cannot both pass it.
    let newBalance;
    try {
      newBalance = await wallet.adjustVendorWallet(vendorId, -amount, {
        description: 'Withdrawal requested',
        requestId: withdrawal.id,
        idempotencyKey: `withdrawal:${withdrawal.id}`,
        countEarnings: false,
      });
    } catch (holdErr) {
      // Nothing moved — pull the request back out rather than leave a "pending"
      // row for money that was never actually held.
      await db.from('withdrawal_requests').delete().eq('id', withdrawal.id);
      if (holdErr instanceof wallet.InsufficientFunds) {
        return res.status(400).json({ success: false, message: 'Amount exceeds wallet balance' });
      }
      throw holdErr;
    }

    return res.status(200).json({ success: true, newBalance, withdrawal });
  } catch (err) {
    console.error('POST /vendor/wallet/withdraw error:', err.message, err.details, err.hint);
    // A broken wallet function is our problem, not the astrologer's. Saying
    // "Withdrawal request failed" for it reads as though they did something wrong
    // and invites them to retry a call that cannot succeed. Nothing moved — the
    // hold's own catch already removed the request row — so say so plainly.
    if (err instanceof wallet.WalletFunctionAmbiguous) {
      return res.status(503).json({
        success: false,
        message: 'Withdrawals are temporarily unavailable due to a server issue. Your balance is unchanged — please try again later.',
      });
    }
    return res.status(500).json({ success: false, message: 'Withdrawal request failed' });
  }
});

// GET vendor's own withdrawal request history
app.get('/vendor/wallet/withdrawals', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data, error } = await (supabaseService || supabase)
      .from('withdrawal_requests')
      .select('*')
      .eq('astrologer_id', vendorId)
      .order('requested_at', { ascending: false });
    if (error) throw error;

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    console.error('GET /vendor/wallet/withdrawals error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawal history' });
  }
});

// GET vendor's own performance metrics — response time, acceptance rate, repeat-customer rate.
app.get('/vendor/performance', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const metrics = await computeAstrologerMetrics(supabaseService || supabase, [vendorId]);
    return res.status(200).json({ success: true, data: metrics[vendorId] || null });
  } catch (err) {
    console.error('GET /vendor/performance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch performance metrics' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE NOTES — proactive check-ins from an astrologer to a past customer, no active
// session required. Audio is uploaded client-side via the existing /api/upload-image
// endpoint (which also accepts audio/* — see uploadRoutes.js) before calling this.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/vendor/voice-notes', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { customerId, audioUrl, durationSeconds } = req.body || {};
    if (!customerId || !audioUrl) {
      return res.status(400).json({ success: false, message: 'customerId and audioUrl are required' });
    }

    const { data: note, error } = await supabaseService
      .from('voice_notes')
      .insert([{
        astrologer_id: vendorId,
        customer_id: customerId,
        audio_url: audioUrl,
        duration_seconds: durationSeconds || null,
      }])
      .select()
      .single();
    if (error) throw error;

    const [{ data: astro }, { data: cust }] = await Promise.all([
      supabaseService.from('astrologers').select('first_name, last_name').eq('id', vendorId).single(),
      supabaseService.from('customers').select('fcm_token').eq('id', customerId).single(),
    ]);
    const astroName = `${astro?.first_name || ''} ${astro?.last_name || ''}`.trim() || 'Your astrologer';

    if (cust?.fcm_token) {
      sendPush(cust.fcm_token, {
        title: `${astroName} sent you a voice note`,
        body: 'Tap to listen — checking in on how you\'re doing.',
        data: { type: 'voice_note', noteId: note.id },
      }).catch((e) => console.error('[voice-notes] push error:', e.message));
    }

    return res.status(200).json({ success: true, data: note });
  } catch (err) {
    console.error('POST /api/vendor/voice-notes error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send voice note' });
  }
});

// Resolves a bounded set of customer ids to display name + photo — replaces the
// vendor app's session-history screens' direct reads of `customers` (some of
// which had no filter at all, dumping the whole table just to build a lookup
// map). `customers` gets REVOKE ALL with no grant back under hardening_02 since
// it carries every user's PII — see DATABASE_HARDENING_HANDOFF.md §3.1/§3.2.
// Any authenticated caller may resolve any id here (this only returns a display
// name and a public photo URL, not PII), but the request must supply the exact
// ids it wants — this is not a way to enumerate/dump the table.
app.post('/api/customers/names', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);

    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(Boolean))] : [];
    if (!ids.length) return res.status(200).json({ success: true, data: {} });

    const { data, error } = await supabaseService
      .from('customers')
      .select('id, name, profile_image')
      .in('id', ids);
    if (error) throw error;

    const byId = {};
    (data || []).forEach((c) => {
      byId[c.id] = {
        name: c.name || 'Customer',
        profileImage: c.profile_image || null,
      };
    });
    return res.status(200).json({ success: true, data: byId });
  } catch (err) {
    console.error('POST /api/customers/names error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer names' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Vendor's own profile / wallet — replaces the vendor app's direct anon-key reads
// of the astrologers table (bank details, wallet_balance, full profile) so that
// table's anon SELECT grant can be restricted to public-facing columns only.
// See DATABASE_HARDENING_HANDOFF.md §3.1/§3.2, sql/hardening_02_access_control.sql.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/vendor/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data, error } = await supabaseService
      .from('astrologers')
      .select('*')
      .eq('id', vendorId)
      .single();
    if (error) throw error;
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('GET /api/vendor/profile error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor profile' });
  }
});

// SECURITY (2026-08-08): EditProfile.js used to write these columns directly via the
// anon-key Supabase client — sql/hardening_02_access_control.sql's column-level GRANT
// deliberately still allows it (comment: "the vendor app DOES write this table directly...
// EditProfile"), but that meant ANY holder of the public key could rewrite ANY astrologer's
// charge rates (not just their own), since column grants have no row-ownership concept.
// Moving the write here closes that: astroId comes only from the vendor's own JWT.
app.put('/api/vendor/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;
    if (!vendorId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const allowed = [
      'first_name', 'last_name', 'email', 'phone_number', 'gender', 'experience',
      'chat_charge_per_minute', 'call_charge_per_minute', 'video_charge_per_minute',
      'languages', 'bio', 'profile_pic_url',
      'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name', 'upi_id',
    ];
    const body = {};
    for (const k of allowed) if (k in (req.body || {})) body[k] = req.body[k];

    // Charges can only be self-set ONCE — after that, only the admin dashboard
    // (PATCH /api/admin/astrologers/:id, unaffected by this lock) or an explicit
    // admin unlock (POST /api/admin/astrologers/:id/unlock-charges) can change
    // them. All three charge fields lock together as a single event.
    const CHARGE_FIELDS = ['chat_charge_per_minute', 'call_charge_per_minute', 'video_charge_per_minute'];
    const touchesCharges = CHARGE_FIELDS.some((f) => f in body);
    let chargesRejected = false;
    if (touchesCharges) {
      const { data: existing, error: readErr } = await supabaseService
        .from('astrologers').select('charges_locked_at').eq('id', vendorId).single();
      if (readErr) throw readErr;
      if (existing?.charges_locked_at) {
        // Already locked — drop the charge fields from this write but still save
        // everything else the vendor sent (e.g. bio/photo edited at the same time).
        CHARGE_FIELDS.forEach((f) => delete body[f]);
        chargesRejected = true;
      } else {
        body.charges_locked_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseService
      .from('astrologers').update(body).eq('id', vendorId).select().single();
    if (error) throw error;
    return res.status(200).json({ success: true, data, chargesLocked: chargesRejected });
  } catch (err) {
    console.error('PUT /api/vendor/profile error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update vendor profile' });
  }
});

app.get('/api/vendor/wallet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data: astro, error } = await supabaseService
      .from('astrologers')
      .select('wallet_balance, today_earnings, total_earnings, bank_account_holder, bank_account_number, bank_ifsc, bank_name, upi_id')
      .eq('id', vendorId)
      .single();
    if (error) throw error;

    const { data: txns } = await supabaseService
      .from('vendor_wallet_transactions')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Enrich with the real customer name + session type behind each transaction — the raw
    // row only has a generic "Automated chat earning" description and a session_id, which
    // read as vague/untrustworthy to a vendor trying to reconcile "who paid me what and
    // when" (reported 2026-08-08). One batched lookup, not per-row.
    const sessionIds = [...new Set((txns || []).map((t) => t.session_id).filter(Boolean))];
    let sessionMap = {};
    if (sessionIds.length) {
      const { data: sessions } = await supabaseService
        .from('chat_sessions').select('id, caller_id, call_type').in('id', sessionIds);
      const callerIds = [...new Set((sessions || []).map((s) => s.caller_id).filter(Boolean))];
      let nameMap = {};
      if (callerIds.length) {
        const { data: customers } = await supabaseService
          .from('customers').select('id, name').in('id', callerIds);
        (customers || []).forEach((c) => { nameMap[c.id] = c.name || 'Customer'; });
      }
      (sessions || []).forEach((s) => {
        sessionMap[s.id] = { customerName: nameMap[s.caller_id] || 'Customer', callType: s.call_type || null };
      });
    }

    // Gifts (live or profile) never had this resolve — a gift's session_id, when set at
    // all, points at a live_sessions row, not chat_sessions, so the lookup above always
    // missed it and every "Gift: X" row showed no sender name. customer_id
    // (sql/hardening_06_vendor_txn_counterparty.sql) is written directly on the ledger row
    // now and doesn't depend on which table session_id happens to reference — resolve it
    // directly and prefer it over the session-based lookup above.
    const directCustomerIds = [...new Set((txns || []).map((t) => t.customer_id).filter(Boolean))];
    let directNameMap = {};
    if (directCustomerIds.length) {
      const { data: directCustomers } = await supabaseService
        .from('customers').select('id, name').in('id', directCustomerIds);
      (directCustomers || []).forEach((c) => { directNameMap[c.id] = c.name || 'Customer'; });
    }

    const enrichedTxns = (txns || []).map((t) => ({
      ...t,
      customerName: (t.customer_id && directNameMap[t.customer_id]) || sessionMap[t.session_id]?.customerName || null,
      callType: sessionMap[t.session_id]?.callType || null,
    }));

    return res.status(200).json({
      success: true,
      data: { ...astro, transactions: enrichedTxns },
    });
  } catch (err) {
    console.error('GET /api/vendor/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor wallet' });
  }
});

// Profile fields a registrant is allowed to set on their own astrologers row.
// Deliberately the exact set the Registration form collects and nothing more —
// every other column is either server-owned (see buildVendorRegistrationRow) or
// admin-owned.
const VENDOR_REG_TEXT_FIELDS = ['first_name', 'last_name', 'email', 'gender', 'fcm_token'];
const VENDOR_REG_ARRAY_FIELDS = ['languages', 'specialties'];

/**
 * Build the astrologers row for a new registration.
 *
 * This exists because /api/vendor/register used to spread req.body straight into
 * the insert. Every column on the table was therefore settable by whoever was
 * registering: approval_status (register yourself pre-approved, skipping admin
 * review), wallet_balance and total_earnings (credit yourself), the three
 * *_charge_per_minute values (which customers are billed), is_suspended, badge,
 * average_rating. A verified phone number and curl were the only prerequisites.
 *
 * The allow-list drops anything not named. The server-owned block underneath
 * then sets the sensitive columns unconditionally, so they hold even if a future
 * client stops sending them — "the current app happens to send the right values"
 * is not a security property.
 */
function buildVendorRegistrationRow(body, verifiedPhone) {
  const src = body && typeof body === 'object' ? body : {};
  const row = {};

  for (const key of VENDOR_REG_TEXT_FIELDS) {
    const value = src[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) row[key] = trimmed.slice(0, 300);
  }

  for (const key of VENDOR_REG_ARRAY_FIELDS) {
    const value = src[key];
    if (!Array.isArray(value)) continue;
    row[key] = value
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, 40)
      .map((item) => item.trim().slice(0, 120));
  }

  // Only accept a photo URL our own upload endpoint could have produced. Without
  // the scheme check this is an arbitrary string rendered as an image URL in both
  // apps and the admin dashboard.
  if (typeof src.profile_pic_url === 'string' && /^https:\/\/\S+$/i.test(src.profile_pic_url.trim())) {
    row.profile_pic_url = src.profile_pic_url.trim().slice(0, 1000);
  }

  // Years of experience, clamped to what a human could plausibly claim.
  const experience = Number.parseInt(src.experience, 10);
  row.experience = Number.isFinite(experience) ? Math.min(Math.max(experience, 0), 80) : 0;

  return {
    ...row,
    // From the verified JWT, never the body.
    phone_number: verifiedPhone,

    // ---- server-owned: not settable by the registrant, at any value ----
    approval_status: 'pending',   // nobody approves their own account
    is_suspended: false,
    badge: null,                  // recognition badges are admin-assigned
    wallet_balance: 0,
    total_earnings: 0,
    today_earnings: 0,
    average_rating: 0,
    total_reviews: 0,
    is_live: false,
    is_online: false,
    // Services start off and charges start at zero: the astrologer is hidden
    // everywhere until they set charges (EditProfile) and enable services
    // (HomeScreen), which is what the client was asking for anyway.
    is_available: false,
    is_chat_enabled: false,
    is_call_enabled: false,
    is_video_call_enabled: false,
    chat_charge_per_minute: 0,
    call_charge_per_minute: 0,
    video_charge_per_minute: 0,
    chat_price: 0,
    audio_price: 0,
    video_price: 0,
  };
}

// Vendor registration — replaces the vendor app's direct client-side INSERT into
// astrologers (VerifyOtp.js). The phone number comes from the JWT issued by the
// preceding /api/users/mobile-otp-verify call, not from the request body, so a
// verified-number's identity can't be spoofed. Returns a fresh token carrying the
// real astroId, matching what mobile-otp-verify's own comment already expected
// ("app completes registration next and gets a real token from that step instead").
app.post('/api/vendor/register', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    if (!decoded.phone) {
      return res.status(401).json({ success: false, message: 'Phone verification required' });
    }

    const { data: existing } = await supabaseService
      .from('astrologers').select('id').eq('phone_number', decoded.phone).limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'This number is already registered' });
    }

    // Allow-listed + server-owned. The terms columns are not in the allow-list,
    // so a client-sent terms_accepted_at is dropped here and re-stamped by
    // insertAccountRow from the server's own clock.
    const { data: created, error } = await insertAccountRow(
      'astrologers',
      buildVendorRegistrationRow(req.body, decoded.phone),
      'signup_form',
    );
    if (error) throw error;

    const token = jwt.sign(
      { id: created.id, userId: created.id, astroId: created.id, phone: decoded.phone, role: 'astrologer' },
      JWT_SECRET,
      { expiresIn: '30d' },
    );

    return res.status(200).json({
      success: true,
      token,
      user: { id: created.id, phoneNumber: decoded.phone, role: 'astrologer' },
    });
  } catch (err) {
    console.error('POST /api/vendor/register error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to complete registration' });
  }
});

// GET customer's own past customers this vendor has actually interacted with — powers the
// vendor's "My Customers" picker for who a voice note can be sent to.
app.get('/vendor/customers', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const vendorId = decoded.astroId || decoded.vendorId || decoded.id;

    const { data: sessions, error } = await supabaseService
      .from('chat_sessions')
      .select('caller_id, call_type, started_at, ended_at')
      .eq('vendor_id', vendorId)
      .not('caller_id', 'is', null)
      .order('started_at', { ascending: false });
    if (error) throw error;

    // Dedupe to the most recent session per customer.
    const latestByCustomer = {};
    (sessions || []).forEach((s) => {
      if (!latestByCustomer[s.caller_id]) latestByCustomer[s.caller_id] = s;
    });
    const customerIds = Object.keys(latestByCustomer);
    if (customerIds.length === 0) return res.status(200).json({ success: true, data: [] });

    // `profile_pic_url` is an astrologers column, not a customers one — customers'
    // photo field is `profile_image`. Pre-existing bug (this SELECT would have
    // failed outright with "column does not exist"), fixed in passing while
    // touching adjacent customer-photo-lookup code for the hardening_02 pass.
    const { data: customers } = await supabaseService
      .from('customers').select('id, name, profile_image').in('id', customerIds);
    const byId = {};
    (customers || []).forEach((c) => { byId[c.id] = c; });

    const data = customerIds.map((id) => ({
      id,
      name: byId[id]?.name || 'Customer',
      profileImage: byId[id]?.profile_image || null,
      lastSessionType: latestByCustomer[id].call_type,
      lastSessionAt: latestByCustomer[id].ended_at || latestByCustomer[id].started_at,
    })).sort((a, b) => new Date(b.lastSessionAt) - new Date(a.lastSessionAt));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('GET /vendor/customers error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers' });
  }
});

// GET the current customer's received voice notes.
app.get('/api/customer/voice-notes', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { data: notes, error } = await supabase
      .from('voice_notes')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const astroIds = [...new Set((notes || []).map((n) => n.astrologer_id))];
    const { data: astros } = astroIds.length
      ? await supabase.from('astrologers').select('id, first_name, last_name, profile_pic_url').in('id', astroIds)
      : { data: [] };
    const byId = {};
    (astros || []).forEach((a) => { byId[a.id] = a; });

    const data = (notes || []).map((n) => ({
      ...n,
      astrologerName: `${byId[n.astrologer_id]?.first_name || ''} ${byId[n.astrologer_id]?.last_name || ''}`.trim() || 'Astrologer',
      astrologerImage: byId[n.astrologer_id]?.profile_pic_url || null,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('GET /api/customer/voice-notes error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch voice notes' });
  }
});

app.post('/api/customer/voice-notes/:id/listened', async (req, res) => {
  try {
    const customer = await resolveCustomerFromReq(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    await supabaseService
      .from('voice_notes')
      .update({ listened_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('customer_id', customer.id);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/customer/voice-notes/:id/listened error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE STREAMING + GIFTS
// ─────────────────────────────────────────────────────────────────────────────
const GIFT_VENDOR_SHARE = 0.5; // astrologer gets 50%, platform keeps 50%

// Gift catalog (active) — used by the customer GiftModal.
app.get('/api/gifts', async (req, res) => {
  try {
    const payload = await contentCache.get('gifts:all', async () => {
      const { data, error } = await supabase
        .from('gifts').select('*').eq('is_active', true).order('sort_order', { ascending: true });
      if (error) throw error;
      return {
        data: (data || []).map((g) => ({ _id: g.id, name: g.name, price: g.price, image: g.image })),
      };
    });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/gifts error:', err.message);
    return res.status(200).json({ data: [] });
  }
});

// Astrologers currently broadcasting — customer Live list + Home strip.
app.get('/api/live/active', async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from('live_sessions').select('*').eq('is_active', true).order('started_at', { ascending: false });
    if (error) throw error;
    if (!sessions || sessions.length === 0) return res.status(200).json({ data: [] });

    const astroIds = sessions.map((s) => s.astrologer_id);
    const { data: astros } = await supabase.from('astrologers').select('*').in('id', astroIds);
    const categoryMap = await buildCategoryMap();
    const byId = {};
    // Same eligibility gate as every other customer-facing list — a suspended or
    // never-approved astrologer must not appear here even if their live_sessions row
    // is still (incorrectly, or from before they were suspended) marked active.
    (astros || []).filter(astrologerVisibleToCustomers).forEach((a, i) => { byId[a.id] = formatAstrologer(a, i, categoryMap); });

    const data = sessions
      .filter((s) => byId[s.astrologer_id])
      .map((s) => ({
        ...byId[s.astrologer_id],
        sessionId: s.id,
        title: s.title || 'Live now',
        viewerCount: s.viewer_count || 0,
        isLive: true,
      }));
    return res.status(200).json({ data });
  } catch (err) {
    console.error('GET /api/live/active error:', err.message);
    return res.status(200).json({ data: [] });
  }
});

// Vendor starts broadcasting.
// SECURITY (fixed 2026-08-08): had zero auth — astrologerId came straight from the body, so
// anyone could start (or repeatedly restart) a "live" broadcast impersonating any astrologer.
// astroId is now taken only from the vendor's own JWT, never from the request body.
app.post('/api/live/start', async (req, res) => {
  try {
    const astrologerId = await resolveVendorIdFromReq(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // A suspended or not-yet-approved astrologer must not be able to broadcast at all —
    // resolveVendorIdFromReq only proves the JWT belongs to this astrologer, it says
    // nothing about their approval/suspension state.
    const { data: astroRow } = await supabaseService
      .from('astrologers')
      .select('approval_status, is_suspended')
      .eq('id', astrologerId)
      .single();
    if (!astroRow || astroRow.approval_status !== 'approved' || astroRow.is_suspended === true) {
      return res.status(403).json({ success: false, message: 'Your account is not eligible to go live.' });
    }

    const { title } = req.body || {};
    // Close any stale active session for this astrologer first.
    await supabaseService.from('live_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('astrologer_id', astrologerId).eq('is_active', true);

    const { data, error } = await supabaseService.from('live_sessions')
      .insert([{ astrologer_id: astrologerId, title: title || 'Live now', is_active: true }])
      .select().single();
    if (error) throw error;
    await supabaseService.from('astrologers').update({ is_live: true }).eq('id', astrologerId);
    return res.status(200).json({ success: true, sessionId: data.id });
  } catch (err) {
    console.error('POST /api/live/start error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to start live' });
  }
});

// End a broadcast (vendor End Live, or admin force-stop reuses this logic).
async function endLiveSession(sessionId, reason) {
  const { data: sess } = await supabaseService.from('live_sessions')
    .select('astrologer_id').eq('id', sessionId).single();
  await supabaseService.from('live_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', sessionId);
  if (sess?.astrologer_id) {
    await supabaseService.from('astrologers').update({ is_live: false }).eq('id', sess.astrologer_id);
    // Same "just freed up" hook used on session end / stale-request timeout — an astrologer
    // ending their broadcast is another moment busyStatus flips back to free.
    notifyWaitlistIfFree(supabaseService, sendPush, sess.astrologer_id).catch((e) =>
      console.error('[live] notifyWaitlistIfFree error:', e.message));
  }
  io.to('live_' + sessionId).emit('live_ended', { sessionId, reason: reason || 'ended' });
}

// SECURITY (fixed 2026-08-08): had zero auth — anyone who read a sessionId off the public
// GET /api/live/active list could force-end any astrologer's broadcast on demand. Now
// requires the vendor's own JWT and checks the session actually belongs to that vendor.
// Admin force-stop bypasses this route entirely (calls endLiveSession() directly via
// app.locals.endLiveSession — see adminRoutes.js), so admin behavior is unaffected.
app.post('/api/live/:id/end', async (req, res) => {
  try {
    const astroId = await resolveVendorIdFromReq(req);
    if (!astroId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { data: sess } = await supabaseService
      .from('live_sessions')
      .select('astrologer_id')
      .eq('id', req.params.id)
      .single();
    if (!sess || sess.astrologer_id !== astroId) {
      return res.status(403).json({ success: false, message: 'Not your broadcast' });
    }
    await endLiveSession(req.params.id, 'broadcaster_ended');
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('POST /api/live/:id/end error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to end live' });
  }
});

// Customer sends a gift (live or profile). Money: customer wallet → astrologer wallet
// (50%); the rest is platform revenue, recorded in gift_transactions.
app.post('/api/gift/send', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    const { astrologerId, giftId, context, sessionId, clientRequestId } = req.body || {};
    if (!astrologerId || !giftId) {
      return res.status(400).json({ success: false, message: 'astrologerId and giftId required' });
    }

    // Resolve real customer row.
    //
    // `name` is selected here specifically for the live gift toast below. It used
    // to read the sender's name off the JWT (`decoded.name`), but the customer
    // token is signed as { id, userId, phone, role } — there is no name claim in
    // it at all, so that was undefined on EVERY request and the toast always
    // rendered the "Someone" fallback. Reading it from the row is also the right
    // source on principle: it's the authoritative name, and unlike a
    // client-supplied one it can't be spoofed into someone else's credit.
    let customer = null;
    if (decoded.phone) {
      const { data } = await supabase.from('customers').select('id, name, wallet_balance').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) customer = data[0];
    }
    if (!customer && String(userId).includes('-')) {
      const { data } = await supabase.from('customers').select('id, name, wallet_balance').eq('id', userId).single();
      if (data) customer = data;
    }
    if (!customer) return res.status(400).json({ success: false, message: 'Customer not found' });

    // Gift price
    const { data: gift, error: giftErr } = await supabase.from('gifts').select('*').eq('id', giftId).single();
    if (giftErr || !gift) return res.status(400).json({ success: false, message: 'Gift not found' });
    const amount = Number(gift.price) || 0;

    const balance = Number(customer.wallet_balance) || 0;
    if (balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const vendorCredit = Math.round(amount * GIFT_VENDOR_SHARE);
    const platformCut = amount - vendorCredit;

    // 1+2. Debit the customer and credit the astrologer as one transaction.
    // Previously these were four separate statements, so a failure between them
    // could take money from the customer and never credit the astrologer — or
    // credit the astrologer for a debit that never landed.
    // SECURITY (fixed 2026-08-14 — money/billing audit): the idempotency key used to embed
    // Date.now(), which is unique on every call by construction — defeating the whole point
    // of an idempotency key (wallet.js's own doc comment warns against exactly this: "never a
    // random value"). A double-tap or network-layer retry of the same "send gift" action
    // generated a fresh key each time and was charged twice. Newer app builds send a stable
    // clientRequestId (one per tap, reused across any retry of that tap) which is used
    // directly. Older, not-yet-updated clients that don't send one fall back to a 5-second
    // time bucket instead of a raw timestamp — still lets a user send the same gift again
    // deliberately a few seconds later, but collapses a rapid double-tap/retry into one charge.
    const giftIdempotencyKey = clientRequestId
      ? `gift:${customer.id}:${giftId}:${clientRequestId}`
      : `gift:${customer.id}:${giftId}:${Math.floor(Date.now() / 5000)}`;

    let giftBalances;
    try {
      giftBalances = await wallet.transferCustomerToVendor(customer.id, astrologerId, amount, {
        vendorAmount: vendorCredit,
        description: `Gift: ${gift.name}`,
        sessionId: sessionId || null,
        idempotencyKey: giftIdempotencyKey,
      });
    } catch (giftErr2) {
      if (giftErr2 instanceof wallet.InsufficientFunds) {
        return res.status(400).json({ success: false, message: 'Insufficient balance' });
      }
      throw giftErr2;
    }

    // 3. Record the gift (platform_cut = platform revenue)
    await supabaseService.from('gift_transactions').insert([{
      sender_id: customer.id, astrologer_id: astrologerId, gift_id: giftId, gift_name: gift.name,
      amount, vendor_credit: vendorCredit, platform_cut: platformCut,
      context: context || 'profile', session_id: sessionId || null,
    }]);

    // 4. If live, bump the session total and broadcast a gift toast
    if (context === 'live' && sessionId) {
      const { data: ls } = await supabaseService.from('live_sessions').select('total_gift_amount').eq('id', sessionId).single();
      await supabaseService.from('live_sessions')
        .update({ total_gift_amount: (Number(ls?.total_gift_amount) || 0) + amount }).eq('id', sessionId);
      // The viewer/broadcaster feeds render this as "<name> sent <gift> (₹N)",
      // and both already fall back to their own localized "Someone" when `name`
      // is blank — so send the real name and let a genuinely nameless account
      // (profile never filled in) hit that fallback, rather than sending the
      // literal English word "Someone" to a Hindi viewer.
      const senderName = (customer.name || '').trim() || null;
      io.to('live_' + sessionId).emit('live_gift', {
        sessionId, giftName: gift.name, amount, name: senderName,
      });
    }

    return res.status(200).json({ success: true, newBalance: giftBalances.customerBalance });
  } catch (err) {
    console.error('POST /api/gift/send error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send gift' });
  }
});

// Expose for admin force-stop (used in adminRoutes via app.locals)
app.locals.endLiveSession = endLiveSession;

// Live Aarti / Pooja channel poller (src/liveAarti.js). Exposed on app.locals
// so the admin "refresh now" route can trigger a poll without importing the
// instance — same pattern as endLiveSession above.
const liveAartiPoller = createLiveAartiPoller(supabaseService);
app.locals.pollLiveAarti = () => liveAartiPoller.pollOnce();

// Catch-all Express error handler — must be registered last, after every route.
// Routes that already catch their own errors (most do, via try/catch + res.status(500))
// never reach this; it exists for anything that throws/rejects outside those blocks.
app.use((err, req, res, next) => {
  logError('express', err, { method: req.method, url: req.originalUrl });
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`🚀 Astrowani backend server is running on http://localhost:${PORT}`);

  // DISABLE_SESSION_MANAGER=1 boots the HTTP API without the background loops.
  // Those loops write to the shared database the moment they start —
  // checkEarningsResets() zeroes today_earnings across every astrologer, and
  // markStaleRequestsMissed() flips pending requests to 'missed'. Running a
  // local instance against production credentials to test an endpoint would
  // otherwise silently corrupt live data. Never set this on the real server.
  // One Realtime subscription for the whole system, rebroadcast over Socket.io,
  // replacing the four per-user subscriptions the customer app used to open.
  // Starts regardless of DISABLE_SESSION_MANAGER below: this is read-only — it
  // observes changes and emits socket events, and never writes to the database.
  // See src/astrologerFanout.js.
  startAstrologerFanout({
    io,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
    onChange: () => astrologerListCache.invalidate('astrologers:'),
  });

  // Same fanout pattern applied to the three other tables the 2026-08-13 perf
  // audit found still using the old per-client unfiltered-subscription anti-
  // pattern (finding G2) — see src/tableFanout.js. Each app-side hook
  // (useBlogListSync / useLiveListSync / useRemedyListSync) listens for the
  // matching event on the shared socket instead of opening its own Supabase
  // Realtime channel.
  const fanoutKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  startTableFanout({
    io, supabaseUrl: SUPABASE_URL, supabaseKey: fanoutKey,
    table: 'blogs', eventName: 'blogs_changed',
    // No onChange here — GET /api/blogs is a direct paginated Supabase query,
    // never wrapped in contentCache (unlike remedies/gifts/astro-services), so
    // there is nothing to invalidate. The socket event alone is what matters:
    // it tells BlogList.js/Home.js to refetch.
  });
  startTableFanout({
    io, supabaseUrl: SUPABASE_URL, supabaseKey: fanoutKey,
    table: 'live_sessions', eventName: 'live_sessions_changed',
    onChange: () => astrologerListCache.invalidate('astrologers:live'),
  });
  startTableFanout({
    io, supabaseUrl: SUPABASE_URL, supabaseKey: fanoutKey,
    table: 'remedy_items', eventName: 'remedy_items_changed',
    onChange: () => contentCache.invalidate('remedies:'),
  });

  // DISABLE_SESSION_MANAGER gates only the loops that WRITE.
  if (process.env.DISABLE_SESSION_MANAGER === '1') {
    console.warn('[startup] DISABLE_SESSION_MANAGER=1 — billing, earnings resets and the ' +
      'stale-request sweep are OFF. This must never be set in production.');
    return;
  }
  sessionManager.start(io); // Start the SessionManager with io instance

  // Live Aarti detection. Read-only against YouTube plus a cache write, so it
  // is NOT gated by DISABLE_SESSION_MANAGER (that flag is about money-writing
  // loops) — but it is started after it, so a disabled session manager returns
  // above and this stays off too on a machine deliberately running inert.
  liveAartiPoller.start();
});

