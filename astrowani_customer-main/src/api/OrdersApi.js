// One place for every remedies-commerce call, so the cart / address / payment / orders
// screens don't each re-implement token handling and error unwrapping.
//
// Uses the shared `Instance` axios client (baseURL + 20s timeout from src/api/ApiCall.js).
// Note the wallet screen uses raw axios + SOCKET_URL instead; Instance is the newer
// convention and there is no reason to spread the older one further.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Turn an axios failure into something a screen can act on, preserving the parts the
 * backend deliberately sends: `code` (COD_COMING_SOON, INSUFFICIENT_BALANCE,
 * CATEGORY_NOT_SERVICEABLE, OUT_OF_STOCK…) and its payload.
 *
 * Never surfaces axios's bare "Request failed with status code 500" — a customer should
 * not read an HTTP status. Same rule the astro report screens follow.
 */
function normalizeError(err, fallbackMessage) {
  const data = err?.response?.data;
  const e = new Error(data?.message || err?.description || fallbackMessage);
  e.status = err?.response?.status || 0;
  e.code = data?.code || null;
  e.data = data || null;
  return e;
}

// ── Addresses ───────────────────────────────────────────────────────────────

/**
 * Which remedy items an astrologer has recommended to THIS customer, as
 * { [itemId]: 'Astrologer Name' }. Drives the "Recommended by" line on a product card.
 *
 * Resolves to {} on any failure — a missing badge is invisible, whereas letting this
 * reject would break the whole shop screen for a decoration.
 */
export async function getRecommendations() {
  try {
    const res = await Instance.get('/api/remedies/recommended', await authHeader());
    return res.data?.recommendations || {};
  } catch (_) {
    return {};
  }
}

export async function listAddresses() {
  try {
    const res = await Instance.get('/api/addresses', await authHeader());
    return res.data?.data || [];
  } catch (err) {
    throw normalizeError(err, 'Could not load your saved addresses');
  }
}

export async function createAddress(body) {
  try {
    const res = await Instance.post('/api/addresses', body, await authHeader());
    return res.data?.data;
  } catch (err) {
    throw normalizeError(err, 'Could not save this address');
  }
}

export async function updateAddress(id, body) {
  try {
    const res = await Instance.put(`/api/addresses/${id}`, body, await authHeader());
    return res.data?.data;
  } catch (err) {
    throw normalizeError(err, 'Could not update this address');
  }
}

export async function deleteAddress(id) {
  try {
    await Instance.delete(`/api/addresses/${id}`, await authHeader());
  } catch (err) {
    throw normalizeError(err, 'Could not remove this address');
  }
}

// ── Cart / checkout ─────────────────────────────────────────────────────────

/**
 * The authoritative bill for a cart. Returns the server's own item lines, fees and total —
 * plus `blockedTypes` (categories not being delivered yet) and `outOfStock`.
 *
 * A 400 here is a normal, expected outcome (empty cart, an item an admin deactivated), so
 * the body is returned rather than thrown: the cart screen needs to render the reason.
 */
export async function getQuote(items) {
  try {
    const res = await Instance.post('/api/orders/quote', { items }, await authHeader());
    return res.data;
  } catch (err) {
    if (err?.response?.status === 400 && err.response.data) return err.response.data;
    throw normalizeError(err, 'Could not calculate your total');
  }
}

/**
 * Create the order. For 'wallet' this also charges it and the order is done. For
 * 'razorpay' it returns what RazorpayCheckout.open needs, and nothing is paid until
 * verifyOrderPayment succeeds.
 */
export async function checkout({ items, addressId, paymentMethod, clientRequestId }) {
  try {
    const res = await Instance.post(
      '/api/orders/checkout',
      // clientRequestId de-duplicates retries of one checkout attempt so a slow or raced
      // call can't become a second order and a second charge. See PaymentScreen.
      { items, addressId, paymentMethod, clientRequestId },
      await authHeader(),
    );
    return res.data;
  } catch (err) {
    throw normalizeError(err, 'Could not place your order');
  }
}

export async function verifyOrderPayment(payload) {
  try {
    const res = await Instance.post('/api/orders/verify-payment', payload, await authHeader());
    return res.data;
  } catch (err) {
    throw normalizeError(err, 'Could not confirm your payment');
  }
}

// ── History ─────────────────────────────────────────────────────────────────

export async function listOrders() {
  try {
    const res = await Instance.get('/api/orders/mine', await authHeader());
    return res.data?.data || [];
  } catch (err) {
    throw normalizeError(err, 'Could not load your orders');
  }
}

export async function cancelOrder(id) {
  try {
    const res = await Instance.post(`/api/orders/${id}/cancel`, {}, await authHeader());
    return res.data;
  } catch (err) {
    throw normalizeError(err, 'Could not cancel this order');
  }
}

export default {
  listAddresses, createAddress, updateAddress, deleteAddress,
  getQuote, checkout, verifyOrderPayment, listOrders, cancelOrder,
};
