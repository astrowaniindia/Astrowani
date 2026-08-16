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
    const status = err.response?.status;
    const serverMessage = err.response?.data?.message;
    // A gateway error (or a timeout) never carries our JSON body, so axios's own
    // "Request failed with status code 502" is all that is left — and that is
    // exactly what a customer was shown when the PDF report failed. Replace the
    // bare status-code string with something that says what to do.
    const message = serverMessage
      || (status >= 500
        ? 'This report could not be generated right now. You have not been charged — please try again in a few minutes.'
        : null)
      || (err.message && !/status code/i.test(err.message) ? err.message : null)
      || 'Something went wrong. Please try again.';

    const wrapped = new Error(message);
    // Only a 400 from OUR backend means the wallet is short. Matching on the word
    // "insufficient" alone once misfired on the upstream provider's own
    // "Insufficient credits" quota error, telling the customer to recharge a
    // wallet that was never the problem.
    wrapped.isInsufficientBalance = status === 400 && /insufficient/i.test(serverMessage || '');
    throw wrapped;
  }
}
