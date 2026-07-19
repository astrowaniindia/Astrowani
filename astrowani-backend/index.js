require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sendPush } = require('./src/push');

const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Service-role client for server-trusted writes that must bypass RLS (e.g. orders).
// Falls back to the anon client if the service key isn't configured.
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : supabase;

// ─────────────────────────────────────────────────────────────────────────────
// Astrologer formatting — single source of truth for what the customer app sees.
// Reconciles the column names the vendor app actually writes:
//   - profile picture: EditProfile writes `profile_image` (base64); legacy `profile_pic_url`
//   - languages: Registration writes `languages`, EditProfile writes `language`
//   - category/specialties: Registration writes `specialties` as an ARRAY OF category UUIDs
//     (from the `categories` table) — we resolve those to names + expose categoryIds.
// ─────────────────────────────────────────────────────────────────────────────
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

function formatAstrologer(astro, index, categoryMap = {}) {
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
      : `https://astrowani.onrender.com/public/images/astro${(index % 4) + 1}.png`,
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

app.use(cors());
app.use(express.json({ limit: '10mb' })); // blog/banner images may be base64 data-URIs
app.use('/public', express.static(path.join(__dirname, 'public')));

// Admin dashboard — built from astrowani-admin/ into admin-dist/
app.use('/admin', express.static(path.join(__dirname, 'admin-dist')));
app.get('/admin/*', (_req, res) => res.sendFile(path.join(__dirname, 'admin-dist', 'index.html')));

const PORT = process.env.PORT || 4500;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_astrowani_key_123';

// Admin dashboard routes (auth + content/management CRUD under /api/admin)
require('./src/adminRoutes')(app);

// Notification management (admin broadcast/personal send + history)
require('./src/notificationRoutes')(app);

// Paid astrology reports (JyotishamAstroAPI) — /api/astro/* + public /api/astro-services
require('./src/astroRoutes')(app);

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
app.post('/api/users/mobile-otp-request', async (req, res) => {
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
app.post('/api/users/mobile-otp-verify', async (req, res) => {
  const { phoneNumber, otp, fcmToken, role } = req.body;

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
        // Create a new customer row
        const { data: newCustomer, error: insertError } = await supabaseService
          .from('customers')
          .insert([{ mobile: phoneNumber, wallet_balance: 0, fcm_token: fcmToken || null }])
          .select('id')
          .single();
        if (insertError) throw insertError;
        supabaseCustomerId = newCustomer?.id;
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
// no param returns all active (back-compat). `intervalSeconds` is the admin-set
// rotation interval (default 4s).
app.get('/api/banners/all', async (req, res) => {
  try {
    const app_ = req.query.app;
    let bannerQuery = supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
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

// Mock Astrologers
app.get('/api/astrologers', async (req, res) => {
  try {
    // Optional service filter — section screens pass ?service=chat|audio|video
    // to get only astrologers who have that toggle enabled.
    let query = supabase.from('astrologers').select('*');
    const { service } = req.query;
    if (service === 'chat')  query = query.eq('is_chat_enabled', true);
    if (service === 'audio') query = query.eq('is_call_enabled', true);
    if (service === 'video') query = query.eq('is_video_call_enabled', true);

    const { data, error } = await query;
    if (error) throw error;

    // Only approved, non-suspended, profile-complete astrologers reach customers.
    const visibleRows = (data || []).filter(astrologerVisibleToCustomers);

    const categoryMap = await buildCategoryMap();
    let formattedData = visibleRows.map((astro, index) => formatAstrologer(astro, index, categoryMap));

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

    const categoryMap = await buildCategoryMap();
    const formattedData = visibleRows.map((astro, index) => formatAstrologer(astro, index, categoryMap));

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_astrowani_key_123');
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
app.post('/api/call/initiate', async (req, res) => {
  try {
    const { receiverId, callType } = req.body;

    // Resolve caller identity from JWT
    const authHeader = req.headers.authorization;
    const token_jwt = authHeader && authHeader.split(' ')[1];
    let callerInfo = { name: 'User', id: null };
    if (token_jwt) {
      try {
        const decoded = jwt.verify(token_jwt, process.env.JWT_SECRET || 'super_secret_astrowani_key_123');
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
        receiver: { name: 'Astrologer', image: '' },
      }
    });
  } catch (error) {
    console.error('[Call] initiate error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to initiate call' });
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

// ─────────────────────────────────────────────────────────────────────────────
// WALLET: Deduct from customer AND credit to vendor (called every minute during chat/call)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/wallet/deduct-and-credit', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded._id || decoded.id;

    const { sessionId, requestId, amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

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

    if (!userRow && String(userId).includes('-')) {
      const { data, error } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userId)
        .single();
      if (!error) userRow = data;
    }

    if (!userRow) {
      return res.status(400).json({ success: false, message: 'Customer not found' });
    }

    const currentBalance = userRow.wallet_balance ?? 0;
    if (currentBalance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // 2. Deduct from customer
    const { error: deductErr } = await supabase
      .from('customers')
      .update({ wallet_balance: currentBalance - amount })
      .eq('id', actualUserId);
    if (deductErr) throw deductErr;

    // 3. Log customer deduction transaction
    await supabase.from('wallet_transactions').insert([{
      user_id: userId,
      type: 'debit',
      amount: amount,
      description: 'Chat/Call charge (per minute)',
      session_id: sessionId,
      request_id: requestId,
    }]);

    // 4. Find vendor from chat_sessions
    const { data: sessionRow, error: sessErr } = await supabase
      .from('chat_sessions')
      .select('vendor_id')
      .eq('id', sessionId)
      .single();

    if (!sessErr && sessionRow?.vendor_id) {
      const vendorId = sessionRow.vendor_id;

      // 5. Get vendor current wallet balance (from astrologers table)
      const { data: astroRow } = await supabase
        .from('astrologers')
        .select('wallet_balance, today_earnings, total_earnings')
        .eq('id', vendorId)
        .single();

      const vendorBalance = astroRow?.wallet_balance ?? 0;
      const todayEarnings = astroRow?.today_earnings ?? 0;
      const totalEarnings = astroRow?.total_earnings ?? 0;

      // 6. Credit vendor wallet
      await supabase
        .from('astrologers')
        .update({
          wallet_balance: vendorBalance + amount,
          today_earnings: todayEarnings + amount,
          total_earnings: totalEarnings + amount,
        })
        .eq('id', vendorId);

      // 7. Log vendor credit transaction
      await supabase.from('vendor_wallet_transactions').insert([{
        vendor_id: vendorId,
        type: 'credit',
        amount: amount,
        description: 'Earnings from chat/call (per minute)',
        session_id: sessionId,
        request_id: requestId,
      }]);
    }

    return res.status(200).json({
      success: true,
      newBalance: currentBalance - amount,
    });
  } catch (err) {
    console.error('POST /api/wallet/deduct-and-credit error:', err.message);
    return res.status(500).json({ success: false, message: 'Transaction failed' });
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

    const { data: astroRow, error: astroErr } = await supabase
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

    const newBalance = currentBalance - amount;
    const { error: updateErr } = await supabase
      .from('astrologers')
      .update({ wallet_balance: newBalance })
      .eq('id', vendorId);
    if (updateErr) throw updateErr;

    // Snapshot the payout details as they stand right now — a later profile edit
    // shouldn't retroactively change what an already-processed request says was used.
    const { data: withdrawal, error: insertErr } = await supabase
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

    await supabase.from('vendor_wallet_transactions').insert([{
      vendor_id: vendorId,
      type: 'debit',
      amount,
      description: 'Withdrawal requested',
      request_id: withdrawal.id,
    }]);

    return res.status(200).json({ success: true, newBalance, withdrawal });
  } catch (err) {
    console.error('POST /vendor/wallet/withdraw error:', err.message);
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

    const { data, error } = await supabase
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
app.post('/api/live/start', async (req, res) => {
  try {
    const { astrologerId, title } = req.body || {};
    if (!astrologerId) return res.status(400).json({ success: false, message: 'astrologerId required' });
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

app.post('/api/live/:id/end', async (req, res) => {
  try {
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

    // 1. Debit customer
    await supabaseService.from('customers').update({ wallet_balance: balance - amount }).eq('id', customer.id);
    await supabaseService.from('wallet_transactions').insert([{
      user_id: customer.id, type: 'debit', amount, description: `Gift: ${gift.name}`, session_id: sessionId || null,
    }]);

    // 2. Credit astrologer (50%)
    const { data: astro } = await supabase.from('astrologers')
      .select('wallet_balance, today_earnings, total_earnings').eq('id', astrologerId).single();
    await supabaseService.from('astrologers').update({
      wallet_balance: (astro?.wallet_balance ?? 0) + vendorCredit,
      today_earnings: (astro?.today_earnings ?? 0) + vendorCredit,
      total_earnings: (astro?.total_earnings ?? 0) + vendorCredit,
    }).eq('id', astrologerId);
    await supabaseService.from('vendor_wallet_transactions').insert([{
      vendor_id: astrologerId, type: 'credit', amount: vendorCredit,
      description: `Gift received: ${gift.name}`, session_id: sessionId || null,
    }]);

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

    return res.status(200).json({ success: true, newBalance: balance - amount });
  } catch (err) {
    console.error('POST /api/gift/send error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to send gift' });
  }
});

// Expose for admin force-stop (used in adminRoutes via app.locals)
app.locals.endLiveSession = endLiveSession;

server.listen(PORT, () => {
  console.log(`🚀 Astrowani backend server is running on http://localhost:${PORT}`);
  sessionManager.start(io); // Start the SessionManager with io instance
});

