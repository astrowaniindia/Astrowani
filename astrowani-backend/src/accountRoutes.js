// astrowani-backend/src/accountRoutes.js
//
// Self-service account deletion for customers.
//
// WHY THIS EXISTS: the app's Settings screen has had a "Delete my account" button
// since launch that showed "Account deleted successfully" and called nothing — no
// deletion endpoint existed anywhere in this backend. Google Play requires an app
// that creates accounts to offer working in-app deletion, and telling somebody their
// data is gone when it is not is the part that actually matters.
//
// THE ONE RULE: a customer can only ever delete THEMSELVES. The id comes from the
// verified JWT, never from a request body or a path param. There is deliberately no
// `:id` in any route here — a self-service delete that accepts an id is one typo away
// from letting any logged-in customer delete any other.
//
// Deletion semantics mirror DELETE /api/admin/customers/:id exactly, because that
// logic was already reasoned through against the schema's FK constraints:
//   - hard delete when nothing financial references the row;
//   - full soft-removal when `chat_sessions.caller_id` / `wallet_transactions.user_id`
//     (both ON DELETE RESTRICT) refuse to let the money trail be destroyed.
// The soft path is not a consolation prize: it clears the phone number, which both
// frees the number for re-signup and hides the account from every lookup the apps do.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const offerGuard = require('./offerGuard');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');
const { recordDeletedCustomer } = require('./analyticsExclusions');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * JWT -> the real customers row. Same tolerant phone-first lookup as
 * orderRoutes/astroRoutes: the id inside an older token may be a legacy
 * `user_<timestamp>` string rather than a uuid.
 */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  const userId = decoded.userId || decoded._id || decoded.id;
  let customer = null;
  if (decoded.phone) {
    const row = await findCustomerByPhone(db, decoded.phone, 'id, name, mobile, wallet_balance');
    if (row) customer = row;
  }
  // Guarded: a soft-removed account must not resolve from a retained token.
  if (!customer && userId) {
    customer = await findCustomerById(db, userId, 'id, name, mobile, wallet_balance');
  }
  return customer;
}

/**
 * Is this customer in a live consultation right now?
 *
 * Deleting mid-call would strand an astrologer in a session whose billing counterparty
 * just vanished, so this is the one case we refuse — and it is refused because it
 * resolves on its own in minutes, not because we are trying to talk anyone out of
 * leaving. Nothing else blocks deletion: an in-flight remedy order is protected by the
 * soft-delete path (the order and its address snapshot survive), so it needs no guard.
 *
 * Fails CLOSED (reports "busy") on a DB error: refusing a deletion for a minute is
 * recoverable, tearing down an account mid-session is not.
 */
async function hasActiveSession(customerId) {
  try {
    const { data, error } = await db
      .from('chat_sessions')
      .select('id')
      .eq('caller_id', customerId)
      .eq('is_active', true)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  } catch (err) {
    console.error('[account] active-session check failed:', err.message);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Personal-data purge, shared by both delete routes.
//
// Added 2026-09-16. Before this, the soft path (any account with session or wallet
// history — i.e. nearly every real customer) only blanked columns on the customers /
// astrologers row. The account's saved addresses, favourites, reviews, voice notes,
// free-call bookings, support and WhatsApp conversations all stayed, the name stayed
// as "X (deleted)", and every uploaded photo stayed reachable in the PUBLIC
// app-images bucket, because nulling a URL does not delete the file it points to.
// That made astrowani.com/delete-account/ untrue.
//
// What is deliberately NOT purged, because Indian tax/accounting law requires it:
// chat_sessions, wallet_transactions, vendor_wallet_transactions, coin_transactions,
// gift_transactions, wallet_recharges, orders (+ order_items, which carry the
// invoice name/phone/delivery address), withdrawal_requests, referrals (ids + reward
// amount only). Also kept: customer_reports / astrologer_reports — safety records,
// which after the purge point only at an anonymised row.
//
// Every step is idempotent and THROWS on failure. It runs BEFORE the account row is
// deleted or anonymised, so a failure returns 500 while the account can still be
// resolved from the same token, and a retry finishes the job.
// ─────────────────────────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'app-images';
// Only files under these folders are ever removed, so a URL that somehow points at
// shared content (a banner, a product image) can never be deleted by a user.
const PERSONAL_FOLDERS = ['customer-profiles/', 'customer-hands/', 'astrologer-profiles/', 'voice-notes/'];

function personalStoragePath(url) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  if (path.includes('..')) return null;
  return PERSONAL_FOLDERS.some((f) => path.startsWith(f)) ? path : null;
}

async function removeStorageFiles(urls) {
  const paths = [...new Set(urls.map(personalStoragePath).filter(Boolean))];
  if (!paths.length) return;
  const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) throw new Error(`storage remove: ${error.message}`);
}

