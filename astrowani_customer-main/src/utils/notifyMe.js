// src/utils/notifyMe.js
// "Notify me" waitlist join — shared by every busy-state UI (list cards + profile dock).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

export async function requestNotifyMe(astrologerId, requestType = 'chat') {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token || !astrologerId) return { ok: false };
    const resp = await fetch(`${Instance.defaults.baseURL}/api/astrologer/${astrologerId}/notify-me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestType }),
    });
    return { ok: resp.ok };
  } catch (e) {
    return { ok: false };
  }
}
