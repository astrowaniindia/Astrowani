// astrowani_customer-main/src/hooks/useBlogListSync.js
//
// Same fix as useAstrologerListSync.js, applied to the `blogs` table
// (2026-08-13 perf audit, finding G2). Replaces BlogList.js's and Home.js's
// independent unfiltered `supabase.channel(...).on('postgres_changes',
// {event:'*', table:'blogs'})` subscriptions — each refetching the whole
// list, with BlogList's handler also resetting pagination back to page 1 on
// every remote write — with one shared listen on the backend's `blogs_changed`
// socket fanout (src/tableFanout.js).
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

const DEBOUNCE_MS = 1500;
const MAX_JITTER_MS = 2500;

/**
 * Call `onChanged` (debounced + jittered) whenever any blog row changes.
 *
 * @param {Function} onChanged usually the screen's existing fetch function
 * @param {boolean}  enabled   pass false to suspend (e.g. screen not focused)
 */
export default function useBlogListSync(onChanged, enabled = true) {
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
          console.log('[blogListSync] refetch failed:', err?.message);
        }
      }, delay);
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.on('blogs_changed', onSignal);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (socketInstance) {
        socketInstance.off('blogs_changed', onSignal);
        releaseSharedSocket();
      }
    };
  }, [enabled]);
}
