// src/hooks/useChatRequest.js
// Shared hook — use this in ANY screen that has a "Chat" button
// Handles the full request flow: create request → show popup → listen for response → navigate

import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import Instance from '../api/ApiCall';

const useChatRequest = (navigation) => {
  const [requesting, setRequesting] = useState(false);
  const [requestAstro, setRequestAstro] = useState(null);
  const [pendingRequestId, setPendingRequestId] = useState(null);
  const channelRef = useRef(null);
  const astroRef = useRef(null);

  const sendChatRequest = async (item) => {
    try {
      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      if (!user) {
        Alert.alert('Error', 'Please log in first.');
        return;
      }

      const callerId = user._id || user.id || user.userId;
      if (!callerId) {
        Alert.alert('Error', 'Session invalid. Please log out and log back in.');
        return;
      }

      const receiverId = item._id || item.id || item.userId;
      if (!receiverId) {
        Alert.alert('Error', 'Astrologer info missing. Please refresh and try again.');
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
                'Low Balance',
                `You need at least ₹${charge} to start a chat. Please recharge your wallet.`
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

      astroRef.current = item;
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
              setRequesting(false);
              setPendingRequestId(null);
              if (channelRef.current) supabase.removeChannel(channelRef.current);
              navigation.navigate('ChatSessionScreen', {
                requestId,
                person: astroRef.current,
              });
            } else if (updated.status === 'rejected') {
              setRequesting(false);
              setPendingRequestId(null);
              if (channelRef.current) supabase.removeChannel(channelRef.current);
              Alert.alert(
                'Astrologer Busy',
                'The astrologer is currently unavailable. Please try another.'
              );
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.log('sendChatRequest error:', err?.message || JSON.stringify(err));
      Alert.alert('Error', `Could not send request: ${err?.message || 'Please try again.'}`);
    }
  };

  const cancelRequest = async () => {
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
