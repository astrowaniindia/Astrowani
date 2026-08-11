// astrowani_vendors-main/src/utils/useReferralPopupSync.js
//
// Listens for the admin-triggered 'show_referral_popup' event (astrowani-backend's
// src/referralPopupRoutes.js, emitted to io.to(recipientId)) and shows it via
// ReferralPopupHost. Same shared-socket + join_room pattern as
// useNotificationBadgeSync.js — see that file for the full rationale.
import { useEffect, useRef } from 'react';
import { acquireSharedSocket, releaseSharedSocket } from './useSharedSocket';
import { showReferralPopup } from '../components/ReferralPopupHost';

export default function useReferralPopupSync(astroId) {
  const astroIdRef = useRef(astroId);
  astroIdRef.current = astroId;

  useEffect(() => {
    if (!astroId) return undefined;
    let cancelled = false;
    let socketInstance = null;

    const onSignal = ({ title, body } = {}) => {
      showReferralPopup(title, body);
    };

    (async () => {
      const socket = await acquireSharedSocket();
      if (cancelled) { releaseSharedSocket(); return; }
      socketInstance = socket;
      socket.emit('join_room', astroId);
      socket.on('show_referral_popup', onSignal);
    })();

    return () => {
      cancelled = true;
      if (socketInstance) {
        socketInstance.off('show_referral_popup', onSignal);
        releaseSharedSocket();
      }
    };
  }, [astroId]);
}
