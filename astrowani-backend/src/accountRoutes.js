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
const { findCustomerByPhone } = require('./customerLookup');

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
  if (!customer && userId && String(userId).includes('-')) {
    const { data } = await db
      .from('customers').select('id, name, mobile, wallet_balance').eq('id', userId).single();
    if (data) customer = data;
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

module.exports = (app) => {
  /**
   * What deleting this account will actually cost the customer, so the confirmation
   * dialog can state it instead of guessing. Read-only; changes nothing.
   *
   * The wallet balance is the important field: it is forfeited on deletion and there
   * is no refund path, so the app must say so in words before the customer confirms.
   */
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

      const deletedTag = `deleted:${id}:${Date.now()}`;
      const { error: softErr } = await db.from('customers').update({
        mobile: deletedTag,
        name: customer.name ? `${customer.name} (deleted)` : 'Deleted user',
        fcm_token: null, // stop every future push to a device whose owner has left
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
