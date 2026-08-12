// astrowani_customer-main/src/hooks/useRemedyListSync.js
//
// Same fix as useAstrologerListSync.js, applied to the `remedy_items` table
// (2026-08-13 perf audit, finding G2). Replaces RemedyShop.js's independent
// unfiltered `supabase.channel(...).on('postgres_changes', {event:'*',
// table:'remedy_items'})` subscription — opened once per remedy type, so a
// customer browsing all three types (puja/gemstone/specific_puja) previously
// accumulated three identical subscriptions to the same table — with one
// shared listen on the backend's `remedy_items_changed` socket fanout
// (src/tableFanout.js).
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

const DEBOUNCE_MS = 1500;
const MAX_JITTER_MS = 2500;

/**
 * Call `onChanged` (debounced + jittered) whenever any remedy_items row changes.
 *
 * @param {Function} onChanged usually the screen's existing fetch function
 * @param {boolean}  enabled   pass false to suspend (e.g. screen not focused)
 */
export default function useRemedyListSync(onChanged, enabled = true) {
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
          console.log('[remedyListSync] refetch failed:', err?.message);
        }
      }, delay);
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.on('remedy_items_changed', onSignal);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (socketInstance) {
        socketInstance.off('remedy_items_changed', onSignal);
        releaseSharedSocket();
      }
    };
  }, [enabled]);
}