// An unapplied migration reports PGRST205 (not 42P01) — a table that does not exist
// holds nothing to delete, so that is not a failure.
async function step(label, query) {
  const { error } = await query;
  if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
    throw new Error(`${label}: ${error.message}`);
  }
}

// Mirrors index.js recomputeAstrologerRating (not exported from there).
async function recomputeRating(astrologerId) {
  let avg = 0;
  let total = 0;
  const { data: rpcRows, error: rpcError } = await db
    .rpc('astrologer_review_stats', { p_astrologer_id: astrologerId });
  if (!rpcError && rpcRows && rpcRows.length) {
    avg = Math.round((Number(rpcRows[0].avg_rating) || 0) * 10) / 10;
    total = Number(rpcRows[0].review_count) || 0;
  } else {
    const { data: rows } = await db
      .from('reviews').select('rating').eq('astrologer_id', astrologerId).eq('is_hidden', false);
    const list = rows || [];
    total = list.length;
    avg = total
      ? Math.round((list.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total) * 10) / 10
      : 0;
  }
  await step('recompute rating',
    db.from('astrologers').update({ average_rating: avg, total_reviews: total }).eq('id', astrologerId));
}

async function purgeCustomerPersonalData(id) {
  const { data: row } = await db
    .from('customers').select('profile_image, hand_image').eq('id', id).maybeSingle();
  const { data: notes } = await db.from('voice_notes').select('audio_url').eq('customer_id', id);
  const { data: reviewed } = await db.from('reviews').select('astrologer_id').eq('customer_id', id);

  await removeStorageFiles([
    row?.profile_image, row?.hand_image, ...(notes || []).map((n) => n.audio_url),
  ]);

  await step('reviews', db.from('reviews').delete().eq('customer_id', id));
  for (const astrologerId of new Set((reviewed || []).map((r) => r.astrologer_id))) {
    await recomputeRating(astrologerId);
  }
  // orders.address_id is ON DELETE SET NULL, and each order keeps its own
  // delivery_address snapshot, so past invoices are unaffected.
  await step('addresses', db.from('customer_addresses').delete().eq('customer_id', id));
  await step('favorites', db.from('favorites').delete().eq('customer_id', id));
  await step('voice notes', db.from('voice_notes').delete().eq('customer_id', id));
  await step('waitlist', db.from('astrologer_waitlist').delete().eq('customer_id', id));
  await step('remedy referrals', db.from('remedy_referrals').delete().eq('customer_id', id));
  await step('notifications', db.from('notifications').delete().eq('customer_id', id));
  await step('free-call bookings', db.from('free_call_bookings').delete().eq('customer_id', id));
  await step('blocks', db.from('customer_blocks').delete().eq('customer_id', id));
  // support_messages / whatsapp_messages cascade from their conversations.
  await step('support conversations', db.from('support_conversations').delete().eq('customer_id', id));
  await step('support tickets', db.from('support_tickets').delete().eq('customer_id', id));
  await step('whatsapp conversations', db.from('whatsapp_conversations').delete().eq('customer_id', id));
  // chat_sessions.request_id references chat_requests (NO ACTION), so the rows stay
  // for session history; the name snapshot does not need to.
  await step('chat request names', db.from('chat_requests').update({ caller_name: null }).eq('caller_id', id));
  await step('call history names',
    db.from('call_history').update({ client_name: null, client_avatar: null }).eq('client_id', id));
}

