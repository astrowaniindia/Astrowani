// astrowani_customer-main/src/hooks/useAstrologerListSync.js
//
// Keeps an astrologer list fresh without every screen opening its own Supabase
// Realtime subscription.
//
// WHAT THIS REPLACED
// Home, Chat, Video and Talk-To-Experts each did:
//
//   supabase.channel(...).on('postgres_changes',
//     { event: '*', schema: 'public', table: 'astrologers' },  // no filter
//     () => refetchTheWholeList())                             // no debounce
//
// So Supabase Realtime connections scaled as users x screens, and every
// astrologer row change — a toggle, a charge edit, an FCM token refresh, the
// nightly earnings reset touching every row — was delivered to all of them,
// each answering with a full list refetch. Supabase's free tier caps concurrent
// Realtime connections at 200 and messages at 100/s; at a thousand users this
// is exceeded before anyone touches a toggle.
//
// Now the BACKEND holds a single Realtime subscription (src/astrologerFanout.js)
// and rebroadcasts a bare `astrologers_changed` signal over the Socket.io
// connection the app already maintains for calls and chat. Supabase Realtime
// usage is now constant regardless of how many users are online.
//
// Two further protections here:
//   - debounce, so a burst of changes causes one refetch;
//   - jitter, so N clients receiving the same broadcast do not all hit the API
//     on the same millisecond. The server coalesces duplicate work anyway, but
//     spreading arrivals keeps the socket and the device radio calm.
//
// Refresh-on-focus is unchanged and remains the correctness backstop: even if
// the socket drops entirely, opening the screen still shows current data.

import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

const DEBOUNCE_MS = 1500;
const MAX_JITTER_MS = 2500;

/**
 * Call `onChanged` (debounced + jittered) whenever any astrologer row changes.
 *
 * @param {Function} onChanged usually the screen's existing fetch function
 * @param {boolean}  enabled   pass false to suspend (e.g. screen not focused)
 */
export default function useAstrologerListSync(onChanged, enabled = true) {
  // Held in a ref so a new inline function on each render does not tear the
  // socket listener down and rebuild it every time the list re-renders.
  const handlerRef = useRef(onChanged);
  handlerRef.current = onChanged;

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = acquireSharedSocket();
    let timer = null;

    const onSignal = () => {
      if (timer) clearTimeout(timer);
      const delay = DEBOUNCE_MS + Math.random() * MAX_JITTER_MS;
      timer = setTimeout(() => {
        timer = null;
        try {
          handlerRef.current?.();
        } catch (err) {
          // A refetch failure must never take the screen down — focus refresh
          // will pick up the current data on the next visit regardless.
          console.log('[astrologerSync] refetch failed:', err?.message);
        }
      }, delay);
    };

    socket.on('astrologers_changed', onSignal);

    return () => {
      if (timer) clearTimeout(timer);
      socket.off('astrologers_changed', onSignal);
      releaseSharedSocket();
    };
  }, [enabled]);
}
