// Profile completion gate.
//
// After registration the customer lands on Home but the app is "locked": any real
// action (chat / call / video / live / remedy order) prompts them to finish their
// profile first, so the astrologer has their details. Once the core profile fields
// are filled (hand/palm photo excluded) everything unlocks automatically.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showStatusPopup } from '../components/StatusPopup';

const s = (v) => (v == null ? '' : String(v)).trim();

// Core fields required to unlock the app (palm/hand photo + avatar are optional).
export const isProfileComplete = (u) => {
  if (!u) return false;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(u.email));
  const name = s(u.name) || s(u.firstName);
  const dob = s(u.dob) || s(u.dateOfBirth);
  const place = s(u.placeOfBirth) || s(u.place_of_birth) || s(u.city) || s(u.address?.city);
  return !!(name && emailOk && s(u.gender) && dob && place);
};

export const getStoredUser = async () => {
  try {
    const str = await AsyncStorage.getItem('userData');
    return str ? JSON.parse(str) : null;
  } catch (_) {
    return null;
  }
};

// Gate a money/interaction action. Returns true if allowed; otherwise shows a prompt,
// sends the user to the profile screen, and returns false. Use as:
//   if (!(await ensureProfileComplete(navigation))) return;
export const ensureProfileComplete = async (navigation) => {
  const user = await getStoredUser();
  if (isProfileComplete(user)) return true;
  showStatusPopup({
    variant: 'info',
    title: 'Complete Your Profile',
    message: 'Please fill in your profile details so the astrologer can assist you properly during your session.',
    buttonText: 'Fill Profile',
  });
  try { navigation.navigate('UserProfileScreen', { user: user || {} }); } catch (_) {}
  return false;
};

export default ensureProfileComplete;