async function purgeAstrologerPersonalData(id) {
  const { data: row } = await db.from('astrologers').select('profile_pic_url').eq('id', id).maybeSingle();
  const { data: notes } = await db.from('voice_notes').select('audio_url').eq('astrologer_id', id);

  await removeStorageFiles([row?.profile_pic_url, ...(notes || []).map((n) => n.audio_url)]);

  await step('reviews', db.from('reviews').delete().eq('astrologer_id', id));
  await step('favorites', db.from('favorites').delete().eq('astrologer_id', id));
  await step('voice notes', db.from('voice_notes').delete().eq('astrologer_id', id));
  await step('waitlist', db.from('astrologer_waitlist').delete().eq('astrologer_id', id));
  // Commission already owed is snapshotted onto order_items, so this only stops
  // FUTURE orders being attributed to a deleted account.
  await step('remedy referrals', db.from('remedy_referrals').delete().eq('astrologer_id', id));
  await step('notifications', db.from('notifications').delete().eq('astrologer_id', id));
  await step('devices', db.from('vendor_devices').delete().eq('astrologer_id', id));
  await step('blocks', db.from('customer_blocks').delete().eq('astrologer_id', id));
  // Upcoming free calls go back to the admin's unassigned queue so the customer is
  // still called by someone.
  await step('free-call bookings',
    db.from('free_call_bookings').update({ astrologer_id: null }).eq('astrologer_id', id).eq('status', 'booked'));
  // Support conversations the astrologer opened themselves (not customer threads
  // that merely involve them).
  await step('support conversations',
    db.from('support_conversations').delete().eq('astrologer_id', id).is('customer_id', null));
  await step('whatsapp handler', db.from('whatsapp_conversations').update({ astrologer_id: null }).eq('astrologer_id', id));
  await step('call history names',
    db.from('call_history').update({ astrologer_name: null, astrologer_avatar: null }).eq('astrologer_id', id));
}

