// First-ever session (any astrologer, any type — chat/audio/video) is free, to let a
// brand-new customer try the platform before their wallet is ever touched. Eligibility is
// purely "have they ever had a chat_sessions row at all" — the actual free billing window
// (skip charging for the first few minutes) is enforced server-side in sessionManager.js;
// this client-side check only gates the UI (banners + skipping the pre-call wallet-balance
// gate, since a genuinely new customer may have ₹0 balance and would otherwise never be
// able to reach their own free session).
//
// The count used to be read straight off chat_sessions with the public anon key. It now
// goes through the backend (GET /api/customer/first-session-eligible) so that grant can
// be revoked — chat_sessions is one of the last two tables still readable with the key
// that ships inside this APK. The server applies the same rule and, like this did,
// fails CLOSED: if it cannot tell, the answer is "not eligible".
import { isFirstSessionFree } from '../api/SessionApi';

export async function isEligibleForFreeConsultation(customerId) {
  // customerId is no longer used for the lookup — the server takes the customer from the
  // token, which is also why a tampered id can no longer ask about somebody else. Kept in
  // the signature because every caller passes it and the falsy guard is still the right
  // answer for "not logged in yet".
  if (!customerId) return false;
  return isFirstSessionFree();
}
