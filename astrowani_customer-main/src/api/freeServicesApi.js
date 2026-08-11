// Client for the backend's Free Services paywall — each visit to a Free Service (Panchang,
// Janam Kundali, Kundali Match, Free Horoscope, Shubh Muhurat) now costs a flat ₹1, charged
// once per Home-screen card tap (see freeServicesRoutes.js POST /api/free-services/charge).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

// Throws an Error whose `.isInsufficientBalance` is true when the wallet can't cover ₹1,
// same convention as astroApi.js's runAstroReport so callers can share error-handling.
export async function chargeFreeService(serviceKey, requestId) {
  const headers = await authHeaders();
  try {
    const res = await Instance.post(
      '/api/free-services/charge',
      { service: serviceKey, requestId },
      { headers },
    );
    return res.data;
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Something went wrong';
    const wrapped = new Error(message);
    wrapped.isInsufficientBalance = message.toLowerCase().includes('insufficient');
    throw wrapped;
  }
}
