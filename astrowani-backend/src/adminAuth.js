// The ONE admin check for every admin route (security audit 2026-11-13).
//
// WHAT WAS WRONG. Five modules each had their own requireAdmin, and every one accepted
// ANY token signed with JWT_SECRET whose `role` claim said 'admin'. Customer and
// astrologer tokens are signed with the same secret, and POST /api/users/mobile-otp-verify
// copied `role` straight from the request body into the token. So anyone able to log in
// to the app — including with the store-reviewer number published in this public repo —
// could send role:'admin' and get a token that opened the whole admin API. Confirmed
// against production before the fix (GET /api/admin/stats -> 200).
//
// THE FIX, two layers:
//   1. mobile-otp-verify now issues only 'customer' or 'astrologer' (index.js).
//   2. Here: a token only counts as an admin token if its `id` is a row in `admins`.
//      That also rejects every forged admin token already minted (their id is a
//      customer/astrologer uuid) without forcing real admins to log in again.
//
// Fails CLOSED: if the admins table cannot be read, the request is refused. Locking the
// dashboard for a minute is far better than letting a forged token through.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET;
let client = null;
const db = () => client || (client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

// Positive results cached briefly so an admin page that fires 20 requests costs one
// lookup. Negatives are not cached: a removed admin must lose access promptly, and a
// forged token gains nothing from a cache miss.
const CACHE_MS = 60 * 1000;
const known = new Map(); // id -> expiresAt

async function isAdminId(id) {
  if (!id || !/^[0-9a-f-]{32,36}$/i.test(String(id))) return false;
  const hit = known.get(String(id));
  if (hit && hit > Date.now()) return true;
  const { data, error } = await db().from('admins').select('id').eq('id', String(id)).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  known.set(String(id), Date.now() + CACHE_MS);
  return true;
}

/** Decoded admin token, or a { status, message } refusal. Never throws. */
async function checkAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return { status: 401, message: 'Unauthorized' };
  let decoded;
  try {
    decoded = jwt.verify(String(authHeader).replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return { status: 401, message: 'Invalid token' };
  }
  if (!decoded || decoded.role !== 'admin') return { status: 403, message: 'Admin access required' };
  try {
    if (!(await isAdminId(decoded.id))) return { status: 403, message: 'Admin access required' };
  } catch (_) {
    return { status: 503, message: 'Could not verify admin access. Please try again.' };
  }
  return { decoded };
}

/** Express middleware. Same responses as the five copies it replaces. */
function requireAdmin(req, res, next) {
  checkAdmin(req).then((r) => {
    if (!r.decoded) return res.status(r.status).json({ success: false, message: r.message });
    req.admin = r.decoded;
    return next();
  }).catch(() => res.status(503).json({ success: false, message: 'Could not verify admin access.' }));
}

module.exports = { requireAdmin, checkAdmin, isAdminId };
