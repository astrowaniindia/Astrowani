// astrowani_vendors-main/src/utils/useNotificationBadgeSync.js
//
// See astrowani_customer-main/src/hooks/useNotificationBadgeSync.js for the full
// rationale — same fix, mirrored for the vendor app. CustomHeader.js and
// Notification.js each opened their own direct Supabase Realtime subscription on
// `notifications` filtered to the current astrologer, re-created on every focus.
// The header specifically is mounted on nearly every screen, so that was an
// always-on Realtime connection per logged-in vendor — one of the connection-count
// contributors identified in the 2026-08-08 concurrency audit
// (MD files/security-audit-2026-08-08.md), same family as the astrologer-list
// fan-out problem astrologerFanout.js already fixed on the backend.
//
// `notifications` has exactly one writer — astrowani-backend/src/notificationRoutes.js's
// admin send route — which already emits `io.to(recipientId).emit('new_notification', ...)`
// synchronously right after the insert. No backend Realtime subscription is needed at
// all for this table; this hook just listens for that pre-existing event.
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

export default function useNotificationBadgeSync(astroId, onNewNotification) {
  const handlerRef = useRef(onNewNotification);
  handlerRef.current = onNewNotification;

  useEffect(() => {
    if (!astroId) return undefined;
    let cancelled = false;
    let socketInstance = null;

    const onSignal = () => {
      try {
        handlerRef.current?.();
      } catch (err) {
        console.log('[notificationBadgeSync] refetch failed:', err?.message);
      }
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      // `new_notification` is emitted to io.to(recipientId) — must be in that room to receive it.
      socket.emit('join_room', astroId);
      socket.on('new_notification', onSignal);
    })();

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.off('new_notification', onSignal);
        releaseSharedSocket();
      }
    };
  }, [astroId]);
}
