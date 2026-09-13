// Birth-details gate.
//
// Signup asks only for a phone number and a name. The details an astrologer needs
// to read a chart are asked the first time the customer tries something that uses
// them: chat, call, video, live, the free chat and the free call booking. The
// customer gets a short guided flow in the signup style
// (screens/Register/CompleteBirthDetails.js) — NOT the Profile screen.
//
// Required: name, gender, marital status, date of birth, place of birth.
// NOT required: email, photo, time of birth. The backend's
// customerProfileComplete() uses the same rule — keep the two in step.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureEvent } from './Analytics';

const s = (v) => (v == null ? '' : String(v)).trim();

export const isProfileComplete = (u) => {
  if (!u) return false;
  const name = s(u.name) || s(u.firstName);
  const dob = s(u.dob) || s(u.dateOfBirth);
  const place = s(u.placeOfBirth) || s(u.place_of_birth) || s(u.city) || s(u.address?.city);
  const marital = s(u.maritalStatus) || s(u.marital_status);
  return !!(name && s(u.gender) && marital && dob && place);
};

export const getStoredUser = async () => {
  try {
    const str = await AsyncStorage.getItem('userData');
    return str ? JSON.parse(str) : null;
  } catch (_) {
    return null;
  }
};

// Which of the required fields are missing, for analytics.
const missingProfileFields = (u) => {
  const out = [];
  if (!u) return ['all'];
  if (!(s(u.name) || s(u.firstName))) out.push('name');
  if (!s(u.gender)) out.push('gender');
  if (!(s(u.maritalStatus) || s(u.marital_status))) out.push('marital_status');
  if (!(s(u.dob) || s(u.dateOfBirth))) out.push('dob');
  if (!(s(u.placeOfBirth) || s(u.place_of_birth) || s(u.city) || s(u.address?.city))) out.push('place_of_birth');
  return out;
};

// Gate an action. Returns true if allowed; otherwise opens the guided birth-details
// flow and returns false.
//   if (!(await ensureProfileComplete(navigation, 'chat'))) return;
//
// `intent` names the action that was blocked ('chat', 'audio_call', 'video_call',
// 'live', 'free_chat', 'free_call'). Instrumented HERE rather than at each call
// site so a new gated action is measured the day it is added.
export const ensureProfileComplete = async (navigation, intent = 'unknown') => {
  const user = await getStoredUser();
  if (isProfileComplete(user)) return true;
  captureEvent('profile_gate_blocked', {
    intent,
    missing_fields: missingProfileFields(user),
    is_new_user: !user,
  });
  try { navigation.navigate('CompleteBirthDetails', { intent }); } catch (_) {}
  return false;
};

export default ensureProfileComplete;
