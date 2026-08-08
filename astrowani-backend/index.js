require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./src/push');
const { computeAstrologerMetrics } = require('./src/astrologerMetrics');
const { logError } = require('./src/errorLogger');
const { checkAstrologerBusy, buildBusyMap } = require('./src/busyStatus');
const { notifyWaitlistIfFree } = require('./src/waitlist');
const { initSentry } = require('./src/sentry');
const razorpay = require('./src/razorpay');
// Every rupee moves through this module — see src/wallet.js for why.
const wallet = require('./src/wallet');
const { TtlCache } = require('./src/ttlCache');
const { startAstrologerFanout } = require('./src/astrologerFanout');
const {
  applyHttpHardening, otpLimiter, authLimiter, writeLimiter,
} = require('./src/httpHardening');

// No-op until SENTRY_DSN is set in the environment — see MD files/deployment-and-releases.md.
initSentry();

// Last-resort capture so unexpected errors are visible to the bug-scanning
// agent instead of only scrolling past in console output. Neither handler
// changes existing crash/restart behavior — errors are logged, not swallowed
// into a process.exit() that wasn't there before.
process.on('uncaughtException', (err) => logError('uncaughtException', err));
process.on('unhandledRejection', (reason) => logError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))));

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
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
  'approval_status', 'is_suspended',
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
  };
}

