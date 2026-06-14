// src/api/ChatApi.js (Vendor side)
import { supabase } from './SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Listen for incoming chat requests addressed to this astrologer
export const listenChatRequests = (astroId, onNewRequest) => {
  const channel = supabase.channel(`chat_requests_user_${astroId}`);
  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_requests', filter: `receiver_id=eq.${astroId}` },
      (payload) => {
        onNewRequest && onNewRequest(payload.new);
      }
    )
    .subscribe();
  return channel;
};

// Accept a request: set status = accepted and create a chat_sessions row using astrologer's charge
export const acceptChatRequest = async (request) => {
  const { error: updErr } = await supabase
    .from('chat_requests')
    .update({ status: 'accepted' })
    .eq('id', request.id);
  if (updErr) throw updErr;

  // Load astrologer profile to fetch per‑minute charge
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
