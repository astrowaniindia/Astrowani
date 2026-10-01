// joinSessionWithRetry — get into the session's socket room, and KEEP TRYING until the
// server confirms it.
//
// WHY THIS EXISTS (2026-09-30). Every call screen used to do a bare
// `socket.emit('join_session', sessionId)` and assume it worked. On the backend that handler
// does two database round trips before joining (resolve the caller's identity, then read the
// session row) and, on any failure, used to `return` silently. The client had no idea, and
// nothing ever retried.
//
// That is a complete, permanent media failure, because the WebRTC handshake is carried by
// that room: the astrologer emits `webrtc_ready` every 2s to `socket.to(sessionId)`, the
// customer answers with `webrtc_offer`. A customer that is not in the room hears nothing,
// so it never sends an offer, so ICE never starts, so the astrologer never reaches
// 'connected' and never emits `signal_connection` — the session is never even activated.
// What the customer SEES is "Ringing…" until the countdown gives up. Measured in production
// on 2026-09-30: audio sessions created and ended ~34s later with `next_billing_at` still
// NULL, and zero `call_connected` events, while video calls in the same window connected
// normally. The difference was luck, not design.
//
// The retry ends the moment the server acks. A rejection that cannot improve by retrying
// (not a participant, no token, session already over) stops immediately — retrying those
// would just be noise.

const RETRY_MS = 1500;
// How long the FAST retries run — per connection, not for the life of the screen. See the
// deadline note in attempt() below.
const FAST_RETRY_MS = 60000;
// After that, keep trying forever, just slowly. Never give up while the screen is open:
// being out of the session room is not a cosmetic failure, it is the backend concluding
// this participant has left (sessionManager.bothParticipantsPresent), which pauses billing
// and then force-ends the consultation.
const SLOW_RETRY_MS = 15000;

/**
 * @param {object} socket        a connected/connecting socket.io client
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {(info:{reason:string}) => void} [opts.onPermanentFailure] called when retrying cannot help
 * @param {(sessionId:string) => void}     [opts.onJoined]
 * @param {string} [opts.label] for logs
 * @returns {{ stop: () => void, joined: () => boolean }}
 */
export function joinSessionWithRetry(socket, sessionId, opts = {}) {
  const { onPermanentFailure, onJoined, label = 'session' } = opts;
  let stopped = false;
  let joined = false;
  let timer = null;
  // THE DEADLINE IS PER CONNECTION, AND RESET ON EVERY RECONNECT (see onConnect below).
  //
  // REGRESSION FIXED 2026-10-01 — this was a single `startedAt` captured when the helper
  // was created, compared against a hard 60s cap inside attempt(). Sixty seconds after the
  // chat/call screen mounted, every later reconnect ran attempt(), tripped the cap and
  // returned WITHOUT EMITTING ANYTHING — silently, with joined already reset to false. The
  // socket was healthy and rejoining its personal room fine; only the session room was
  // never re-entered. The backend then saw the participant as gone: billing paused
  // (sessionManager.bothParticipantsPresent) and the session was force-ended ~2 min later
  // by the abandon guard in index.js, mid-conversation.
  //
  // Measured in production on 2026-10-01: one astrologer and one customer, 12 consecutive
  // chats over two hours, every one cut off after 2-4 minutes, EVERY ONE BILLED ZERO, while
  // both people were visibly typing to each other the whole time. The chat itself kept
  // working — the screen re-fetches history on 'connect' and sends over HTTP — so nothing
  // looked wrong to either of them. The astrologer was paid out of the platform's pocket.
  let deadlineAt = Date.now() + FAST_RETRY_MS;

  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

  const attempt = () => {
    if (stopped || joined || !socket || !sessionId) return;
    // Past the fast window we slow down, but we do NOT stop: a join that is still failing
    // after a minute is a problem to keep working at, not one to abandon the session over.
    const slow = Date.now() > deadlineAt;
    // The ack is the whole point. An older backend ignores the extra argument and never
    // calls it, in which case this falls back to re-emitting every RETRY_MS — which is
    // exactly what the old code effectively needed and never did, so it is still an
    // improvement rather than a regression.
    socket.emit('join_session', sessionId, (res) => {
      if (stopped) return;
      if (res && res.ok) {
        joined = true;
        clear();
        if (onJoined) { try { onJoined(sessionId); } catch (_) {} }
        return;
      }
      if (res && res.retry === false) {
        stopped = true;
        clear();
        console.warn(`[${label}] join_session refused for ${sessionId}: ${res.reason}`);
        if (onPermanentFailure) { try { onPermanentFailure({ reason: res.reason }); } catch (_) {} }
      }
      // Anything else (including no ack at all) falls through to the scheduled retry.
    });
    clear();
    timer = setTimeout(attempt, slow ? SLOW_RETRY_MS : RETRY_MS);
  };

  attempt();

  // A reconnect puts this socket in a brand-new server-side session with no rooms, so the
  // join has to happen again — and has to be retried again if it fails again.
  const onConnect = () => {
    if (stopped) return;
    joined = false;
    // A fresh connection gets a fresh fast-retry budget. Without this reset the helper is
    // dead on arrival for every reconnect after the first minute — the regression above.
    deadlineAt = Date.now() + FAST_RETRY_MS;
    attempt();
  };
  socket.on('connect', onConnect);

  return {
    stop: () => { stopped = true; clear(); try { socket.off('connect', onConnect); } catch (_) {} },
    joined: () => joined,
  };
}

export default joinSessionWithRetry;