// Recomputes an astrologer's cached average_rating + total_reviews from their
// non-hidden reviews. Called after any review insert/update/delete/hide so the
// list/profile endpoints can read the aggregate without a per-row join.
async function recomputeAstrologerRating(astrologerId) {
  try {
    const { data: rows } = await supabaseService
      .from('reviews')
      .select('rating')
      .eq('astrologer_id', astrologerId)
      .eq('is_hidden', false);
    const list = rows || [];
    const total = list.length;
    const avg = total
      ? Math.round((list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) * 10) / 10
      : 0;
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

io.on('connection', (socket) => {
  console.log('A user connected via Socket.io:', socket.id);

  socket.on('join_room', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room.`);
  });

  socket.on('join_session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session room: ${sessionId}`);
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

  socket.on('signal_connection', async (data) => {
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
  socket.on('live_join', (data) => {
    if (!data?.sessionId || !data?.astrologerId || !data?.viewerId) return;
    socket.join('live_' + data.sessionId);
    io.to(data.astrologerId).emit('live_viewer_joined', data);
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

// Notification management (admin broadcast/personal send + history)
require('./src/notificationRoutes')(app);

// Paid astrology reports (JyotishamAstroAPI) — /api/astro/* + public /api/astro-services
require('./src/astroRoutes')(app);

// Free astrology services (JyotishamAstroAPI) — /api/free-services/* (panchang, horoscope,
// janam-kundali, kundali-match). No auth, no wallet charge.
require('./src/freeServicesRoutes')(app);

// Image upload — base64 -> Supabase Storage URL (POST /api/upload-image)
require('./src/uploadRoutes')(app);

// In-memory store for OTPs (In production, use Redis or Database)
const otpStore = new Map();

// EnableX Credentials for the SMS/OTP project specifically ("OTP Atrowani").
// Distinct from ENABLEX_APP_ID/ENABLEX_APP_KEY, which belong to a different EnableX project.
const ENABLEX_APP_ID = process.env.ENABLEX_APP_ID_otp_message;
const ENABLEX_APP_KEY = process.env.ENABLEX_APP_KEY_otp_message;

// EnableX SMS project "OTP Atrowani" — Campaign Cloud campaign "OTP astrowani"
const ENABLEX_SMS_CAMPAIGN_ID = '1245560';
const ENABLEX_SMS_TEMPLATE_ID = '463430427'; // "OTP for astrowani" (DLT 1207172007863021380): "Hi user, your OTP is {$var1} for Login on – Astrowaniindia"
const ENABLEX_SMS_SENDER_ID = 'ASTRWI';

// Referral codes — 7 chars, excludes visually-ambiguous characters (0/O, 1/I).
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// EnableX requires E.164 numbers (with country code). Assumes India (+91) for bare 10-digit numbers.
function toE164(phoneNumber) {
  const digits = String(phoneNumber).replace(/\D/g, '');
  if (phoneNumber.startsWith('+')) return phoneNumber;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Endpoint to request an OTP
 */
app.post('/api/users/mobile-otp-request', otpLimiter, async (req, res) => {
  const { phoneNumber, role, intent } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  // Login must not silently create an account, and signup must not silently log an
  // existing user in — both would send an OTP either way, hiding the actual problem.
  // Only enforced when the caller explicitly says which flow this is (`intent`); callers
  // that don't send it keep the old permissive (either-is-fine) behavior.
  if (intent === 'login' || intent === 'signup') {
    const table = role === 'astrologer' || role === 'vendor' ? 'astrologers' : 'customers';
    const idColumn = table === 'astrologers' ? 'phone_number' : 'mobile';
    const { data: existing } = await supabase.from(table).select('id').eq(idColumn, phoneNumber).limit(1);
    const accountExists = !!(existing && existing.length);

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

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const sessionId = Date.now().toString(); // Simple session ID

  // Store the OTP
  otpStore.set(phoneNumber, {
    otp,
    sessionId,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiry
  });

  console.log(`Generated OTP for ${phoneNumber}: ${otp} (Session: ${sessionId})`);

  // Send OTP via EnableX SMS API using the DLT-approved "OTP for astrowani" template
  if (ENABLEX_APP_ID && ENABLEX_APP_KEY) {
    try {
      const authHeader = Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64');

      const payload = {
        from: ENABLEX_SMS_SENDER_ID,
        to: [toE164(phoneNumber)],
        type: 'sms',
        campaign_id: ENABLEX_SMS_CAMPAIGN_ID,
        template_id: ENABLEX_SMS_TEMPLATE_ID,
        data: { var1: otp }, // fills {$var1} in the approved template
        data_coding: 'plain',
      };

      const enxResponse = await axios.post('https://api.enablex.io/sms/v1/messages/', payload, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('EnableX SMS sent successfully. job_id:', enxResponse.data?.job_id);
    } catch (error) {
      console.error('Failed to send SMS via EnableX:', error?.response?.data || error.message);
      // Even if SMS fails, you might want to return an error, but for testing we continue
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
app.post('/api/users/mobile-otp-verify', authLimiter, async (req, res) => {
  const { phoneNumber, otp, fcmToken, role, referralCode } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
  }

  const storedData = otpStore.get(phoneNumber);

  if (!storedData) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this number' });
  }

  if (Date.now() > storedData.expiresAt) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ success: false, message: 'OTP has expired' });
  }

  if (storedData.otp !== otp.toString()) {
    return res.status(400).json({ success: false, message: 'Invalid OTP' });
  }

  // OTP is valid!
  otpStore.delete(phoneNumber); // Clear OTP after successful use

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

        const { data: newCustomer, error: insertError } = await supabaseService
          .from('customers')
          .insert([{
            mobile: phoneNumber,
            wallet_balance: 0,
            fcm_token: fcmToken || null,
            referral_code: generateReferralCode(),
          }])
          .select('id')
          .single();
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
    const placement = req.query.placement || 'home_primary';
    let bannerQuery = supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
      .eq('placement', placement)
      .order('sort_order', { ascending: true });
    if (app_ === 'customer' || app_ === 'vendor') {
      bannerQuery = bannerQuery.or(`app.eq.${app_},app.eq.both`);
    }
    const [{ data, error }, intervalRaw] = await Promise.all([
      bannerQuery,
      getSetting('banner_interval_seconds', '4'),
    ]);
    if (error) throw error;
    const intervalSeconds = Math.max(1, Number(intervalRaw) || 4);
    return res.status(200).json({
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
    });
  } catch (err) {
    console.error('GET /api/banners/all error:', err.message);
    return res.status(200).json({ data: [], intervalSeconds: 4 });
  }
});

// Thought of the Day — latest active row (table `thoughts`).
app.get('/api/thoughts/latest', async (req, res) => {
  try {
    const { data } = await supabase
      .from('thoughts')
      .select('text, author, text_hi, author_hi')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = data && data[0];
    return res.status(200).json({
      thoughtText: latest?.text || 'Welcome to Astrowani!',
      author: latest?.author || '',
      hindi: {
        thoughtText: latest?.text_hi || latest?.text || 'एस्ट्रोवाणी में आपका स्वागत है!',
        author: latest?.author_hi || latest?.author || '',
      },
    });
  } catch (err) {
    console.error('GET /api/thoughts/latest error:', err.message);
    return res.status(200).json({ thoughtText: 'Welcome to Astrowani!' });
  }
});

// Categories — admin-authored (table `categories`), shape preserved.
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return res.status(200).json({
      categories: (data || []).map((c) => ({
        _id: c.id,
        name: c.name,
        image: c.image,
        hindi: { name: c.name_hi || c.name },
      })),
    });
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
      hindi: { title: b.title_hi || '', content: b.content_hi || '' },
    }));

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
    let query = supabase
      .from('remedy_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (req.query.type) query = query.eq('type', req.query.type);
    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json({
      data: (data || []).map((r) => ({
        _id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        price: r.price,
        image: r.image,
        hindi: { title: r.title_hi || r.title, description: r.description_hi || r.description },
      })),
    });
  } catch (err) {
    console.error('GET /api/remedies error:', err.message);
    return res.status(200).json({ data: [] });
  }
});

// Place an order for a remedy item (payment gateway wired later).
app.post('/api/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);

    const { itemId, quantity, customerName, customerPhone, address } = req.body || {};
    if (!itemId) return res.status(400).json({ success: false, message: 'itemId required' });

    // Resolve the item (server-trusted price/title/type)
    const { data: item, error: itemErr } = await supabase
      .from('remedy_items').select('*').eq('id', itemId).single();
    if (itemErr || !item) return res.status(404).json({ success: false, message: 'Item not found' });

    // Resolve the real customer UUID (JWT phone → customers.id), same pattern as wallet.
    let customerId = decoded.userId || decoded.id;
    if (decoded.phone) {
      const { data: cData } = await supabase
        .from('customers').select('id').eq('mobile', decoded.phone).limit(1);
      if (cData && cData.length > 0) customerId = cData[0].id;
    }
    if (!customerId || !String(customerId).includes('-')) customerId = null;

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const { data: order, error } = await supabaseService.from('orders').insert([{
      customer_id: customerId,
      item_id: item.id,
      item_title: item.title,
      item_type: item.type,
      price: item.price,
      quantity: qty,
      total: Number(item.price) * qty,
      customer_name: customerName || null,
      customer_phone: customerPhone || decoded.phone || null,
      address: address || null,
      status: 'placed',
      payment_status: 'pending',
    }]).select().single();
    if (error) throw error;

    return res.status(200).json({ success: true, order });
  } catch (err) {
    console.error('POST /api/orders error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});

// Customer's own order history — needed for life_report orders, where the finished
// report_content (written by admin once prepared) is delivered here rather than shipped.
app.get('/api/orders/mine', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);

    let customerId = decoded.userId || decoded.id;
    if (decoded.phone) {
      const { data: cData } = await supabase
        .from('customers').select('id').eq('mobile', decoded.phone).limit(1);
      if (cData && cData.length > 0) customerId = cData[0].id;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    console.error('GET /api/orders/mine error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

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

// Live Astrologers — real data from Supabase where is_available = true
app.get('/api/astrologers/liveAstrologers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('astrologers')
      .select('*')
      .eq('is_available', true);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // Live section also respects the approval + profile-complete gates.
    const visibleRows = data.filter(astrologerVisibleToCustomers);

    const [categoryMap, busyMap] = await Promise.all([buildCategoryMap(), buildBusyMap(supabase)]);
    const formattedData = visibleRows.map((astro, index) => formatAstrologer(astro, index, categoryMap, busyMap));

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

// Called by the vendor app right after it inserts a chat_messages row, so the customer
// gets a push if their app is backgrounded/killed (chat itself runs over Supabase Realtime,
// which the Node backend has no visibility into).
app.post('/api/push/notify-chat-message', async (req, res) => {
  try {
    const { customerId, astrologerId, message } = req.body;
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
app.post('/api/push/notify-chat-request', async (req, res) => {
  try {
    const { vendorId, callerId, callerName } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });

    const { data: vendorRow } = await supabaseService
      .from('astrologers').select('fcm_token').eq('id', vendorId).limit(1).single();

    if (vendorRow?.fcm_token) {
      await sendPush(vendorRow.fcm_token, {
        data: {
          type: 'chat_request',
          callerName: callerName || 'Customer',
          callerId: callerId || '',
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
app.post('/api/push/notify-chat-cancelled', async (req, res) => {
  try {
    const { vendorId, callerId } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });

    const { data: vendorRow } = await supabaseService
      .from('astrologers').select('fcm_token').eq('id', vendorId).limit(1).single();

    if (vendorRow?.fcm_token) {
      await sendPush(vendorRow.fcm_token, {
        data: { type: 'cancel_incoming_request', callerId: callerId || '' },
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
      .limit(20);
    if (error) throw error;
    const rows = data || [];
    const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    const astroIds = [...new Set(rows.map((r) => r.astrologer_id).filter(Boolean))];
    let custNames = {}, astroNames = {};
    if (custIds.length) {
      const { data: c } = await supabaseService.from('customers').select('id, name').in('id', custIds);
      (c || []).forEach((x) => { custNames[x.id] = (x.name || '').trim().split(' ')[0] || 'Customer'; });
    }
    if (astroIds.length) {
      const { data: a } = await supabaseService.from('astrologers').select('id, first_name, last_name').in('id', astroIds);
      (a || []).forEach((x) => { astroNames[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim() || 'Astrologer'; });
    }
    return res.status(200).json(rows.map((r) => ({
      user: { firstName: custNames[r.customer_id] || 'Customer' },
      astrologerName: astroNames[r.astrologer_id] || 'Astrologer',
      rating: r.rating,
      comment: r.comment || '',
      createdAt: r.created_at,
    })));
  } catch (e) {
    console.error('[reviews] all error:', e.message);
    return res.status(200).json([]);
  }
});

// WebRTC Call Initiate — no third-party room server needed; signaling goes through socket.io
app.post('/api/call/initiate', writeLimiter, async (req, res) => {
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
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, message: 'Astrologer is busy right now' });
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

    const sessionId = crypto.randomUUID();
    const roomId = crypto.randomUUID();

    // The row itself, not just the socket/push notifications — moved server-side so the
    // anon key no longer needs a direct INSERT grant on call_requests. See
    // DATABASE_HARDENING_HANDOFF.md STEP 3. room_token stays null: it was already
    // vestigial (this endpoint never returned a real vendorToken for clients to store).
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
      }])
      .select('id')
      .single();
    if (requestErr) throw requestErr;
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
    supabase.from('astrologers').select('fcm_token').eq('id', receiverId).single()
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
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, message: 'Astrologer is busy right now' });
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
      return res.status(409).json({ success: false, busy: true, busySince: busyStatus.busySince, message: 'Astrologer is busy right now' });
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
    if (error) throw error;

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

    const { count } = await supabaseService
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('caller_id', realCallerId);
    const isFreeSession = (count || 0) === 0;

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
      is_free_session: isFreeSession,
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
      isFreeSession,
      navigationParams: {
        requestId: resolvedRequestId,
        sessionId,
        callerName: reqBody.callerName,
        callerId: realCallerId,
        perMinuteCharge,
        token: reqBody.token,
        callType: reqBody.callType,
        isFreeSession,
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
app.post('/api/call/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
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
      data: { code, totalReferred, totalEarned, rewardAmount: 50 },
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

app.post('/api/wallet/create-order', writeLimiter, async (req, res) => {
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

app.post('/api/wallet/verify-payment', writeLimiter, async (req, res) => {
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

    return res.status(200).json({
      success: true,
      data: {
        balance: astroRow?.wallet_balance ?? 0,
        transactions: (txns || []).map(t => ({
          id: t.id,
          description: t.description || 'Consultation Earning',
          amount: t.type === 'credit' ? t.amount : -t.amount,
          date: new Date(t.created_at).toLocaleDateString('en-IN'),
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
app.post('/vendor/wallet/withdraw', writeLimiter, async (req, res) => {
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

    return res.status(200).json({
      success: true,
      data: { ...astro, transactions: txns || [] },
    });
  } catch (err) {
    console.error('GET /api/vendor/wallet error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor wallet' });
  }
});

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

    const registrationData = { ...(req.body || {}), phone_number: decoded.phone };
    const { data: created, error } = await supabaseService
      .from('astrologers').insert([registrationData]).select('id').single();
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
    const { data, error } = await supabase
      .from('gifts').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) throw error;
    return res.status(200).json({
      data: (data || []).map((g) => ({ _id: g.id, name: g.name, price: g.price, image: g.image })),
    });
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
    (astros || []).forEach((a, i) => { byId[a.id] = formatAstrologer(a, i, categoryMap); });

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
app.post('/api/gift/send', writeLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    const { astrologerId, giftId, context, sessionId } = req.body || {};
    if (!astrologerId || !giftId) {
      return res.status(400).json({ success: false, message: 'astrologerId and giftId required' });
    }

    // Resolve real customer row
    let customer = null;
    if (decoded.phone) {
      const { data } = await supabase.from('customers').select('id, wallet_balance').eq('mobile', decoded.phone).limit(1);
      if (data && data.length) customer = data[0];
    }
    if (!customer && String(userId).includes('-')) {
      const { data } = await supabase.from('customers').select('id, wallet_balance').eq('id', userId).single();
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
    let giftBalances;
    try {
      giftBalances = await wallet.transferCustomerToVendor(customer.id, astrologerId, amount, {
        vendorAmount: vendorCredit,
        description: `Gift: ${gift.name}`,
        sessionId: sessionId || null,
        idempotencyKey: `gift:${customer.id}:${giftId}:${Date.now()}`,
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
      io.to('live_' + sessionId).emit('live_gift', {
        sessionId, giftName: gift.name, amount, name: decoded.name || 'Someone',
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

  // DISABLE_SESSION_MANAGER gates only the loops that WRITE.
  if (process.env.DISABLE_SESSION_MANAGER === '1') {
    console.warn('[startup] DISABLE_SESSION_MANAGER=1 — billing, earnings resets and the ' +
      'stale-request sweep are OFF. This must never be set in production.');
    return;
  }
  sessionManager.start(io); // Start the SessionManager with io instance
});

