// src/hooks/useChatRequest.js
// Shared hook — use this in ANY screen that has a "Chat" button
// Handles the full request flow: create request → show popup → listen for response → navigate

import { useState, useRef, useContext } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { showInsufficientBalanceAlert } from '../utils/insufficientBalanceAlert';
import { ensureProfileComplete } from '../utils/profileGate';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';

const useChatRequest = (navigation) => {
  const { t } = useContext(LanguageContext);
  const [requesting, setRequesting] = useState(false);
  const [requestAstro, setRequestAstro] = useState(null);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const channelRef = useRef(null);
  const astroRef = useRef(null);
  const timeoutRef = useRef(null);
  const requestIdRef = useRef(null);
  const callerIdRef = useRef(null);

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
    try {
      // Profile gate — locked until the customer completes their profile.
      if (!(await ensureProfileComplete(navigation))) return;

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

      // Listen for vendor response
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
            if (updated.status === 'accepted') {
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
              setRequesting(false);
              setPendingRequestId(null);
              if (channelRef.current) supabase.removeChannel(channelRef.current);
              navigation.navigate('ChatSessionScreen', {
                requestId,
                person: astroRef.current,
              });
            } else if (updated.status === 'rejected') {
              if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
              setRequesting(false);
              setPendingRequestId(null);
              if (channelRef.current) supabase.removeChannel(channelRef.current);
              showStatusPopup({
                variant: 'busy',
                title: t('status.astrologerBusyTitle'),
                message: t('alerts.astrologerBusy'),
              });
            }
          }
        )
        .subscribe();

      // Auto-mark MISSED after 1 minute if the astrologer doesn't answer.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        timeoutRef.current = null;
        try {
          await supabase.from('chat_requests').update({ status: 'missed' }).eq('id', requestIdRef.current);
        } catch (_) {}
        notifyVendorRequestCancelled();
        setRequesting(false);
        setPendingRequestId(null);
        if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
        showStatusPopup({ variant: 'missed', title: t('status.notAnsweredTitle'), message: t('chat.notPickedUp') });
      }, 60000);
    } catch (err) {
      console.log('sendChatRequest error:', err?.message || JSON.stringify(err));
      Alert.alert(t('common.error'), t('chat.couldNotSendRequest', { msg: err?.message || 'Please try again.' }));
    }
  };

  const cancelRequest = async () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (pendingRequestId) {
      await supabase
        .from('chat_requests')
        .update({ status: 'cancelled' })
        .eq('id', pendingRequestId);
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

  return { requesting, requestAstro, sendChatRequest, cancelRequest };
};

export default useChatRequest;
