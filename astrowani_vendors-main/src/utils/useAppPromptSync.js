// astrowani_vendors-main/src/utils/useAppPromptSync.js
//
// Listens for the admin-triggered store-prompt events from astrowani-backend's
// src/appPromptRoutes.js ('show_update_popup' / 'show_review_popup', emitted to
// io.to(recipientId)). Same shared-socket + join_room pattern as
// useReferralPopupSync.js — see useNotificationBadgeSync.js for the full rationale.
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';
import { showAppUpdatePrompt } from '../components/AppUpdatePrompt';
import { showRateAppPrompt } from '../components/RateAppPrompt';

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
    // force: an admin asking explicitly skips the "used it enough yet" gates — but
    // not the "already rated" rule, which is honoured in every path.
    const onReview = ({ title, body } = {}) => {
      showRateAppPrompt({ title, message: body }, { force: true, trigger: 'admin' });
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.emit('join_room', astroId);
      socket.on('show_update_popup', onUpdate);
      socket.on('show_review_popup', onReview);
    })();

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.off('show_update_popup', onUpdate);
        socketInstance.off('show_review_popup', onReview);
        releaseSharedSocket();
      }
    };
  }, [astroId]);
}
