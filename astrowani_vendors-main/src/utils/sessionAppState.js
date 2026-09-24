// Tells the backend when the astrologer's app goes to the background and comes back, for
// the call/video screens (chat has its own copy of this in VendorChatSession.js).
//
// WHY: the server keeps a session open for up to 5 minutes while the astrologer's app is
// backgrounded (SessionManager.VENDOR_BACKGROUND_GRACE_MS) — but only for sessions it was
// TOLD are backgrounded. Chat told it; the call screens never did, so if the phone dropped
// the socket while the astrologer was in another app the call was ended after 25–45
// seconds instead of getting the 5-minute allowance. Both call types are chat_sessions
// rows server-side, so no backend change is needed.
import { useEffect } from 'react';
import { AppState } from 'react-native';

/** Emit the current foreground/background state for a session on `socket`. */
export function reportSessionAppState(socket, sessionId) {
  if (!socket || !sessionId) return;
  socket.emit('session_app_state', {
    sessionId,
    state: AppState.currentState === 'active' ? 'active' : 'background',
  });
}

/**
 * Report every foreground/background transition for the life of the screen.
 * socketRef / isEndingRef are refs so this never re-subscribes as the call progresses.
 * (Re-reporting after a socket reconnect is done in each screen's own 'connect' handler.)
 */
export default function useSessionAppState(sessionId, socketRef, isEndingRef) {
  useEffect(() => {
    if (!sessionId) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'background' && next !== 'active') return;
      if (isEndingRef && isEndingRef.current) return;
      reportSessionAppState(socketRef.current, sessionId);
    });
    return () => sub.remove();
  }, [sessionId, socketRef, isEndingRef]);
}
