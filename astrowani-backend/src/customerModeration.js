// Astrologer-side moderation: reporting and blocking a customer.
//
// The mirror of the customer's own report path (astrologer_reports). Required by
// both stores for an app whose users communicate — Apple Guideline 1.2 and Play's
// UGC policy both expect reporting AND blocking, in both directions.
//
// See sql/customer_moderation_schema.sql. Every write here goes through the
// backend with astrologer_id taken from the verified JWT; there is no
// client-direct write path, so an astrologer cannot file a block in anyone
// else's name.
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST reports a missing table as PGRST205; Postgres itself uses 42P01. Both
// are checked because an unapplied migration otherwise surfaces as a 500 — the trap
// already documented for the free-call booking work.
function isMissingTable(error) {
  if (!error) return false;
  const code = String(error.code || '');
  return code === 'PGRST205' || code === '42P01'
    || /could not find the table|does not exist/i.test(error.message || '');
}

let warnedMissing = false;
function noteMissing(where) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    `[moderation] ${where}: customer_blocks/customer_reports not found — run `
    + 'sql/customer_moderation_schema.sql. Blocking is INERT until then.',
  );
}

/**
 * Has this astrologer blocked this customer?
 *
 * ⚠ FAILS OPEN — a missing table or a read failure returns false, i.e. "not
 * blocked", so contact is allowed. That direction is deliberate but it is the
 * uncomfortable one, so it is worth stating plainly: a transient database error
 * must not silently sever every consultation on the platform, which is what
 * failing closed would do here (this runs on the initiation path for EVERY call
 * and chat). The cost is that a blocked customer may get through during an
 * outage; the alternative is the whole marketplace going dark on a blip.
 *
 * Deploy order therefore does not matter: before the migration this returns false
 * everywhere and the platform behaves exactly as it does today.
 */
async function isBlocked(astrologerId, customerId) {
  if (!astrologerId || !customerId) return false;
  const { data, error } = await db
    .from('customer_blocks')
    .select('id')
    .eq('astrologer_id', astrologerId)
    .eq('customer_id', customerId)
    .limit(1);

  if (error) {
    if (isMissingTable(error)) { noteMissing('isBlocked'); return false; }
    console.error('[moderation] isBlocked failed, allowing contact:', error.message);
    return false;
  }
  return !!(data && data.length);
}

/**
 * Block a customer. Idempotent by the table's UNIQUE(astrologer_id, customer_id):
 * a duplicate is the constraint doing its job, not an error to surface.
 */
