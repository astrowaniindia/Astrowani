// astrowani_customer-main/src/hooks/useLiveListSync.js
//
// Same fix as useAstrologerListSync.js, applied to the `live_sessions` table
// (2026-08-13 perf audit, finding G2). Replaces Live.js's independent
// unfiltered `supabase.channel(...).on('postgres_changes', {event:'*',
// table:'live_sessions'})` subscription with one shared listen on the
// backend's `live_sessions_changed` socket fanout (src/tableFanout.js).
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

const DEBOUNCE_MS = 1500;
const MAX_JITTER_MS = 2500;

/**
 * Call `onChanged` (debounced + jittered) whenever any live_sessions row changes.
 *
 * @param {Function} onChanged usually the screen's existing fetch function
 * @param {boolean}  enabled   pass false to suspend (e.g. screen not focused)
 */
export default function useLiveListSync(onChanged, enabled = true) {
  const handlerRef = useRef(onChanged);
  handlerRef.current = onChanged;

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let socketInstance = null;
    let timer = null;

    const onSignal = () => {
      if (timer) clearTimeout(timer);
      const delay = DEBOUNCE_MS + Math.random() * MAX_JITTER_MS;
      timer = setTimeout(() => {
        timer = null;
        try {
          handlerRef.current?.();
        } catch (err) {
          console.log('[liveListSync] refetch failed:', err?.message);
        }
      }, delay);
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.on('live_sessions_changed', onSignal);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (socketInstance) {
        socketInstance.off('live_sessions_changed', onSignal);
        releaseSharedSocket();
      }
    };
  }, [enabled]);
}
