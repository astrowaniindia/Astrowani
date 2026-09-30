// src/hooks/useChatRequest.js
// Shared hook — use this in ANY screen that has a "Chat" button
// Handles the full request flow: create request → show popup → listen for response → navigate

import { useState, useRef, useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import { markRequestStatus } from '../api/RequestsApi';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { showInsufficientBalanceAlert } from '../utils/insufficientBalanceAlert';
import { ensureProfileComplete } from '../utils/profileGate';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { REQUEST_RING_TIMEOUT_MS } from '../utils/requestTimeouts';
import { awaitRequestOutcome } from '../utils/awaitRequestOutcome';
import { SOCKET_URL } from '../config/api';
import io from 'socket.io-client';

const useChatRequest = (navigation) => {
  const { t } = useContext(LanguageContext);
  const [requesting, setRequesting] = useState(false);
  // Between the tap and the waiting popup there are several network round trips
  // (profile gate, availability, wallet balance, request creation) — 2-3 seconds
  // with NO feedback, so the button reads as dead and gets tapped repeatedly,
  // firing a whole extra chat request each time. `submitting` drives an instant
  // pressed state; the ref is what actually blocks re-entry, because a state
  // update is async and would not land before the second tap.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [requestAstro, setRequestAstro] = useState(null);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const channelRef = useRef(null);
  const astroRef = useRef(null);
  const timeoutRef = useRef(null);
  const requestIdRef = useRef(null);
  const callerIdRef = useRef(null);
  // Chat acceptance used to have exactly ONE delivery path — a single Supabase Realtime
  // UPDATE — and no recovery if it was missed, which is how the astrologer ended up alone
  // in the chat room while the customer stared at "Request sent". There are now three, all
  // funnelling into the same `resolveAccepted`/`resolveClosed` below so whichever arrives
  // first wins and the others are no-ops.
  const pollerRef = useRef(null);
  const socketRef = useRef(null);
  const resolvedRef = useRef(false);

  // Tell the vendor's app to dismiss its heads-up "New Chat Request" notification — it
  // otherwise sits there (with working Accept/Reject) long after we've stopped waiting.
  // Fire-and-forget, same non-blocking style as the wallet check in sendChatRequest.
  const notifyVendorRequestCancelled = () => {
    const astro = astroRef.current;
    const vendorId = astro?._id || astro?.id || astro?.userId;
    if (!vendorId) return;
    AsyncStorage.getItem('token').then((token) => {
      fetch(`${Instance.defaults.baseURL}/api/push/notify-chat-cancelled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ vendorId }),
      }).catch((e) => console.warn('notify-chat-cancelled skipped:', e.message));
    });
  };

  const sendChatRequest = async (item) => {
    if (submittingRef.current || requesting) return; // already in flight or waiting for response — ignore extra taps
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Profile gate — locked until the customer completes their profile.
      if (!(await ensureProfileComplete(navigation, 'chat'))) return;

      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      if (!user) {
        Alert.alert(t('common.error'), t('chat.pleaseLogIn'));
        return;
      }

      const callerId = user._id || user.id || user.userId;
      if (!callerId) {
        Alert.alert(t('common.error'), t('chat.sessionInvalid'));
        return;
      }

      const receiverId = item._id || item.id || item.userId;
      if (!receiverId) {
        Alert.alert(t('common.error'), t('chat.astrologerInfoMissing'));
        return;
      }

      // Availability pre-check — an astrologer already in a session or with another
      // unanswered pending request must not receive a second one. Fails open (lets the
      // request through) on a network error so a transient blip never blocks a legit chat.
      try {
        const availResp = await fetch(`${Instance.defaults.baseURL}/api/chat/check-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ astrologerId: receiverId }),
        });
        if (availResp.status === 409) {
          const availJson = await availResp.json().catch(() => null);
          showStatusPopup({
            variant: 'busy',
            title: availJson?.selfBusy ? t('status.youAreBusyTitle') : t('status.astrologerBusyTitle'),
            message: availJson?.selfBusy
              ? (availJson.message || t('alerts.selfBusy'))
              : t('alerts.astrologerBusy'),
          });
          return;
        }
      } catch (e) {
        console.warn('Availability check skipped:', e.message);
      }

      // Get the real Supabase customer UUID for billing — via the backend, not a
      // direct read of `customers` (that table carries every user's PII and Postgres
      // GRANT is not row-scoped; see DATABASE_HARDENING_HANDOFF.md §3.1/§3.2).
      let supabaseCustomerId = null;
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await fetch(`${Instance.defaults.baseURL}/api/users/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            supabaseCustomerId = json?.data?.id || null;
          }
        }
      } catch (e) {
        console.warn('Could not fetch supabase customer id:', e.message);
      }

      // Non-blocking wallet check.
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const resp = await fetch(`${Instance.defaults.baseURL}/api/wallet`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const json = await resp.json();
            const balance = json?.data?.balance ?? 0;
            // The real field on a formatted astrologer object (see formatAstrologer in
            // index.js) is `chatPrice` — chat_charge_per_minute/chatChargePerMinute don't
            // exist on it, so this always evaluated to 0 and silently skipped the check
            // below regardless of actual balance. This was the bug: chat let a ₹0-balance
            // customer through while Call/Video (which read the right field) blocked them.
            const charge = item.chatPrice ?? item.chat_charge_per_minute ?? item.chatChargePerMinute ?? 0;
            if (charge > 0 && balance < charge) {
              // Same themed popup (Recharge / Refer & Earn ₹50 / Cancel) as the
              // call and video entry points — was previously a plain OK-only Alert.
              showInsufficientBalanceAlert({ navigation, minRequired: charge, balance, t, intent: 'chat' });
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Wallet check skipped:', e.message);
      }

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3. The endpoint re-resolves the caller's
      // real customer UUID from the JWT itself rather than trusting supabaseCustomerId.
      const token = await AsyncStorage.getItem('token');
      const initRes = await fetch(`${Instance.defaults.baseURL}/api/chat/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ astrologerId: receiverId }),
      });
      const initJson = await initRes.json();
      if (initRes.status === 409) {
        showStatusPopup({
          variant: 'busy',
          title: initJson?.selfBusy ? t('status.youAreBusyTitle') : t('status.astrologerBusyTitle'),
          message: initJson?.selfBusy
            ? (initJson.message || t('alerts.selfBusy'))
            : t('alerts.astrologerBusy'),
        });
        return;
      }
      if (!initRes.ok || !initJson?.requestId) {
        throw new Error(initJson?.message || 'No request ID returned');
      }
      const requestId = initJson.requestId;
      if (initJson.callerId) supabaseCustomerId = initJson.callerId;
      captureEvent('chat_initiated', { astrologer_id: receiverId });

      // Push fallback for a backgrounded/killed vendor app — this insert alone only reaches
      // the vendor via Supabase Realtime, which needs their app process alive. Fire-and-forget,
      // same non-blocking style as the wallet check above.
      fetch(`${Instance.defaults.baseURL}/api/push/notify-chat-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ vendorId: receiverId }),
      }).catch((e) => console.warn('notify-chat-request skipped:', e.message));

      astroRef.current = item;
      requestIdRef.current = requestId;
      callerIdRef.current = supabaseCustomerId || callerId;
      setRequestAstro(item);
      setPendingRequestId(requestId);
      setRequesting(true);

      // ── Listen for the astrologer's response, three independent ways ──────────
      // Every one of them ends here, and `resolvedRef` makes the first one to arrive the
      // only one that acts.
      resolvedRef.current = false;

      const teardownListeners = () => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
        if (pollerRef.current) { pollerRef.current.stop(); pollerRef.current = null; }
        if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_) {} socketRef.current = null; }
      };

      const resolveAccepted = (sessionId) => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        teardownListeners();
        setRequesting(false);
        setPendingRequestId(null);
        navigation.navigate('ChatSessionScreen', {
          requestId,
          person: astroRef.current,
          // Passed through when we have it so the chat screen can join the session room
          // straight away instead of polling chat_sessions for it.
          sessionId: sessionId || undefined,
        });
      };

      const resolveClosed = (status) => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        teardownListeners();
        setRequesting(false);
        setPendingRequestId(null);
        if (status === 'missed') {
          showStatusPopup({ variant: 'missed', title: t('status.notAnsweredTitle'), message: t('chat.notPickedUp') });
        } else if (status === 'rejected') {
          showStatusPopup({
            variant: 'busy',
            title: t('status.astrologerBusyTitle'),
            message: t('alerts.astrologerBusy'),
          });
        }
        // 'cancelled' is us — say nothing.
      };

      // 1. Supabase Realtime (the original path).
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase.channel(`req_status_${requestId}`);
      channelRef.current
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_requests',
            filter: `id=eq.${requestId}`,
          },
          (payload) => {
            const updated = payload.new;
            if (updated.status === 'accepted') resolveAccepted(null);
            else if (updated.status && updated.status !== 'pending') resolveClosed(updated.status);
          }
        )
        .subscribe();

      // 2. Socket — new in 2026-09-30. Chat had no socket path at all; the backend's
      //    /api/session/accept now emits `chat_accepted` to the customer's own room itself,
      //    so this works no matter which button the astrologer pressed (in-app card,
      //    notification action, or the draw-over-other-apps overlay).
      try {
        const sock = io(SOCKET_URL, { auth: { token } });
        socketRef.current = sock;
        const joinOwnRoom = () => { if (callerIdRef.current) sock.emit('join_room', callerIdRef.current); };
        sock.on('connect', joinOwnRoom);
        joinOwnRoom();
        sock.on('chat_accepted', (d) => resolveAccepted(d?.sessionId || null));
        sock.on('chat_rejected', () => resolveClosed('rejected'));
        sock.on('connect_error', (e) => console.log('[chat request] socket error:', e.message));
      } catch (e) {
        console.log('[chat request] socket setup skipped:', e.message);
      }

      // 3. Polling — the backstop that cannot miss an edge. See awaitRequestOutcome.js.
      pollerRef.current = awaitRequestOutcome({
        kind: 'chat',
        requestId,
        label: 'chat request',
        onAccepted: resolveAccepted,
        onClosed: resolveClosed,
      });

      // Auto-mark MISSED after the ring timeout if the astrologer doesn't answer.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        timeoutRef.current = null;
        if (resolvedRef.current) return;
        // Ask the server ONE more time before writing this off. The astrologer may have
        // accepted in the last couple of seconds, and marking an accepted request 'missed'
        // would strand them in a session the customer has just abandoned.
        try {
          const finalCheck = await Instance.get(`/api/requests/chat/${requestIdRef.current}/status`, {
            headers: { Authorization: `Bearer ${await AsyncStorage.getItem('token')}` },
          });
          if (finalCheck?.data?.status === 'accepted') { resolveAccepted(finalCheck.data.sessionId || null); return; }
        } catch (_) {}
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        try {
          await markRequestStatus('chat', requestIdRef.current, 'missed');
        } catch (_) {}
        notifyVendorRequestCancelled();
        teardownListeners();
        setRequesting(false);
        setPendingRequestId(null);
        showStatusPopup({ variant: 'missed', title: t('status.notAnsweredTitle'), message: t('chat.notPickedUp') });
      }, REQUEST_RING_TIMEOUT_MS);
    } catch (err) {
      console.log('sendChatRequest error:', err?.message || JSON.stringify(err));
      Alert.alert(t('common.error'), t('chat.couldNotSendRequest', { msg: err?.message || 'Please try again.' }));
    } finally {
      // Always clears, on every path including the early returns above. By now the
      // waiting popup is either up (and covers the button) or the attempt failed and
      // the button must be usable again — a guard that stuck would be worse than the
      // bug it fixes.
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const cancelRequest = async () => {
    resolvedRef.current = true; // stop every listener from acting on a late acceptance
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (pollerRef.current) { pollerRef.current.stop(); pollerRef.current = null; }
    if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_) {} socketRef.current = null; }

    // Cancelling is a RACE against the astrologer accepting, and the server decides it:
    // /api/requests/chat/:id/status only moves a row that is still 'pending', so `changed`
    // is false when the accept got there first. This used to be ignored — we walked away
    // regardless — which left the astrologer alone in a real, live, metered session while
    // the customer was back on the profile screen. Observed 2026-09-30.
    //
    // Losing the race is not an error: it means the consultation the customer asked for is
    // ready. Join it rather than abandoning it. (The backend's atomic claim guarantees the
    // two outcomes are mutually exclusive, so this can never double-fire with a cancel.)
    if (pendingRequestId) {
      const cancelled = await markRequestStatus('chat', pendingRequestId, 'cancelled');
      if (!cancelled) {
        let sessionId = null;
        try {
          const token = await AsyncStorage.getItem('token');
          const res = await Instance.get(`/api/requests/chat/${pendingRequestId}/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res?.data?.status === 'accepted') sessionId = res.data.sessionId || null;
        } catch (_) {
          // Can't tell. Fall through to the normal cancel teardown below — the astrologer's
          // side is covered either way by the presence guard, which ends a session nobody
          // joins. Stranding the customer in a chat we are not sure exists is worse.
        }
        if (sessionId) {
          const astro = astroRef.current;
          const requestId = pendingRequestId;
          setRequesting(false);
          setPendingRequestId(null);
          setRequestAstro(null);
          if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
          navigation.navigate('ChatSessionScreen', { requestId, person: astro, sessionId });
          return;
        }
      }
    }

    notifyVendorRequestCancelled();
    setRequesting(false);
    setPendingRequestId(null);
    setRequestAstro(null);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  // Leaving the screen while a request is in flight must not leave a 2s poll loop and a
  // socket running for the rest of the session.
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pollerRef.current) pollerRef.current.stop();
    if (socketRef.current) { try { socketRef.current.disconnect(); } catch (_) {} }
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }, []);

  return { requesting, requestAstro, sendChatRequest, cancelRequest, submitting };
};

export default useChatRequest;
