// awaitRequestOutcome — poll the server for the outcome of a pending call/chat request,
// as a backstop behind the live socket and Supabase Realtime paths.
//
// WHY THIS EXISTS (2026-09-30). While a request was ringing, the customer app learned the
// outcome from exactly one push-style message and had NO way to recover if that single
// message was missed. It then sat on "Request sent" / "Ringing…" until the ring timer gave
// up, while the astrologer was already in the session — the "astrologer is connected but
// the customer never is" bug.
//
// All of these were live ways to miss that one message:
//   * the Realtime channel is still SUBSCRIBING when the astrologer accepts (observed
//     accepts as fast as 4s; the channel needs ~1s, and the socket's verified join_room
//     does a database round trip before the customer is even in their own room);
//   * the phone is locked or the app backgrounded — the tester is looking at the OTHER
//     handset — which drops both the socket and the Realtime websocket, and neither
//     re-delivers anything that was sent while away;
//   * a plain network blip;
//   * the astrologer accepted from the heads-up notification or the draw-over-other-apps
//     overlay. Those run with no HomeScreen and no socket, so before 2026-09-30 nothing
//     emitted `accept_call` at all and Realtime was the ONLY signal that ever existed.
//
// Polling is deliberately the dumb, reliable layer: it cannot miss an edge, it does not
// care which transport broke, and it costs one small authenticated GET every couple of
// seconds for at most the length of one ring.
//
// It never decides anything itself — it reports the outcome and the caller runs the exact
// same navigate/cleanup it already runs for the socket path. Those handlers are all
// guarded (navigatedRef / channel teardown), so whichever path arrives first wins and the
// rest are no-ops.

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

const POLL_MS = 2000;

/**
 * @param {object}   args
 * @param {'call'|'chat'} args.kind
 * @param {string}   args.requestId
 * @param {(sessionId: string|null) => void} args.onAccepted
 * @param {(status: string) => void} [args.onClosed]  rejected / missed / cancelled
 * @param {string}   [args.label]
 * @returns {{ stop: () => void, checkNow: () => void }}
 */
export function awaitRequestOutcome({ kind, requestId, onAccepted, onClosed, label = 'request' }) {
  let stopped = false;
  let inFlight = false;
  let timer = null;

  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const stop = () => {
    stopped = true;
    clear();
    try { appStateSub && appStateSub.remove(); } catch (_) {}
  };

  const poll = async () => {
    if (stopped || inFlight || !requestId) return;
    inFlight = true;
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await Instance.get(`/api/requests/${kind}/${requestId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (stopped) return;
      const status = res?.data?.status;
      if (status === 'accepted') {
        stop();
        console.log(`[${label}] outcome resolved by polling: accepted`);
        onAccepted(res.data.sessionId || null);
        return;
      }
      if (status && status !== 'pending') {
        stop();
        console.log(`[${label}] outcome resolved by polling: ${status}`);
        if (onClosed) onClosed(status);
      }
    } catch (e) {
      // A transient failure must not end the wait — the live paths may still deliver, and
      // the next tick tries again. Deliberately quiet: this runs every 2s.
    } finally {
      inFlight = false;
      if (!stopped) { clear(); timer = setTimeout(poll, POLL_MS); }
    }
  };

  // Coming back to the foreground is the single most likely moment for the app to be
  // holding a stale "still waiting" screen, so check immediately rather than waiting for
  // the next tick.
  const appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && !stopped) poll();
  });

  timer = setTimeout(poll, POLL_MS);

  return { stop, checkNow: poll };
}

export default awaitRequestOutcome;
