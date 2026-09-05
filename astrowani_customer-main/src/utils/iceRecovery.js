// ICE recovery for the WebRTC call screens.
//
// WHY THIS EXISTS (2026-09-05). Every call screen handled
// `iceConnectionState === 'failed'` by going straight to doEndCall(). But
// 'failed' is exactly the state WebRTC is designed to recover FROM: a wifi ->
// mobile-data switch, a tower handover, a lift, a few seconds of dead signal.
// An ICE restart re-gathers candidates on the SAME peer connection and
// renegotiates a path, usually within a couple of seconds, without tearing down
// the media tracks or the session. Dropping the call instead meant the customer
// had to redial, be billed a fresh connection, and the astrologer had to accept
// again — for a blip that would have healed itself.
//
// ROLES. The customer is ALWAYS the offerer and the vendor ALWAYS the answerer
// (see the webrtc_ready -> webrtc_offer -> webrtc_answer flow in the call
// screens). So only the customer can initiate a restart, via
// createOffer({iceRestart: true}). The vendor's only job is to STOP ending the
// call the instant it sees 'failed' and give the customer's re-offer time to
// arrive — its existing `webrtc_offer` handler already answers a re-offer
// correctly, because it re-runs setRemoteDescription + createAnswer with no
// once-only guard. Pass `restartIce` on the customer side; omit it on the
// vendor side and this becomes a patience timer.
//
// The backend needs no change: `webrtc_offer` is relayed with a stateless
// `socket.to(sessionId)` broadcast (index.js), so a re-offer takes the same
// path as the first one.
//
// 'disconnected' is deliberately a WARNING, not a failure. It is frequently
// transient and clears on its own, so forcing a restart on it would cause more
// churn than it prevents. Only 'failed', or a 'disconnected' that has not
// cleared within DISCONNECT_GRACE_MS, starts recovery. 'closed' is always a
// deliberate teardown and ends the call at once.

// How long a 'disconnected' is allowed to sit before it is treated as real.
const DISCONNECT_GRACE_MS = 6000;
// Hard bound on a whole recovery episode, measured from the FIRST failure —
// not reset per attempt. Without this, a connection flapping between 'failed'
// and 'disconnected' could keep pushing the deadline out indefinitely while the
// call sat dead on screen and the session kept billing.
const RECOVERY_WINDOW_MS = 15000;
// Two restarts is enough to cover a network handover. Beyond that the path is
// genuinely gone and retrying only delays telling the user.
const MAX_ATTEMPTS = 2;

/**
 * @param label      log prefix, e.g. 'Customer/Voice'
 * @param restartIce optional async () => void — offerer only. Should create an
 *                   ICE-restart offer and emit it. May throw; failures are
 *                   logged and the recovery window still applies.
 * @param onGiveUp   called once when recovery has definitively failed. The
 *                   caller is responsible for its own isEndingRef guard.
 */
export function createIceRecovery({label, restartIce, onGiveUp}) {
  let disconnectTimer = null;
  let giveUpTimer = null;
  let attempts = 0;
  let disposed = false;

  const clearTimers = () => {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    if (giveUpTimer) {
      clearTimeout(giveUpTimer);
      giveUpTimer = null;
    }
  };

  const giveUp = reason => {
    if (disposed) {
      return;
    }
    clearTimers();
    console.log(`[${label}] ICE recovery gave up: ${reason}`);
    onGiveUp();
  };

  const beginRecovery = async () => {
    if (disposed) {
      return;
    }
    if (!giveUpTimer) {
      giveUpTimer = setTimeout(
        () => giveUp('recovery window elapsed'),
        RECOVERY_WINDOW_MS,
      );
    }
    // Answerer: nothing to send. Just hold the line for the offerer's re-offer
    // until the window above expires.
    if (!restartIce) {
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      return;
    }
    attempts += 1;
    console.log(`[${label}] ICE restart attempt ${attempts}/${MAX_ATTEMPTS}`);
    try {
      await restartIce();
    } catch (e) {
      // Swallowed on purpose — the recovery window is what ends the call, so a
      // throwing restart must not bypass the remaining attempt or the timer.
      console.log(`[${label}] ICE restart attempt ${attempts} threw:`, e?.message || e);
    }
  };

  return {
    /** Feed every iceConnectionState change here. */
    handleState(state) {
      if (disposed) {
        return;
      }
      if (state === 'connected' || state === 'completed') {
        // Recovered (or connected for the first time). Reset the budget so a
        // later, unrelated drop gets a full set of attempts of its own.
        clearTimers();
        attempts = 0;
        return;
      }
      if (state === 'closed') {
        giveUp('peer connection closed');
        return;
      }
      if (state === 'failed') {
        beginRecovery();
        return;
      }
      if (state === 'disconnected') {
        // Do not start a second grace timer, and do not restart the clock if a
        // recovery episode is already running.
        if (!disconnectTimer && !giveUpTimer) {
          disconnectTimer = setTimeout(() => {
            disconnectTimer = null;
            beginRecovery();
          }, DISCONNECT_GRACE_MS);
        }
      }
    },

    /** Call from the screen's cleanup so no timer outlives the call. */
    dispose() {
      disposed = true;
      clearTimers();
    },
  };
}
