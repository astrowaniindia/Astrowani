// Fetches the customer's saved profile on demand — backs the "Use my profile"
// button on the astro-report input screens (BirthDetailsForm.js,
// NumerologyInputScreen.js). A hook rather than each screen re-implementing the
// token lookup + GET /api/users/profile call.
import {useCallback, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

export default function useSavedProfile() {
  const [loading, setLoading] = useState(false);

  /**
   * Returns {profile, error}. profile is null when nothing could be loaded;
   * error distinguishes WHY (so the button's message is accurate instead of a
   * generic "something went wrong" for someone who is simply logged out).
   */
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return {profile: null, error: 'not_logged_in'};
      const res = await Instance.get('/api/users/profile', {
        headers: {Authorization: `Bearer ${token}`},
      });
      const profile = res?.data?.data || null;
      return {profile, error: profile ? null : 'failed'};
    } catch (_) {
      return {profile: null, error: 'failed'};
    } finally {
      setLoading(false);
    }
  }, []);

  return {fetchProfile, loading};
}