module.exports = (app) => {
  /**
   * What deleting this account will actually cost the customer, so the confirmation
   * dialog can state it instead of guessing. Read-only; changes nothing.
   *
   * The wallet balance is the important field: it is forfeited on deletion and there
   * is no refund path, so the app must say so in words before the customer confirms.
   */
  /* ── Does the account behind this token still exist? ─────────────────────
   * The app keeps a customer signed in on nothing but the token saved on the
   * phone, so an account deleted from the admin (or another device) left that
   * phone on a broken Home for the rest of the token's 30 days. The app asks this
   * at startup and signs out on 410.
   *
   * 410 ACCOUNT_GONE ONLY when the database answered cleanly and no live row
   * exists. Any query error is a 503: during the 2026-08-26 credential outage every
   * lookup came back empty, and "empty because broken" must never sign anyone out.
   * Astrologer tokens are not this endpoint's business and always pass. */
  app.get('/api/account/status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, code: 'NO_TOKEN' });
    let decoded;
    try {
      decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ success: false, code: 'TOKEN_INVALID' });
    }
    if (decoded.role === 'astrologer' || decoded.astroId) return res.status(200).json({ success: true });

    const live = (r) => r && !String(r.mobile || '').startsWith('deleted:');
    const userId = decoded.userId || decoded._id || decoded.id;
    const phone = decoded.phone ? String(decoded.phone).replace(/\D/g, '').slice(-10) : '';
    try {
      if (userId && String(userId).includes('-')) {
        const { data, error } = await db.from('customers').select('id, mobile').eq('id', userId).limit(1);
        if (error) throw error;
        if ((data || []).some(live)) return res.status(200).json({ success: true });
      }
      if (phone.length === 10) {
        const { data, error } = await db.from('customers').select('id, mobile').ilike('mobile', `%${phone}`).limit(5);
        if (error) throw error;
        if ((data || []).some(live)) return res.status(200).json({ success: true });
      }
      if (!userId && phone.length !== 10) {
        // Nothing to look up by: cannot prove the account is gone.
        return res.status(200).json({ success: true });
      }
      return res.status(410).json({ success: false, code: 'ACCOUNT_GONE' });
    } catch (_) {
      return res.status(503).json({ success: false, code: 'UNAVAILABLE' });
    }
  });

  app.get('/api/account/delete-preview', async (req, res) => {
    try {
      const customer = await resolveCustomer(req);
      if (!customer?.id) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const walletBalance = Number(customer.wallet_balance) || 0;
      const activeSession = await hasActiveSession(customer.id);
      return res.json({
        success: true,
        walletBalance,
        // Named as an instruction to the UI rather than a raw state, so the app does
        // not have to re-derive the policy from the parts.
        canDelete: !activeSession,
        blockedReason: activeSession ? 'ACTIVE_SESSION' : null,
      });
    } catch (e) {
      console.error('[account] delete-preview error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not load account details' });
    }
  });

  /**
   * Delete the authenticated customer's own account.
   *
   * Returns `mode: 'deleted'` (row destroyed) or `mode: 'hidden'` (financial history
   * kept, account made unreachable and the phone number freed). Both are a successful
   * deletion from the customer's point of view and the app treats them identically —
   * the distinction is recorded for support, not for the customer to act on.
   */
  app.post('/api/account/delete', async (req, res) => {
    try {
      const customer = await resolveCustomer(req);
      if (!customer?.id) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const id = customer.id;

      if (await hasActiveSession(id)) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SESSION',
          message: 'You are in a consultation right now. Please end it, then try again.',
        });
      }

      // No FK on these, so the DB will not clear them for us. Everything else that
      // references a customer (favorites, reviews, referrals, wallet_recharges,
      // voice_notes, astrologer_waitlist, astrologer_reports, support_tickets) is
      // ON DELETE CASCADE/SET NULL and goes automatically with the row below.
      // BEFORE anything is erased: remember which new-customer offers this number already
      // used, so deleting and re-registering cannot claim them again. Never throws.
      await offerGuard.snapshotCustomer(id);
      await purgeCustomerPersonalData(id);
      // Keeps their past events out of the admin's Analytics once the row is gone.
      await recordDeletedCustomer(id);

      await db.from('call_requests').delete().eq('customer_id', id);
      await db.from('chat_messages').delete().eq('sender_id', id);
      await db.from('chat_messages').delete().eq('receiver_id', id);

      const { error: delErr } = await db.from('customers').delete().eq('id', id);
      if (!delErr) {
        console.log(`[account] hard-deleted customer ${id} on their own request`);
        return res.json({ success: true, mode: 'deleted' });
      }

      // 23503 = foreign_key_violation, i.e. ON DELETE RESTRICT protecting session or
      // wallet history. Anything else is a real failure and must not be reported as a
      // successful deletion.
      if (delErr.code !== '23503') throw delErr;

      // Clear every personal field, not just the ones that make the account
      // unreachable. Only the financial trail (chat_sessions / wallet_transactions,
      // which is what the RESTRICT above is protecting) has to survive a deletion
      // request; birth details, contact details and photographs are not accounting
      // records and there is no lawful basis to keep them once the customer has asked
      // us to delete. Leaving them behind also made astrowani.com/delete-account/'s
      // description of this flow untrue, which is the same class of problem as the
      // fake "Account deleted successfully" toast this endpoint replaced.
      // Every column below is nullable (verified against production before writing).
      const deletedTag = `deleted:${id}:${Date.now()}`;
      const { error: softErr } = await db.from('customers').update({
        mobile: deletedTag,
        name: 'Deleted user',
        referral_code: null,
        fcm_token: null, // stop every future push to a device whose owner has left
        email: null,
        // Birth details: date + time + place is strongly identifying on its own, and
        // is the most sensitive thing this app holds about a customer.
        dob: null,
        time_of_birth: null,
        place_of_birth: null,
        gender: null,
        marital_status: null,
        state: null,
        // Photographs. hand_image is a palm photo submitted for palmistry readings.
        profile_image: null,
        hand_image: null,
      }).eq('id', id);
      if (softErr) throw softErr;

      console.log(`[account] soft-removed customer ${id} on their own request (financial history retained)`);
      return res.json({ success: true, mode: 'hidden' });
    } catch (e) {
      console.error('[account] delete error:', e.message);
      return res.status(500).json({
        success: false,
        message: 'Could not delete your account. Please try again, or contact support.',
      });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Astrologer (vendor app) self-service deletion.
//
// Added 2026-09-05. The vendor app had no deletion path of any kind — not even a
// fake one like the customer app's, simply nothing — while still creating accounts
// at signup. Same Play requirement, same rule: the id comes from the verified JWT
// and there is deliberately no `:id` in either route.
//
// TWO THINGS DIFFER FROM THE CUSTOMER SIDE, both because an astrologer's balance is
// money they EARNED rather than money they deposited:
//
//   1. A pending/approved withdrawal BLOCKS deletion. That money has already left
//      wallet_balance and an admin is part-way through paying it out; destroying the
//      account underneath that leaves a payout with no payee. It resolves on its own
//      once the admin marks it paid or rejected, so this is a wait, not a refusal.
//   2. The preview reports the balance as forfeited EARNINGS, so the app can tell
//      them to withdraw first. The customer flow only has to warn; this one advises.
//
// The soft-removal path mirrors DELETE /api/admin/astrologers/:id rather than the
// customer one, because hiding an astrologer means more than clearing a phone number
// — they are listed, bookable and callable, so every one of those switches has to go
// off or a "deleted" astrologer carries on taking requests.
// ─────────────────────────────────────────────────────────────────────────────

const { findAstrologerByPhone } = require('./customerLookup');

const ASTRO_SELECT =
  'id, first_name, last_name, phone_number, wallet_balance, is_available, approval_status';

/** JWT -> the real astrologers row. Phone-first, same tolerance as resolveCustomer. */
async function resolveAstrologer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  let astro = null;
  if (decoded.phone) {
    astro = await findAstrologerByPhone(db, decoded.phone, ASTRO_SELECT);
  }
  if (!astro) {
    const id = decoded.astroId || decoded.vendorId || decoded.userId || decoded.id;
    if (id && String(id).includes('-')) {
      const { data } = await db.from('astrologers').select(ASTRO_SELECT).eq('id', id).single();
      if (data) astro = data;
    }
  }

  // An already soft-removed account must not resolve at all.
  //
  // Found by the deletion harness: the phone-first lookup correctly misses a row whose
  // number has been replaced with the `deleted:` tag, but the id fallback above found
  // it anyway — so a token retained from before the deletion still resolved the
  // account, and its holder could have carried on calling these endpoints for the
  // remaining life of a 30-day JWT. "Deleted" has to mean the token stops working.
  if (astro && String(astro.phone_number || '').startsWith('deleted:')) return null;

  return astro;
}

