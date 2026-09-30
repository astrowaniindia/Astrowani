// The astrologer's own "take free introductory calls" switch.
//
// The rule that matters: switching ON is always allowed, switching OFF needs a minimum
// number of completed free calls. It is enforced SERVER-SIDE (403 MIN_CALLS_NOT_MET) —
// this file and the dashboard only mirror it, exactly as the availability toggles do.
// Never re-implement the rule here; read `canDisable` from the server and believe it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  if (!token) throw new Error('Not signed in');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Current state of the switch.
 *
 * Resolves to `{available:false}` on ANY failure rather than throwing. This is read
 * while the dashboard is painting, and a network blip must hide one optional card, not
 * take down the screen an astrologer runs their day from.
 *
 * @returns {Promise<{available:boolean, enabled?:boolean, managedByAdmin?:boolean,
 *   completed?:number, required?:number, remaining?:number, canDisable?:boolean}>}
 */
export async function getFreeIntroCallState() {
  try {
    const res = await Instance.get('/api/vendor/free-intro-call', await authHeaders());
    return res?.data?.available ? res.data : { available: false };
  } catch (_) {
    return { available: false };
  }
}

/**
 * Flip the switch.
 *
 * REJECTS on refusal, deliberately — the opposite of the getter. An astrologer who
 * turns themselves off and is told nothing would believe they had, keep receiving free
 * calls, and reasonably conclude the app is lying to them. The thrown error carries the
 * server's `code` and its state so the dashboard can say exactly how many more calls
 * are needed.
 */
export async function setFreeIntroCall(enabled) {
  try {
    const res = await Instance.post(
      '/api/vendor/free-intro-call',
      { enabled: !!enabled },
      await authHeaders(),
    );
    return res?.data || {};
  } catch (err) {
    const data = err?.response?.data || {};
    const e = new Error(data.message || 'Could not change this right now.');
    e.code = data.code || null;
    e.state = data;
    throw e;
  }
}
