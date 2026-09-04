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
