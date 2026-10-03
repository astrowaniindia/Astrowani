// astrowani_vendors-main/src/utils/useAppPromptSync.js
//
// Listens for the admin-triggered store-prompt events from astrowani-backend's
// src/appPromptRoutes.js ('show_update_popup' / 'show_review_popup', emitted to
// io.to(recipientId)). Same shared-socket + join_room pattern as
// useReferralPopupSync.js — see useNotificationBadgeSync.js for the full rationale.
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';
import { showAppUpdatePrompt } from '../components/AppUpdatePrompt';

export default function useAppPromptSync(astroId) {
  const astroIdRef = useRef(astroId);
  astroIdRef.current = astroId;

  useEffect(() => {
    if (!astroId) return undefined;
    let cancelled = false;
    let socketInstance = null;

    // The update host re-runs its own server check before showing anything, so a
    // broadcast sent to every astrologer cannot raise "please update" on a device
    // that is already on the newest build.
    const onUpdate = ({ title, body } = {}) => {
      showAppUpdatePrompt({ title, message: body });
    };
    // 'show_review_popup' (astrowani-backend's src/appPromptRoutes.js, the admin's
    // "push a rating prompt" button) is deliberately NOT listened for here —
    // owner decision 2026-10-03: no rating popup in the vendor app at all. Not
    // subscribing is clearer than subscribing to a handler that calls a no-op
    // (RateAppPromptHost is unmounted in NavigationScreen.js, which is what
    // actually disables it — this is just not pretending to listen for nothing).

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.emit('join_room', astroId);
      socket.on('show_update_popup', onUpdate);
    })();

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.off('show_update_popup', onUpdate);
        releaseSharedSocket();
      }
    };
  }, [astroId]);
}
