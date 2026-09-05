// Account deletion — the two calls behind Settings → "Delete my account".
//
// Port of the customer app's src/api/AccountApi.js against the vendor endpoints
// (/api/vendor/account/*). Same shared `Instance` axios client, same token-from-
// AsyncStorage pattern, same error normalisation so a screen never has to show an
// astrologer a raw HTTP status.
//
// NOTE these deliberately REJECT on failure rather than resolving to a safe default,
// which is the opposite of most helpers in this app. Elsewhere a failed fetch means a
// missing badge or an unshown banner, and silence is right. Here, swallowing a failure
// would tell somebody their account was deleted when it was not — which is the whole
// reason this exists.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return {headers: {Authorization: `Bearer ${token}`}};
}

function normalizeError(err, fallbackMessage) {
  const data = err?.response?.data;
  const e = new Error(data?.message || fallbackMessage);
  e.status = err?.response?.status || 0;
  e.code = data?.code || null;
  return e;
}

/**
 * What deletion will cost, so the confirmation can state it rather than imply it.
 * Returns { walletBalance, pendingWithdrawal, canDelete, blockedReason }.
 *
 * `walletBalance` here is EARNINGS, not a deposit — the UI has to say so, and tell
 * them to withdraw first rather than merely warning that it disappears.
 */
export async function getDeletePreview() {
  try {
    const res = await Instance.get('/api/vendor/account/delete-preview', await authHeader());
    return res.data;
  } catch (err) {
    throw normalizeError(err, 'Could not load your account details.');
  }
}

/**
 * Permanently delete the signed-in astrologer's own account.
 *
 * Resolves with { mode: 'deleted' | 'hidden' } — both mean the account is gone as far
 * as the astrologer is concerned; 'hidden' means session/earnings records were retained
 * because the database refuses to destroy a money trail, with the profile de-listed and
 * every service switched off. The UI does not distinguish them.
 */
export async function deleteAccount() {
  try {
    const res = await Instance.post('/api/vendor/account/delete', {}, await authHeader());
    if (!res.data?.success) {
      throw new Error(res.data?.message || 'Could not delete your account.');
    }
    return res.data;
  } catch (err) {
    throw normalizeError(err, 'Could not delete your account. Please try again.');
  }
}