/**
 * Is this astrologer in a live consultation right now? Mirrors the customer check but
 * keys on vendor_id. Fails CLOSED for the same reason: a one-minute wait is
 * recoverable, tearing the account down mid-session is not.
 */
async function astrologerHasActiveSession(astrologerId) {
  try {
    const { data, error } = await db
      .from('chat_sessions')
      .select('id')
      .eq('vendor_id', astrologerId)
      .eq('is_active', true)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  } catch (err) {
    console.error('[account] astrologer active-session check failed:', err.message);
    return true;
  }
}

/**
 * Money already on hold for a payout an admin has not finished processing.
 * 'pending' and 'approved' both mean the amount has left wallet_balance and is owed;
 * 'paid' and 'rejected' are settled and do not block.
 *
 * Returns the held total, or -1 as an "unknown, treat as blocking" sentinel. Fails
 * CLOSED for the same reason as the session check, and here being wrong the other way
 * produces a payout that can never be delivered.
 */
async function pendingWithdrawalAmount(astrologerId) {
  try {
    const { data, error } = await db
      .from('withdrawal_requests')
      .select('amount, status')
      .eq('astrologer_id', astrologerId)
      .in('status', ['pending', 'approved']);
    if (error) throw error;
    return (data || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  } catch (err) {
    console.error('[account] withdrawal-hold check failed:', err.message);
    return -1;
  }
}

module.exports.registerVendorAccountRoutes = (app) => {
  /**
   * What deleting this account will cost the astrologer. Read-only; changes nothing.
   * The wallet balance is the field that matters — it is forfeited with no refund
   * path, and unlike a customer's it is money they worked for.
   */
  app.get('/api/vendor/account/delete-preview', async (req, res) => {
    try {
      const astro = await resolveAstrologer(req);
      if (!astro?.id) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const [activeSession, held] = await Promise.all([
        astrologerHasActiveSession(astro.id),
        pendingWithdrawalAmount(astro.id),
      ]);

      let blockedReason = null;
      if (activeSession) blockedReason = 'ACTIVE_SESSION';
      else if (held !== 0) blockedReason = 'PENDING_WITHDRAWAL';

      return res.json({
        success: true,
        walletBalance: Number(astro.wallet_balance) || 0,
        // -1 is the unknown sentinel; report 0 rather than a fabricated figure. The
        // block still applies — blockedReason is what the UI acts on, not this number.
        pendingWithdrawal: held > 0 ? held : 0,
        canDelete: !blockedReason,
        blockedReason,
      });
    } catch (e) {
      console.error('[account] vendor delete-preview error:', e.message);
      return res.status(500).json({ success: false, message: 'Could not load account details' });
    }
  });

  /**
   * Delete the authenticated astrologer's own account.
   *
   * Returns `mode: 'deleted'` (row destroyed) or `mode: 'hidden'` (earnings history
   * kept, account made unreachable and de-listed everywhere). Both are a successful
   * deletion from the astrologer's point of view and the app treats them identically.
   */
  app.post('/api/vendor/account/delete', async (req, res) => {
    try {
      const astro = await resolveAstrologer(req);
      if (!astro?.id) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }
      const id = astro.id;

      if (await astrologerHasActiveSession(id)) {
        return res.status(409).json({
          success: false,
          code: 'ACTIVE_SESSION',
          message: 'You are in a consultation right now. Please end it, then try again.',
        });
      }

      const held = await pendingWithdrawalAmount(id);
      if (held !== 0) {
        return res.status(409).json({
          success: false,
          code: 'PENDING_WITHDRAWAL',
          message:
            'You have a withdrawal being processed. Please wait until it is paid or ' +
            'rejected, then try again.',
        });
      }

      // No FK on these, so the DB will not clear them with the row. Everything else
      // that references an astrologer (favorites, reviews, live_sessions,
      // astrologer_waitlist, astrologer_reports, voice_notes, withdrawal_requests,
      // remedy_referrals, free_call_bookings) is ON DELETE CASCADE/SET NULL.
      await purgeAstrologerPersonalData(id);

      await db.from('call_requests').delete().eq('astrologer_id', id);
      await db.from('chat_messages').delete().eq('receiver_id', id);
      await db.from('chat_messages').delete().eq('sender_id', id);

      const { error: delErr } = await db.from('astrologers').delete().eq('id', id);
      if (!delErr) {
        console.log(`[account] hard-deleted astrologer ${id} on their own request`);
        return res.json({ success: true, mode: 'deleted' });
      }

      // 23503 = foreign_key_violation: ON DELETE RESTRICT on chat_sessions.vendor_id /
      // vendor_wallet_transactions.vendor_id protecting the earnings trail. Anything
      // else is a real failure and must not be reported as a successful deletion.
      if (delErr.code !== '23503') throw delErr;

      const deletedTag = `deleted:${id}:${Date.now()}`;
      const { error: softErr } = await db.from('astrologers').update({
        // Frees the number for re-signup and makes the account unreachable by login.
        phone_number: deletedTag,
        first_name: 'Deleted',
        last_name: 'astrologer',
        // Same reasoning as the customer path above: hiding the row is not the same
        // as deleting the person. Only the earnings trail has to survive.
        // BANK DETAILS ARE THE IMPORTANT ONES — a full account number, IFSC and UPI
        // id sitting in the row forever after someone asked to be deleted is the
        // single worst thing either app retains. Safe to clear here specifically
        // because deletion is already refused while a withdrawal is pending or
        // approved (see pendingWithdrawalAmount above), so no payout can be in
        // flight that would still need them.
        // Every column below is nullable (verified against production before writing).
        bank_account_number: null,
        bank_ifsc: null,
        bank_account_holder: null,
        bank_name: null,
        upi_id: null,
        email: null,
        date_of_birth: null,
        gender: null,
        profile_pic_url: null,
        bio: null,
        voip_token: null, // the VoIP push identifier, same reasoning as fcm_token
        // Everything below is what actually HIDES them. An astrologer row that is
        // merely renamed is still listed, still bookable, and still rung by the backend.
        approval_status: 'rejected',
        is_suspended: true,
        is_available: false,
        is_live: false,
        is_chat_enabled: false,
        is_call_enabled: false,
        is_video_call_enabled: false,
        fcm_token: null, // stop every future push to a device whose owner has left
        admin_notes:
          'Account deleted by the astrologer from the vendor app on ' +
          `${new Date().toISOString().slice(0, 10)}. Kept in the database because it has ` +
          'session or earnings history the ledger must not lose; rejected + suspended + ' +
          'all services disabled instead, which hides it everywhere the apps read ' +
          'astrologer data.',
      }).eq('id', id);
      if (softErr) throw softErr;

      console.log(
        `[account] soft-removed astrologer ${id} on their own request (earnings history retained)`,
      );
      return res.json({ success: true, mode: 'hidden' });
    } catch (e) {
      console.error('[account] vendor delete error:', e.message);
      return res.status(500).json({
        success: false,
        message: 'Could not delete your account. Please try again, or contact support.',
      });
    }
  });
};
