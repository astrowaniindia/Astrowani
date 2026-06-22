import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {supabase} from '../../api/SupabaseClient';
import {COLORS} from '../../Theme/Colors';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';

const TABS = [
  {key: 'chat',  label: 'Chat',       icon: 'chatbubble-outline', table: 'chat_requests', idField: 'receiver_id',   nameField: 'caller_name',   types: null},
  {key: 'audio', label: 'Audio Call', icon: 'call-outline',       table: 'call_requests', idField: 'astrologer_id', nameField: 'customer_name', types: ['audio', 'voice']},
  {key: 'video', label: 'Video Call', icon: 'videocam-outline',   table: 'call_requests', idField: 'astrologer_id', nameField: 'customer_name', types: ['video']},
];

const fmtTime = ts =>
  ts
    ? new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '';

const TabContent = ({tab, astroId}) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const matchesTab = row =>
    row.status === 'missed' && (!tab.types || tab.types.includes(row.call_type));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          if (!astroId) return;
          let q = supabase
            .from(tab.table)
            .select('*')
            .eq(tab.idField, astroId)
            .eq('status', 'missed')
            .order('created_at', {ascending: false})
            .limit(100);
          if (tab.types) q = q.in('call_type', tab.types);
          const {data, error} = await q;
          if (error || !active) return;
          setRows(data || []);

          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
          const channel = supabase
            .channel(`missed_${tab.key}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
            .on(
              'postgres_changes',
              {event: 'UPDATE', schema: 'public', table: tab.table, filter: `${tab.idField}=eq.${astroId}`},
              payload => {
                const row = payload.new;
                if (!active || !row || !matchesTab(row)) return;
                setRows(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]));
              },
            )
            .subscribe();
          channelRef.current = channel;
        } catch (e) {
          console.log('[MissedSessions] load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => {
        active = false;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [astroId, tab.key]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={item => String(item.id)}
      contentContainerStyle={rows.length === 0 ? styles.emptyContainer : styles.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({item}) => (
        <View style={styles.card}>
          <View style={[styles.iconBadge, {backgroundColor: '#FDECEA'}]}>
            <Ionicons name="call-outline" size={20} color={COLORS.red} />
          </View>
          <View style={{flex: 1, marginLeft: scale(12)}}>
            <Text style={styles.name}>{item[tab.nameField] || 'Customer'}</Text>
            <Text style={styles.time}>{fmtTime(item.created_at)}</Text>
          </View>
          <View style={styles.missedPill}>
            <Ionicons name="close-circle" size={14} color="#fff" />
            <Text style={styles.missedText}>Missed</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={52} color="#ccc" />
          <Text style={styles.emptyText}>No missed {tab.label.toLowerCase()}s</Text>
          <Text style={styles.emptySubText}>Calls you don't answer in 1 minute show up here</Text>
        </View>
      }
    />
  );
};

export default function MissedSessions() {
  const [activeTab, setActiveTab] = useState(0);
  const [astroId, setAstroId] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('astroId').then(id => setAstroId(id));
    // Opening the screen clears the drawer's "new missed" badge.
    AsyncStorage.setItem('missed_seen_at', new Date().toISOString());
  }, []);

  const tab = TABS[activeTab];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((t, i) => {
          const active = i === activeTab;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.75}>
              <Ionicons name={t.icon} size={18} color={active ? COLORS.AstroMaroon : '#999'} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              {active && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TabContent key={tab.key} tab={tab} astroId={astroId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F8F9FA'},
  tabBar: {flexDirection: 'row', backgroundColor: '#fff', elevation: 2},
  tabItem: {flex: 1, alignItems: 'center', paddingVertical: verticalScale(12)},
  tabLabel: {fontSize: moderateScale(12), color: '#999', marginTop: verticalScale(2), fontWeight: '600'},
  tabLabelActive: {color: COLORS.AstroMaroon},
  tabUnderline: {position: 'absolute', bottom: 0, height: verticalScale(3), width: '60%', backgroundColor: COLORS.AstroMaroon, borderRadius: 2},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  listContent: {padding: scale(14)},
  emptyContainer: {flexGrow: 1},
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: moderateScale(12), padding: scale(14), marginBottom: verticalScale(10),
    elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.08, shadowRadius: 3,
  },
  iconBadge: {width: scale(40), height: scale(40), borderRadius: scale(20), alignItems: 'center', justifyContent: 'center'},
  name: {fontSize: moderateScale(15), fontWeight: '700', color: '#222'},
  time: {fontSize: moderateScale(11), color: '#888', marginTop: verticalScale(2)},
  missedPill: {flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red, borderRadius: moderateScale(12), paddingHorizontal: scale(8), paddingVertical: verticalScale(3), gap: 3},
  missedText: {color: '#fff', fontSize: moderateScale(11), fontWeight: '700'},
  emptyState: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: verticalScale(90), gap: verticalScale(6)},
  emptyText: {fontSize: moderateScale(16), fontWeight: '700', color: '#999'},
  emptySubText: {fontSize: moderateScale(12), color: '#bbb', textAlign: 'center', paddingHorizontal: scale(30)},
});
