// Tiny stale-while-revalidate helper: read a cached value instantly, and let the
// caller overwrite it once a fresh network response comes back. Used to kill the
// "everything pops in one section at a time" look on app open — a repeat visit
// renders last-seen data with zero wait instead of blank/spinner until each
// fetch resolves.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cache_v1_';

export const readCache = async key => {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

export const writeCache = async (key, value) => {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (_) {
    // best-effort — a cache write failure should never block the UI
  }
};
