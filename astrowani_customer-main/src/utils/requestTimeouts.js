// How long a consultation request (chat / audio call / video call) keeps ringing on the
// astrologer's side before the customer's app gives up and marks it missed.
//
// Five minutes, by product decision (2026-09-24): a request stays live until the customer
// cancels it, the astrologer rejects it, or the astrologer accepts it. This is only the
// backstop for "nobody did any of those". It used to be 60 seconds, hardcoded at each of
// the eight call/chat entry points — keep them all on this one constant.
//
// The backend has the matching authoritative sweep (SessionManager.REQUEST_RING_MS in
// astrowani-backend/src/sessionManager.js). If this changes, change that too, or the
// backend will mark requests missed before the app does.
export const REQUEST_RING_TIMEOUT_MS = 5 * 60 * 1000;
