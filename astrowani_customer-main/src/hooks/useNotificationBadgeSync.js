// astrowani_customer-main/src/hooks/useNotificationBadgeSync.js
//
// WHAT THIS REPLACED
// CustomHeader.js and NotificationScreen.js each opened their own direct Supabase
// Realtime subscription on `notifications` filtered to the current customer —
// re-created on every focus, torn down on blur/unmount. Individually filtered
// (no PII leak), but still one Supabase Realtime connection per screen per user,
// on top of every other screen doing the same for its own concern — the same
// "users x screens" connection-count problem astrologerFanout.js already fixed
// for the astrologer list (see that file's header comment: Supabase's free tier
// caps concurrent Realtime connections at 200).
//
// The header notification badge specifically is WORSE than most: it's mounted on
// nearly every screen in the app, so this was effectively an always-on Realtime
// connection for every single logged-in customer, not just one screen's worth.
//
// WHY A SOCKET RELAY NEEDS NO BACKEND REALTIME SUBSCRIPTION AT ALL HERE
// Unlike the astrologers table (written by many places — vendor toggles, admin
// edits, earnings resets), `notifications` has exactly ONE writer:
// astrowani-backend/src/notificationRoutes.js's admin send route. That route
// already emits `io.to(recipientId).emit('new_notification', ...)` synchronously
// right after the insert (see its own comments) — so there's no need for the
// backend to hold its own Supabase Realtime subscription on this table the way
// astrologerFanout.js does; the write path already knows the moment it happens.
// This hook just listens for that pre-existing event on the shared socket.
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';

export default function useNotificationBadgeSync(userId, onNewNotification) {
  const handlerRef = useRef(onNewNotification);
  handlerRef.current = onNewNotification;

  useEffect(() => {
    if (!userId) return undefined;

    const socket = acquireSharedSocket();
    // `new_notification` is emitted to io.to(recipientId) — must be in that room to receive it.
    socket.emit('join_room', userId);

    const onSignal = () => {
      try {
        handlerRef.current?.();
      } catch (err) {
        console.log('[notificationBadgeSync] refetch failed:', err?.message);
      }
    };

    socket.on('new_notification', onSignal);

    return () => {
      socket.off('new_notification', onSignal);
      releaseSharedSocket();
    };
  }, [userId]);
}
