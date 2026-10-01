// SERVICE PRESENCE POLICY (2026-10-02) — "if you cannot be billed, you cannot be served."
//
// Chat messages are sent over HTTP (POST /api/chat/message) while BILLING presence is a
// websocket room (sessionManager.bothParticipantsPresent). Two different signals for the
// same question — "is this person actually here" — and that gap is both:
//
//   * the exploit: kill the websocket, keep chatting over HTTP, let the session die on the
//     abandon timer, open a new one, repeat — consultation for free, indefinitely; and
//   * the reason the 2026-10-01 regression cost a whole evening silently: service kept
//     working perfectly while billing had already stopped, so nobody could see it.
//
// Gating both on the same signal means a future presence bug breaks the chat loudly within
// seconds instead of quietly draining money. The I/O (asking the room who is in it) stays in
// index.js; the POLICY lives here so it can be tested without booting the server.

const SERVICE_PRESENCE_GRACE_MS = 20 * 1000;

/**
 * May this sender's message still be carried?
 *
 * @param {object}  p
 * @param {boolean} p.inRoom       are they in the session's socket room right now?
 * @param {number}  [p.lastSeenMs] ms when they were last seen in it (0/undefined = never)
 * @param {string}  [p.startedAt]  the session's started_at — see the note below
 * @param {number}  [p.now]
 * @param {number}  [p.graceMs]
 * @returns {boolean}
 */
function mayBeServed({ inRoom, lastSeenMs, startedAt, now, graceMs } = {}) {
  if (inRoom) return true;
  const at = typeof now === 'number' ? now : Date.now();
  const grace = typeof graceMs === 'number' ? graceMs : SERVICE_PRESENCE_GRACE_MS;
  // A session that has only just started counts as present even with no recorded sighting:
  // the customer's birth details are auto-sent the moment the chat screen opens, which can
  // race join_session's two database round trips. Without this, the very first message of
  // every consultation would be at the mercy of that race.
  const seen = Math.max(
    Number(lastSeenMs) || 0,
    startedAt ? (Date.parse(startedAt) || 0) : 0,
  );
  if (!seen) return false;
  return at - seen <= grace;
}

module.exports = { SERVICE_PRESENCE_GRACE_MS, mayBeServed };
