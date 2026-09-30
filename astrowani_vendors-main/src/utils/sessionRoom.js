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
const MAX_WAIT_MS = 60000;

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
  const startedAt = Date.now();

  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

  const attempt = () => {
    if (stopped || joined || !socket || !sessionId) return;
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.warn(`[${label}] gave up joining session room ${sessionId} after ${MAX_WAIT_MS}ms`);
      return;
    }
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
    timer = setTimeout(attempt, RETRY_MS);
  };

  attempt();

  // A reconnect puts this socket in a brand-new server-side session with no rooms, so the
  // join has to happen again — and has to be retried again if it fails again.
  const onConnect = () => {
    if (stopped) return;
    joined = false;
    attempt();
  };
  socket.on('connect', onConnect);

  return {
    stop: () => { stopped = true; clear(); try { socket.off('connect', onConnect); } catch (_) {} },
    joined: () => joined,
  };
}

export default joinSessionWithRetry;
