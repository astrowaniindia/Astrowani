import { SOCKET_URL } from './config.js?v=22';
import { getToken, getUser, isSignedIn, onAuthChange } from './session.js?v=22';
import { loadScript } from './ui.js?v=22';

/**
 * One Socket.io connection per tab, shared by everything that needs it.
 *
 * The backend's Socket.io is 4.x and its CORS is `origin: '*'`, so a browser
 * connects exactly as the apps do. The protocol is identical — this client is
 * just another participant, which is why a web customer and an app astrologer
 * can share a session without either side knowing the difference.
 */

const CLIENT_CDN = 'https://cdn.socket.io/4.8.1/socket.io.min.js';

let socket = null;
let connecting = null;

export async function getSocket() {
  if (socket && socket.connected) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    await loadScript(CLIENT_CDN);
    if (!window.io) throw new Error('socket.io client did not load');

    if (!socket) {
      socket = window.io(SOCKET_URL, {
        auth: { token: getToken() },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
      });

      socket.on('connect', () => {
        console.log('[aw/socket] connected');
        joinPersonalRoom();
      });
      socket.on('connect_error', (e) => {
        // Logged, never thrown: a transient socket failure must not break the
        // page, and the HTTP polling backstops cover the gap.
        console.log('[aw/socket] connect_error:', e.message);
      });
    }

    if (!socket.connected) {
      await new Promise((resolve) => {
        if (socket.connected) return resolve();
        socket.once('connect', resolve);
        // Resolve anyway after a moment — callers attach listeners and the
        // client keeps retrying on its own; blocking forever helps nobody.
        setTimeout(resolve, 4000);
      });
    }
    return socket;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Join this customer's personal room — how `call_accepted`, `chat_accepted`,
 * `call_rejected` and `session_ended` reach us.
 *
 * Re-emitted on every reconnect because Socket.io does NOT restore room
 * membership after a reconnect; the apps learned this the expensive way
 * (CLAUDE.md DO: a client that silently stopped re-joining looked, server-side,
 * exactly like a customer who had left — which paused billing and killed live
 * consultations mid-sentence).
 */
export function joinPersonalRoom() {
  const user = getUser();
  if (!socket || !socket.connected || !user?.id) return;
  socket.emit('join_room', user.id);
}

/**
 * Join a session room, retrying until the server acknowledges it.
 *
 * THE SESSION ROOM IS THE MEDIA PATH: `webrtc_ready` -> `webrtc_offer` ->
 * `webrtc_answer` all travel through it. A join that quietly failed means the
 * call can never connect and the screen just rings out, so this never gives up
 * while the consultation is open — it only slows down. It also re-arms on
 * reconnect for the reason above.
 *
 * Returns a handle with `.stop()`.
 */
export function joinSessionWithRetry(sock, sessionId, { label = 'web' } = {}) {
  let stopped = false;
  let joined = false;
  let attempts = 0;
  let timer = null;

  function schedule() {
    if (stopped || joined) return;
    clearTimeout(timer);
    // Fast while it is plausibly a timing problem, then slow — but never zero.
    const delay = attempts < 8 ? 1500 : 15000;
    timer = setTimeout(attempt, delay);
  }

  function attempt() {
    if (stopped || joined || !sock) return;
    attempts += 1;
    sock.emit('join_session', sessionId, (ack) => {
      if (stopped) return;
      if (ack && ack.ok) {
        joined = true;
        clearTimeout(timer);
        console.log(`[aw/socket] ${label}: joined session room`);
        return;
      }
      // Only a retryable refusal is worth repeating. "not a participant" or
      // "session ended" will never become true by trying again.
      if (ack && ack.retry === false) {
        stopped = true;
        console.log(`[aw/socket] ${label}: join refused (${ack.reason || 'unknown'})`);
        return;
      }
      schedule();
    });
    schedule();
  }

  function onConnect() {
    // A new connection is in no rooms at all, so the budget resets with it.
    joined = false;
    attempts = 0;
    attempt();
  }

  sock.on('connect', onConnect);
  attempt();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      sock.off('connect', onConnect);
    },
    get joined() { return joined; },
  };
}

// A sign-in or sign-out changes who this socket is. Reconnect with the new
// credential rather than leaving an authenticated socket behind.
onAuthChange(() => {
  if (!socket) return;
  try { socket.disconnect(); } catch (_) {}
  socket.auth = { token: getToken() };
  if (isSignedIn()) {
    socket.connect();
  } else {
    socket = null;
  }
});
