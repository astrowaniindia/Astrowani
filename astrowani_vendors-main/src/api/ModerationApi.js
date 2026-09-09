// Report / block a customer.
//
// Both stores require this for an app whose users talk to each other — Apple
// Guideline 1.2 and Google Play's UGC policy. Customers could already report
// astrologers; this is the missing half.
//
// These REJECT on failure rather than resolving to a safe default, matching
// AccountApi.js and for the same reason: an astrologer who taps Block and is told
// nothing must not be left believing someone was blocked when they were not.
// getBlocked() is the one exception — see its own note.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  if (!token) throw new Error('Not signed in');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Reasons the backend accepts. Kept in step with moderationRoutes.js REASONS. */
export const REPORT_REASONS = ['abusive', 'harassment', 'sexual', 'threat', 'spam', 'fraud', 'other'];

/**
 * File a report, optionally blocking in the same action.
 * @returns {Promise<{blocked: boolean}>}
 */
export async function reportCustomer({ customerId, reason, note, alsoBlock }) {
  const res = await Instance.post(
    '/api/vendor/customers/report',
    { customerId, reason, note: note || undefined, alsoBlock: !!alsoBlock },
    await authHeaders(),
  );
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Could not submit the report');
  return { blocked: !!res.data.blocked };
}

export async function blockCustomer({ customerId, reason }) {
  const res = await Instance.post(
    '/api/vendor/customers/block',
    { customerId, reason: reason || undefined },
    await authHeaders(),
  );
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Could not block this customer');
  return { alreadyBlocked: !!res.data.alreadyBlocked };
}

export async function unblockCustomer({ customerId }) {
  const res = await Instance.post(
    '/api/vendor/customers/unblock',
    { customerId },
    await authHeaders(),
  );
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Could not unblock this customer');
  return true;
}

/**
 * The blocked list. Resolves to [] on failure rather than rejecting — this one only
 * ever paints a screen, and an empty list with a visible "couldn't load" state is
 * better than an error boundary. The screen distinguishes the two.
 */
export async function getBlocked() {
  try {
    const res = await Instance.get('/api/vendor/customers/blocked', await authHeaders());
    return { ok: true, blocked: res?.data?.blocked || [] };
  } catch (e) {
    return { ok: false, blocked: [], error: e?.message };
  }
}
