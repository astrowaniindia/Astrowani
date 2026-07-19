// First-ever session (any astrologer, any type — chat/audio/video) is free, to let a
// brand-new customer try the platform before their wallet is ever touched. Eligibility is
// purely "have they ever had a chat_sessions row at all" — the actual free billing window
// (skip charging for the first few minutes) is enforced server-side in sessionManager.js;
// this client-side check only gates the UI (banners + skipping the pre-call wallet-balance
// gate, since a genuinely new customer may have ₹0 balance and would otherwise never be
// able to reach their own free session).
import { supabase } from '../api/SupabaseClient';

export async function isEligibleForFreeConsultation(customerId) {
  if (!customerId) return false;
  try {
    const { count, error } = await supabase
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('caller_id', customerId);
    if (error) return false;
    return (count || 0) === 0;
  } catch (_) {
    return false;
  }
}
