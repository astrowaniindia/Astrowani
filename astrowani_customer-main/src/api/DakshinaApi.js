// Dakshina — the voluntary thank-you offered after a free introductory call.
//
// The server owns the amounts and the split. This file never computes money: it asks
// what may be given, then asks the server to create the Razorpay order.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * What the customer may give.
 *
 * Resolves to `{enabled:false}` on ANY failure rather than throwing. This decides
 * whether an OPTIONAL prompt appears at the end of a call; a network blip must simply
 * skip it, never surface an error to somebody who just finished a pleasant call.
 */
export async function getDakshinaOptions() {
  try {
    const res = await Instance.get('/api/dakshina/options', await authHeader());
    return res?.data?.success ? res.data : { enabled: false };
  } catch (_) {
    return { enabled: false };
  }
}

/**
 * Create the Razorpay order. REJECTS on failure — by this point the customer has
 * deliberately chosen an amount, so silence would be worse than an error.
 */
export async function createDakshinaOrder({ astrologerId, amount, sessionId }) {
  const res = await Instance.post(
    '/api/dakshina/create-order',
    { astrologerId, amount, sessionId },
    await authHeader(),
  );
  if (!res?.data?.success) {
    const e = new Error(res?.data?.message || 'Could not start the payment');
    e.code = res?.data?.code || null;
    throw e;
  }
  return res.data;
}

/**
 * Settle it. The astrologer is credited only once this returns success — the app's word
 * that Razorpay succeeded is never enough, the signature check on the server is.
 */
export async function verifyDakshinaPayment({ orderId, paymentId, signature }) {
  const res = await Instance.post(
    '/api/dakshina/verify-payment',
    {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    },
    await authHeader(),
  );
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Payment could not be verified');
  return res.data;
}
