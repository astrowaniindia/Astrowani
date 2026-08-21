// Who the signed-in customer is — name, phone, email — for prefilling forms.
//
// WHY: several screens asked the customer to retype things the app already knew. The
// Razorpay sheet asked for a mobile number and email on every single payment (both wallet
// top-ups and remedy orders) because no `prefill` block was ever passed, and the delivery
// address form opened completely blank even for someone whose name and number are on file.
//
// Reads the cached `userData` blob that Home.js and UserProfileScreen.js already keep in
// AsyncStorage, and falls back to GET /api/users/profile if that cache is cold (e.g. the
// customer went straight to the shop without passing through Home this launch).
//
// Never throws and never blocks: every caller here is prefilling a form the customer can
// still fill in by hand, so a failed lookup must degrade to empty fields rather than an
// error. Callers get empty strings, not undefined, so values can be assigned straight into
// form state or a Razorpay options object.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

const EMPTY = { name: '', phone: '', email: '' };

// The profile endpoint and the customers table disagree on the phone field's name
// (`phone` vs `mobile`), and different call sites have cached both shapes over time.
const pickPhone = (o) => o?.phone || o?.mobile || o?.phoneNumber || '';

function normalise(src) {
  if (!src) return null;
  const phone = String(pickPhone(src)).replace(/\D/g, '').slice(-10);
  return {
    name: src.name || '',
    // Razorpay rejects a malformed contact outright, so only pass a clean 10-digit number.
    phone: phone.length === 10 ? phone : '',
    email: src.email || '',
  };
}

/**
 * Best-effort identity for prefilling. Always resolves; worst case every field is ''.
 */
export async function getCustomerIdentity() {
  try {
    const raw = await AsyncStorage.getItem('userData');
    if (raw) {
      const cached = normalise(JSON.parse(raw));
      // A cached blob with no usable name AND no usable phone isn't worth returning —
      // fall through to the network so a half-written cache doesn't beat a real answer.
      if (cached && (cached.name || cached.phone)) return cached;
    }
  } catch (_) {
    // Corrupt cache — fall through to the network.
  }

  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return { ...EMPTY };
    const res = await Instance.get('/api/users/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return normalise(res?.data?.data) || { ...EMPTY };
  } catch (_) {
    return { ...EMPTY };
  }
}

/**
 * The `prefill` block for RazorpayCheckout.open(). Razorpay only skips a field when it
 * receives a valid value, so anything blank is omitted entirely rather than sent as ''
 * (an empty string still counts as "provided" and leaves the field shown but empty).
 */
export async function razorpayPrefill() {
  const { name, phone, email } = await getCustomerIdentity();
  const prefill = {};
  if (name) prefill.name = name;
  if (phone) prefill.contact = phone;
  if (email) prefill.email = email;
  return prefill;
}

export default { getCustomerIdentity, razorpayPrefill };
