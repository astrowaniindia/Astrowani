// Resolves customer ids to a display name + photo via the backend, not a direct
// `customers` read (some past call sites had NO filter at all — dumping the
// whole table just to build a lookup map). See
// DATABASE_HARDENING_HANDOFF.md §3.1/§3.2, sql/hardening_02_access_control.sql.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

/**
 * @param {string[]} ids
 * @returns {Promise<Record<string, {name: string, profileImage: string|null}>>}
 */
export async function resolveCustomerNames(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return {};
    const res = await Instance.post(
      '/api/customers/names',
      { ids: unique },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data?.data || {};
  } catch (_) {
    return {};
  }
}
