// Should the shop hand off to WhatsApp instead of taking payment in the app?
//
// Buying a remedy is a conversation: which stone suits you, what weight, does it
// need a puja first. So the shop's job becomes "start that conversation" and the
// sale closes in WhatsApp with a bot that knows the catalogue and an astrologer
// behind it. See astrowani-backend/sql/whatsapp_shop_schema.sql.
//
// Read straight from app_settings via Supabase (public-read), the same pattern as
// useRemedyOrderingGate and Navigation.js's wallet balance — no bespoke endpoint.
//
// Fails CLOSED, and closed here means "leave the app alone": if the setting cannot
// be read, or the admin has not filled in a number yet, the shop keeps its normal
// in-app behaviour. Sending a customer to a WhatsApp number that does not exist is
// worse than showing them the cart they already know.
//
// The number lives in settings, not in the build, specifically so the app can ship
// before the WhatsApp Business number exists — switching it on later needs no
// release.
import { useEffect, useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../api/SupabaseClient';

const KEYS = [
  'whatsapp_shop_enabled',
  'whatsapp_shop_number',
  'whatsapp_shop_greeting',
  'whatsapp_shop_cta',
];

const DEFAULT_GREETING = "Hi! I'd like to know more about {item}.";
const DEFAULT_CTA = 'Enquire on WhatsApp';

export default function useWhatsAppShop() {
  // null = still checking. Screens must treat null as "not yet known" so the buy
  // button doesn't flip label on a slow network.
  const [enabled, setEnabled] = useState(null);
  const [number, setNumber] = useState('');
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [cta, setCta] = useState(DEFAULT_CTA);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', KEYS);
        if (cancelled) return;
        const map = {};
        (data || []).forEach((r) => { map[r.key] = r.value; });

        // Anything that isn't a plain digit string is not a number we can open.
        const digits = String(map.whatsapp_shop_number || '').replace(/[^\d]/g, '');
        setNumber(digits);
        if (map.whatsapp_shop_greeting) setGreeting(map.whatsapp_shop_greeting);
        if (map.whatsapp_shop_cta) setCta(map.whatsapp_shop_cta);
        // Both must hold: switched on AND a usable number.
        setEnabled(map.whatsapp_shop_enabled === 'true' && digits.length >= 10);
      } catch (_) {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Opens WhatsApp with the item named, so the bot knows what the customer is
  // asking about before they type anything.
  //
  // The item id is appended in a way a person will not bother to strip but the bot
  // can read, which is what lets the conversation start already knowing the
  // product, its price and its available weights.
  const openChat = useCallback(async (item) => {
    if (!number) return false;
    const title = item?.title || 'a remedy';
    const text = greeting.replace('{item}', title) + (item?.id ? `\n\n[ref:${item.id}]` : '');
    const url = `whatsapp://send?phone=${number}&text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
      return true;
    } catch (_) {
      // WhatsApp not installed, or the scheme is blocked. wa.me works in a browser
      // and offers the install, so a customer without WhatsApp is not dead-ended.
      try {
        await Linking.openURL(`https://wa.me/${number}?text=${encodeURIComponent(text)}`);
        return true;
      } catch (__) {
        return false;
      }
    }
  }, [number, greeting]);

  return { enabled, number, greeting, cta, openChat };
}
