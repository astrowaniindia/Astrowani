import { api, ApiError } from './api.js?v=48';
import { RING_TIMEOUT_MS, REQUEST_POLL_MS } from './config.js?v=48';
import { getSocket, joinPersonalRoom } from './socket.js?v=48';

/**
 * Ask an astrologer for a consultation and wait for them to pick up.
 *
 * Shared by the chat screen and the call screen, because the waiting part is
 * identical and the lesson behind it is the expensive one:
 *
 * ACCEPTANCE MUST NEVER DEPEND ON A SINGLE MESSAGE ARRIVING. The apps shipped
 * with exactly that and it broke in production — an astrologer accepting from a
 * notification emitted no socket event at all, and a customer whose socket was
 * mid-reconnect never learned they had been picked up, so the call rang out
 * while the astrologer sat waiting in the room (CLAUDE.md DF). There are two
 * independent paths here and whichever lands first wins:
 *
 *   1. socket  — `call_accepted` / `chat_accepted` on the personal room
 *   2. polling — GET /api/requests/:kind/:id/status every 2s, and immediately
 *                whenever the tab becomes visible again
 *
 * Resolves { sessionId, requestId } on acceptance, or throws a RequestClosed
 * carrying a reason the screen can show.
 */

export class RequestClosed extends Error {
  constructor(message, { reason } = {}) {
    super(message);
    this.name = 'RequestClosed';
    this.reason = reason;
  }
}

export function requestConsultation({ kind, astrologer, callType, onStatus = () => {} }) {
  return new Promise((resolve, reject) => {
    let requestId = null;
    let sessionId = null;
    let settled = false;
    let socket = null;
    let pollTimer = null;
    let ringTimer = null;

    /**
     * The tab is going away while we are still ringing. Tell the astrologer
     * over the socket (authenticated, and it flushes before the socket closes)
     * so their incoming-call popup dismisses and they stop showing busy.
     */
    function onPageHide() {
      if (settled || !requestId) return;
      try {
        socket?.emit('cancel_call', { astrologer_id: astrologer.id, requestId, roomId: sessionId });
      } catch (_) {}
      try {
        api.post(`/api/requests/${kind}/${requestId}/status`, { status: 'cancelled' });
      } catch (_) {}
    }

    function cleanup() {
      clearInterval(pollTimer);
      clearTimeout(ringTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      if (socket) {
        socket.off('call_accepted', onAccepted);
        socket.off('chat_accepted', onAccepted);
        socket.off('call_rejected', onRejected);
        socket.off('chat_rejected', onRejected);
      }
    }

    function accept(nextSessionId) {
      if (settled || !nextSessionId) return;
      settled = true;
      cleanup();
      resolve({ sessionId: nextSessionId, requestId });
    }

    function close(message, reason) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new RequestClosed(message, { reason }));
    }

    function onAccepted(data) {
      // The personal room carries every request this customer has ever made,
      // including stale ones — ignore anything that is not this request.
      if (data?.requestId && requestId && String(data.requestId) !== String(requestId)) return;
      accept(data?.sessionId || sessionId);
    }

    function onRejected(data) {
      if (data?.requestId && requestId && String(data.requestId) !== String(requestId)) return;
      close(`${astrologer.name} could not take your request right now.`, 'rejected');
    }

    async function pollOnce() {
      if (settled || !requestId) return;
      try {
        const res = await api.get(`/api/requests/${kind}/${requestId}/status`);
        if (res?.status === 'accepted') accept(res.sessionId);
        else if (res?.status === 'rejected') close(`${astrologer.name} could not take your request right now.`, 'rejected');
        else if (res?.status === 'cancelled' || res?.status === 'missed') close('That request is no longer active.', 'closed');
      } catch (_) {
        // A failed poll is nothing: the socket may still deliver and the next
        // tick retries. Never tear down a live request over one bad read.
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') pollOnce();
    }

    /** Cancel from the screen's Cancel button, or on timeout. */
    async function cancel(message) {
      if (settled) return;
      settled = true;
      cleanup();
      if (requestId) {
        // Both paths, same as the apps: the HTTP write is what the vendor's
        // Realtime listener sees, the socket emit is the fast path that
        // dismisses their incoming-call popup immediately.
        try { await api.post(`/api/requests/${kind}/${requestId}/status`, { status: 'cancelled' }); } catch (_) {}
        try { socket?.emit('cancel_call', { astrologer_id: astrologer.id, requestId, roomId: sessionId }); } catch (_) {}
      }
      reject(new RequestClosed(message || 'Request cancelled.', { reason: 'cancelled' }));
    }

    (async () => {
      // Wire the socket BEFORE initiating, so an astrologer who accepts within a
      // second of the request cannot beat our listener into place.
      try {
        socket = await getSocket();
        joinPersonalRoom();
        socket.on('call_accepted', onAccepted);
        socket.on('chat_accepted', onAccepted);
        socket.on('call_rejected', onRejected);
        socket.on('chat_rejected', onRejected);
      } catch (_) {
        // No socket: polling alone still completes the flow, just a little slower.
      }

      try {
        if (kind === 'chat') {
          const res = await api.post('/api/chat/initiate', { astrologerId: astrologer.id });
          requestId = res?.requestId;
        } else {
          const res = await api.post('/api/call/initiate', { receiverId: astrologer.id, callType });
          requestId = res?.data?.requestId;
          sessionId = res?.data?.sessionId || null;
        }
      } catch (err) {
        const b = err instanceof ApiError ? err.body : null;
        if (b?.busy && b?.selfBusy) close('You already have a call or chat in progress. Finish that one first.', 'self_busy');
        else if (b?.busy) close(`${astrologer.name} just became busy. Please try again shortly.`, 'busy');
        else if (b?.blocked) close('This astrologer is not accepting consultations from you at the moment.', 'blocked');
        else close(err instanceof ApiError ? err.message : 'Could not start the consultation.', 'error');
        return;
      }

      if (!requestId) {
        close('Could not start the consultation. Please try again.', 'error');
        return;
      }

      onStatus(`Ringing ${astrologer.name}…`, { requestId, cancel });
      pollTimer = setInterval(pollOnce, REQUEST_POLL_MS);
      document.addEventListener('visibilitychange', onVisible);

      // CLOSING THE TAB WHILE IT IS RINGING MUST CANCEL THE REQUEST.
      // The 45s auto-cancel below lives in this page's timer, so a closed or
      // navigated-away tab takes it with it — and the request stays `pending`,
      // which `checkAstrologerBusy` reads as "in a consultation". The
      // astrologer then shows busy to EVERY other customer until something else
      // clears it. Seen for real during testing.
      //
      // sendBeacon survives unload where fetch does not. It carries no auth
      // header, so it goes to the socket instead — already authenticated — and
      // the HTTP cancel is attempted too for the normal navigation case.
      window.addEventListener('pagehide', onPageHide);

      // Matches the apps' 45s window, so the astrologer sees the same ring time
      // whichever platform the customer called from.
      ringTimer = setTimeout(() => {
        cancel(`${astrologer.name} did not pick up. You have not been charged.`);
      }, RING_TIMEOUT_MS);
    })();
  });
}