async function blockCustomer(astrologerId, customerId, reason) {
  const { error } = await db
    .from('customer_blocks')
    .insert([{ astrologer_id: astrologerId, customer_id: customerId, reason: reason || null }]);

  if (error) {
    if (String(error.code) === '23505') return { ok: true, alreadyBlocked: true };
    if (isMissingTable(error)) { noteMissing('blockCustomer'); return { ok: false, reason: 'NOT_CONFIGURED' }; }
    console.error('[moderation] blockCustomer failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true, alreadyBlocked: false };
}

/** Unblock. Deleting a row that is not there is a success, not a 404. */
async function unblockCustomer(astrologerId, customerId) {
  const { error } = await db
    .from('customer_blocks')
    .delete()
    .eq('astrologer_id', astrologerId)
    .eq('customer_id', customerId);

  if (error) {
    if (isMissingTable(error)) { noteMissing('unblockCustomer'); return { ok: false, reason: 'NOT_CONFIGURED' }; }
    console.error('[moderation] unblockCustomer failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/** The astrologer's own blocked list, newest first, with customer names for the UI. */
async function listBlocked(astrologerId) {
  const { data, error } = await db
    .from('customer_blocks')
    .select('id, customer_id, reason, created_at, customers(name, mobile)')
    .eq('astrologer_id', astrologerId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) { noteMissing('listBlocked'); return []; }
    console.error('[moderation] listBlocked failed:', error.message);
    return [];
  }
  return (data || []).map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    name: r.customers?.name || 'Customer',
    // Masked on purpose: the astrologer needs to recognise who this is, not to
    // retain a full phone number for somebody they have chosen to cut contact with.
    mobile: r.customers?.mobile ? `••••${String(r.customers.mobile).slice(-4)}` : null,
    reason: r.reason || null,
    createdAt: r.created_at,
  }));
}

/** File a report for admin review. Reports are additive — never deduped. */
async function reportCustomer(astrologerId, customerId, reason, note) {
  const { error } = await db
    .from('customer_reports')
    .insert([{
      astrologer_id: astrologerId,
      customer_id: customerId,
      reason,
      note: note || null,
    }]);

  if (error) {
    if (isMissingTable(error)) { noteMissing('reportCustomer'); return { ok: false, reason: 'NOT_CONFIGURED' }; }
    console.error('[moderation] reportCustomer failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

// ── The other direction: a CUSTOMER blocks an ASTROLOGER ────────────────────
//
// astrologer_blocks (sql/astrologer_blocks.sql). Everything below mirrors the
// astrologer-side functions above, including the fail-open rule, so the two
// directions stay one mental model.
//
// The table name is the thing to keep straight, and it reads backwards at first
// glance: customer_blocks holds "an astrologer has blocked a customer", and
// astrologer_blocks holds "a customer has blocked an astrologer". In both cases
// the table is named after WHO IS BLOCKED, not who did the blocking.

/**
 * Has this customer blocked this astrologer?
 *
 * ⚠ FAILS OPEN, for exactly the reason isBlocked() does: this runs on the
 * initiation path for every call and chat, and a transient database error must
 * not take the whole marketplace dark.
 */
async function isBlockedByCustomer(customerId, astrologerId) {
  if (!customerId || !astrologerId) return false;
  const { data, error } = await db
    .from('astrologer_blocks')
    .select('id')
    .eq('customer_id', customerId)
    .eq('astrologer_id', astrologerId)
    .limit(1);

  if (error) {
    if (isMissingTable(error)) { noteMissing('isBlockedByCustomer'); return false; }
    console.error('[moderation] isBlockedByCustomer failed, allowing contact:', error.message);
    return false;
  }
  return !!(data && data.length);
}

/**
 * The single question the contact paths should ask: may these two be connected?
 *
 * A block has to work whoever set it — an astrologer who blocked a customer must
 * not be reachable by that customer, and an astrologer a customer blocked must not
 * be able to reach them either. Call sites used to ask only the first, so a
 * customer-side block would have been recorded and then quietly ignored.
 *
 * Both reads run concurrently because this is on the hot path, and both fail open.
 */
async function isContactBlocked(astrologerId, customerId) {
  if (!astrologerId || !customerId) return false;
  const [byAstrologer, byCustomer] = await Promise.all([
    isBlocked(astrologerId, customerId),
    isBlockedByCustomer(customerId, astrologerId),
  ]);
  return byAstrologer || byCustomer;
}

/** Block an astrologer. Idempotent via UNIQUE(customer_id, astrologer_id). */
async function blockAstrologer(customerId, astrologerId, reason) {
  const { error } = await db
    .from('astrologer_blocks')
    .insert([{ customer_id: customerId, astrologer_id: astrologerId, reason: reason || null }]);

  if (error) {
    if (String(error.code) === '23505') return { ok: true, alreadyBlocked: true };
    if (isMissingTable(error)) { noteMissing('blockAstrologer'); return { ok: false, reason: 'NOT_CONFIGURED' }; }
    console.error('[moderation] blockAstrologer failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true, alreadyBlocked: false };
}

/** Unblock. Deleting a row that is not there is a success, not a 404. */
async function unblockAstrologer(customerId, astrologerId) {
  const { error } = await db
    .from('astrologer_blocks')
    .delete()
    .eq('customer_id', customerId)
    .eq('astrologer_id', astrologerId);

  if (error) {
    if (isMissingTable(error)) { noteMissing('unblockAstrologer'); return { ok: false, reason: 'NOT_CONFIGURED' }; }
    console.error('[moderation] unblockAstrologer failed:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/** The customer's own blocked list, newest first, with names for the UI. */
async function listBlockedAstrologers(customerId) {
  const { data, error } = await db
    .from('astrologer_blocks')
    .select('id, astrologer_id, reason, created_at, astrologers(first_name, last_name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) { noteMissing('listBlockedAstrologers'); return []; }
    console.error('[moderation] listBlockedAstrologers failed:', error.message);
    return [];
  }
  return (data || []).map((r) => ({
    id: r.id,
    astrologerId: r.astrologer_id,
    name: [r.astrologers?.first_name, r.astrologers?.last_name]
      .filter(Boolean).join(' ').trim() || 'Astrologer',
    reason: r.reason || null,
    createdAt: r.created_at,
  }));
}

module.exports = {
  isBlocked,
  blockCustomer,
  unblockCustomer,
  listBlocked,
  reportCustomer,
  isBlockedByCustomer,
  isContactBlocked,
  blockAstrologer,
  unblockAstrologer,
  listBlockedAstrologers,
};
