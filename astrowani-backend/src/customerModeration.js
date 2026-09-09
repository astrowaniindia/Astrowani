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

module.exports = {
  isBlocked,
  blockCustomer,
  unblockCustomer,
  listBlocked,
  reportCustomer,
};
