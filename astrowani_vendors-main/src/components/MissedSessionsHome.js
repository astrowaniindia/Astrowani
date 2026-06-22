// Compact "Missed Sessions" section for the vendor HomeScreen.
// Combines missed chat + audio + video requests for the logged-in astrologer,
// with quick time filters (Today default / Yesterday / This Month / All).
import React, {useState, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {supabase} from '../api/SupabaseClient';
import {COLORS} from '../Theme/Colors';
import {scale, verticalScale, moderateScale} from '../utils/Scaling';

// Returns the [from, to) ISO boundaries for a filter key, or null for "all".
const getRange = key => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'today') {
    return {from: startOfToday.toISOString(), to: null};
  }
  if (key === 'yesterday') {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    return {from: startOfYesterday.toISOString(), to: startOfToday.toISOString()};
  }
  if (key === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {from: startOfMonth.toISOString(), to: null};
  }
  return null; // all
};

const FILTERS = [
  {key: 'today', label: 'Today'},
  {key: 'yesterday', label: 'Yesterday'},
  {key: 'month', label: 'This Month'},
  {key: 'all', label: 'All'},
];

const typeLabel = row =>
  row._kind === 'chat' ? 'Chat' : row.call_type === 'video' ? 'Video Call' : 'Audio Call';
const typeIcon = row =>
  row._kind === 'chat' ? 'chatbubble-outline' : row.call_type === 'video' ? 'videocam-outline' : 'call-outline';

const fmtTime = ts =>
  ts
    ? new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '';

export default function MissedSessionsHome() {
  const navigation = useNavigation();
  const [filter, setFilter] = useState('today');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const astroIdRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          const astroId = astroIdRef.current || (await AsyncStorage.getItem('astroId'));
          astroIdRef.current = astroId;
          if (!astroId) {
            if (active) { setRows([]); setLoading(false); }
            return;
          }
          const range = getRange(filter);
          const applyRange = q => {
            if (range?.from) q = q.gte('created_at', range.from);
            if (range?.to) q = q.lt('created_at', range.to);
            return q;
          };

          let callQ = supabase
            .from('call_requests')
            .select('id, customer_name, call_type, created_at')
            .eq('astrologer_id', astroId)
            .eq('status', 'missed');
          let chatQ = supabase
            .from('chat_requests')
            .select('id, caller_name, created_at')
            .eq('receiver_id', astroId)
            .eq('status', 'missed');

          const [callsRes, chatsRes] = await Promise.all([
            applyRange(callQ).order('created_at', {ascending: false}).limit(50),
            applyRange(chatQ).order('created_at', {ascending: false}).limit(50),
          ]);
          if (!active) return;

          const calls = (callsRes.data || []).map(r => ({...r, _kind: 'call', name: r.customer_name}));
          const chats = (chatsRes.data || []).map(r => ({...r, _kind: 'chat', name: r.caller_name}));
          const merged = [...calls, ...chats].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at),
          );
          setRows(merged);
        } catch (e) {
          console.log('[MissedSessionsHome] load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [filter]),
  );

  const visible = rows.slice(0, 5);

  return (
    <View style={styles.cardContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Missed Sessions</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MissedSessions')} activeOpacity={0.7}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      {/* Time filter chips */}
      <View style={styles.chipsRow}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.AstroMaroon} style={{marginVertical: verticalScale(18)}} />
      ) : visible.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={36} color="#ccc" />
          <Text style={styles.emptyText}>No missed sessions</Text>
        </View>
      ) : (
        visible.map(item => (
          <View key={`${item._kind}_${item.id}`} style={styles.row}>
            <View style={styles.iconBadge}>
              <Ionicons name={typeIcon(item)} size={18} color={COLORS.red} />
            </View>
            <View style={{flex: 1, marginLeft: scale(10)}}>
              <Text style={styles.name} numberOfLines={1}>{item.name || 'Customer'}</Text>
              <Text style={styles.meta}>{typeLabel(item)} · {fmtTime(item.created_at)}</Text>
            </View>
            <View style={styles.missedPill}>
              <Ionicons name="close-circle" size={12} color="#fff" />
              <Text style={styles.missedText}>Missed</Text>
            </View>
          </View>
        ))
      )}
      {!loading && rows.length > visible.length && (
        <Text style={styles.moreText}>+{rows.length - visible.length} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#fff', borderRadius: moderateScale(16), padding: scale(14),
    marginHorizontal: scale(14), marginTop: verticalScale(14),
    elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.08, shadowRadius: 4,
  },
  headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {fontSize: moderateScale(16), fontWeight: '700', color: COLORS.AstroMaroon},
  viewAll: {fontSize: moderateScale(12), fontWeight: '700', color: COLORS.AstroMaroon},
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginVertical: verticalScale(10)},
  chip: {
    paddingHorizontal: scale(12), paddingVertical: verticalScale(5),
    borderRadius: moderateScale(16), borderWidth: 1, borderColor: COLORS.AstroMaroon, backgroundColor: '#fff',
  },
  chipActive: {backgroundColor: COLORS.AstroMaroon},
  chipText: {fontSize: moderateScale(11), fontWeight: '600', color: COLORS.AstroMaroon},
  chipTextActive: {color: '#fff'},
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8),
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  iconBadge: {width: scale(34), height: scale(34), borderRadius: scale(17), backgroundColor: '#FDECEA', alignItems: 'center', justifyContent: 'center'},
  name: {fontSize: moderateScale(13), fontWeight: '700', color: '#222'},
  meta: {fontSize: moderateScale(10), color: '#888', marginTop: verticalScale(1)},
  missedPill: {flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red, borderRadius: moderateScale(10), paddingHorizontal: scale(7), paddingVertical: verticalScale(2), gap: 2},
  missedText: {color: '#fff', fontSize: moderateScale(10), fontWeight: '700'},
  emptyState: {alignItems: 'center', paddingVertical: verticalScale(16), gap: verticalScale(4)},
  emptyText: {fontSize: moderateScale(12), color: '#aaa', fontWeight: '600'},
  moreText: {fontSize: moderateScale(11), color: COLORS.AstroMaroon, textAlign: 'center', marginTop: verticalScale(8), fontWeight: '600'},
});
