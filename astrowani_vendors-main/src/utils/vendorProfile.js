// Vendor profile-completion gate (mirrors astrologerProfileComplete in the backend).
//
// An astrologer's app stays "locked" — and they stay hidden from the customer app —
// until the core profile is filled: full name, valid email, gender, experience,
// profile photo, at least one language, and at least one per-minute charge (>0).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from '../api/SupabaseClient';

const s = (v) => (v == null ? '' : String(v)).trim();

export const isVendorProfileComplete = (row) => {
  if (!row) return false;
  const name = (s(row.first_name) + ' ' + s(row.last_name)).trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(row.email));
  const hasPhoto = !!(s(row.profile_image) || s(row.profile_pic_url));
  const langs = row.languages || row.language;
  const hasLang = Array.isArray(langs) ? langs.length > 0 : !!s(langs);
  const expOk = Number(row.experience) > 0;
  const hasCharge =
    Number(row.chat_charge_per_minute) > 0 ||
    Number(row.call_charge_per_minute) > 0 ||
    Number(row.video_charge_per_minute) > 0;
  return !!(name && emailOk && s(row.gender) && expOk && hasPhoto && hasLang && hasCharge);
};

export const fetchAstrologerRow = async (astroId) => {
  const id = astroId || (await AsyncStorage.getItem('astroId'));
  if (!id) return null;
  const { data } = await supabase.from('astrologers').select('*').eq('id', id).single();
  return data || null;
};

// Returns true if the vendor may proceed; otherwise prompts them to finish the profile.
//   if (!(await ensureVendorProfileComplete(navigation))) return;
export const ensureVendorProfileComplete = async (navigation) => {
  const row = await fetchAstrologerRow();
  if (isVendorProfileComplete(row)) return true;
  Alert.alert(
    'Complete Your Profile',
    'Please complete your profile — photo, experience, languages and at least one service charge — so customers can find you. Your profile stays hidden until then.',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Complete Now', onPress: () => { try { navigation.navigate('EditProfile'); } catch (_) {} } },
    ],
  );
  return false;
};

export default ensureVendorProfileComplete;
