// Shared client for the backend's paid-astrology-report endpoints (/api/astro/*,
// /api/astro-services, /api/wallet). Centralizes JWT-header attachment and the
// "insufficient balance" error shape so screens don't repeat this boilerplate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// { key, name, description, category, price, is_active, sort_order }[]
export async function getAstroServices() {
  const res = await Instance.get('/api/astro-services');
  return res.data?.data || [];
}

export async function getWalletBalance() {
  const headers = await authHeaders();
  const res = await Instance.get('/api/wallet', { headers });
  return Number(res.data?.data?.balance ?? res.data?.balance ?? 0);
}

// Throws an Error whose `.isInsufficientBalance` is true when the wallet can't cover the price,
// so screens can show a consistent "recharge your wallet" alert without string-matching messages.
export async function runAstroReport(key, payload) {
  const headers = await authHeaders();
  try {
    const res = await Instance.post(`/api/astro/${key}`, payload, { headers });
    return res.data?.data;
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Something went wrong';
    const wrapped = new Error(message);
    wrapped.isInsufficientBalance = message.toLowerCase().includes('insufficient');
    throw wrapped;
  }
}
