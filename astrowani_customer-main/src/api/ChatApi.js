// src/api/ChatApi.js
import { supabase } from './SupabaseClient';
import Instance from './ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1️⃣ Create a chat request (Customer side)
export const createChatRequest = async (vendorId) => {
  const token = await AsyncStorage.getItem('token');
  const userStr = await AsyncStorage.getItem('userData');
  const user = userStr ? JSON.parse(userStr) : null;
  if (!user) throw new Error('User not logged in');

  const { data, error } = await supabase.from('chat_requests').insert([
    {
      caller_id: user._id,
      receiver_id: vendorId,
      status: 'pending',
    },
  ]);
  if (error) throw error;
  return data[0];
};

// 2️⃣ Listen for request status changes (both sides)
export const listenChatRequests = (userId, onNewRequest, onStatusChange) => {
  const channel = supabase.channel(`chat_requests_user_${userId}`);

  // New incoming request (for vendor)
  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_requests', filter: `receiver_id=eq.${userId}` },
      (payload) => {
        onNewRequest && onNewRequest(payload.new);
      }
    )
    // Status updates (for caller)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_requests', filter: `caller_id=eq.${userId}` },
      (payload) => {
        onStatusChange && onStatusChange(payload.new);
      }
    )
    .subscribe();

  return channel;
};

// 3️⃣ Accept / Reject request (Vendor side)
export const acceptChatRequest = async (request) => {
  const { error: updErr } = await supabase
    .from('chat_requests')
    .update({ status: 'accepted' })
    .eq('id', request.id);
  if (updErr) throw updErr;

  const astroStr = await AsyncStorage.getItem('astroData');
  const astro = astroStr ? JSON.parse(astroStr) : null;
  const perMinute = astro?.chatChargePerMinute ?? 0;

  const { data: sess, error: sessErr } = await supabase.from('chat_sessions').insert([
    { request_id: request.id, per_minute_charge: perMinute },
  ]);
  if (sessErr) throw sessErr;
  return sess[0];
};

export const rejectChatRequest = async (requestId) => {
  const { error } = await supabase
    .from('chat_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);
  if (error) throw error;
};

// 4️⃣ Get chat session after acceptance (Customer side)
export const fetchChatSession = async (requestId) => {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('request_id', requestId)
    .single();
  if (error) throw error;
  return data;
};

// 5️⃣ Deduct wallet each minute (both sides)
export const deductWalletMinute = async (sessionId, amount) => {
  const token = await AsyncStorage.getItem('token');
  await Instance.post(
    '/api/wallet/deduct',
    { sessionId, amount },
    { headers: { Authorization: `Bearer ${token}` } }
  );
};
