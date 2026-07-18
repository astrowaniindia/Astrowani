// src/hooks/useChatRequest.js
// Shared hook — use this in ANY screen that has a "Chat" button
// Handles the full request flow: create request → show popup → listen for response → navigate

import { useState, useRef, useContext } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { ensureProfileComplete } from '../utils/profileGate';
import { LanguageContext } from '../context/LanguageContext';

const useChatRequest = (navigation) => {
  const { t } = useContext(LanguageContext);
  const [requesting, setRequesting] = useState(false);
  const [requestAstro, setRequestAstro] = useState(null);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const channelRef = useRef(null);
  const astroRef = useRef(null);
  const timeoutRef = useRef(null);
  const requestIdRef = useRef(null);

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

      // Non-blocking wallet check
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const resp = await fetch(`${Instance.defaults.baseURL}/api/wallet`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const json = await resp.json();
            const balance = json?.data?.balance ?? 0;
            const charge = item.chat_charge_per_minute ?? item.chatChargePerMinute ?? 0;
            if (charge > 0 && balance < charge) {
              Alert.alert(
                t('chat.lowBalance'),
                t('chat.lowBalanceMsg', { charge }),
              );
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Wallet check skipped:', e.message);
      }

      // Get the real Supabase customer UUID for billing
      let supabaseCustomerId = null;
      try {
        const mobile = user.phoneNumber || user.mobile;
        const email = user.email;
        let q = supabase.from('customers').select('id');
        if (mobile) q = q.eq('mobile', mobile);
        else if (email) q = q.eq('email', email);
        const { data: custRows } = await q.limit(1);
        if (custRows && custRows.length > 0) {
          supabaseCustomerId = custRows[0].id;
        }
      } catch (e) {
        console.warn('Could not fetch supabase customer id:', e.message);
      }

      // Insert chat request
      const { data, error } = await supabase
        .from('chat_requests')
        .insert([
          {
            caller_id: supabaseCustomerId || callerId,
            receiver_id: receiverId,
            status: 'pending',
            request_type: 'chat',
            caller_name: user.name || user.firstName || 'Customer',
          },
        ])
        .select();

      if (error) {
        console.log('Supabase error:', JSON.stringify(error));
        throw error;
      }

      const requestId = data?.[0]?.id;
      if (!requestId) throw new Error('No request ID returned');

      // Push fallback for a backgrounded/killed vendor app — this insert alone only reaches
      // the vendor via Supabase Realtime, which needs their app process alive. Fire-and-forget,
      // same non-blocking style as the wallet check above.
      fetch(`${Instance.defaults.baseURL}/api/push/notify-chat-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: receiverId,
          callerId: supabaseCustomerId || callerId,
          callerName: user.name || user.firstName || 'Customer',
        }),
      }).catch((e) => console.warn('notify-chat-request skipped:', e.message));

      astroRef.current = item;
      requestIdRef.current = requestId;
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
