// People this customer has blocked in live stream comments.
//
// Kept on the device, keyed by the signed-in customer, so a different account on the
// same phone starts with its own list. The server-side counterpart is the report
// itself (admins can ban a commenter from every stream); this list is the immediate,
// personal "I don't want to see this person" that App Store Guideline 1.2 requires.
import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (customerId) => `liveBlockedSenders_${customerId || 'anon'}`;

export async function getLiveBlocked(customerId) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(customerId));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch (_) {
    return new Set();
  }
}

export async function addLiveBlocked(customerId, senderId) {
  const set = await getLiveBlocked(customerId);
  set.add(senderId);
  try {
    await AsyncStorage.setItem(keyFor(customerId), JSON.stringify([...set].slice(-500)));
  } catch (_) {}
  return set;
}
