import React, {useState, useCallback, useRef} from 'react';
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
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {supabase} from '../../api/SupabaseClient';
import {COLORS} from '../../Theme/Colors';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';

const TABS = [
  {key: 'chat',  label: 'Chat',       icon: 'chatbubble-outline',   types: ['chat']},
  {key: 'audio', label: 'Audio Call', icon: 'call-outline',          types: ['audio', 'voice']},
  {key: 'video', label: 'Video Call', icon: 'videocam-outline',      types: ['video']},
  {key: 'live',  label: 'Live',       icon: 'radio-button-on-outline', types: ['live']},
];

const TAB_ICONS = {
  chat:  {name: 'chatbubble', color: '#5C6BC0'},
  audio: {name: 'call',       color: '#2E7D32'},
  video: {name: 'videocam',   color: '#6A1B9A'},
  live:  {name: 'radio',      color: '#C62828'},
};

const formatDuration = (mins) => {
  if (!mins) return '0 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const SessionCard = ({item, tabKey}) => {
  const icon = TAB_ICONS[tabKey] || TAB_ICONS.chat;
  const durationMins = item.ended_at
    ? Math.max(1, Math.round((new Date(item.ended_at) - new Date(item.started_at)) / 60000))
    : 0;
  const earnings = Math.round(durationMins * (item.per_minute_charge || 0));

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={[styles.cardHeader, {borderLeftColor: icon.color}]}>
        <View style={[styles.iconBadge, {backgroundColor: icon.color + '18'}]}>
          <Ionicons name={icon.name} size={18} color={icon.color} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.customerName}>{item.customerName || 'Customer'}</Text>
          <Text style={styles.sessionDate}>{formatDate(item.started_at || item.created_at)}</Text>
        </View>
        <View style={[styles.statusPill, item.is_active ? styles.pillActive : styles.pillDone]}>
          <Text style={[styles.statusText, item.is_active ? styles.statusActive : styles.statusDone]}>
            {item.is_active ? 'Active' : 'Completed'}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <MaterialIcons name="timer" size={15} color="#888" />
          <Text style={styles.statLabel}>Duration</Text>
          <Text style={styles.statValue}>{item.is_active ? 'Active' : formatDuration(durationMins)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <MaterialIcons name="currency-rupee" size={15} color="#888" />
          <Text style={styles.statLabel}>Rate</Text>
          <Text style={styles.statValue}>₹{item.per_minute_charge || 0}/min</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Ionicons name="wallet-outline" size={15} color="#888" />
          <Text style={styles.statLabel}>Earned</Text>
          <Text style={[styles.statValue, styles.earnedValue]}>₹{earnings}</Text>
        </View>
      </View>
    </View>
  );
};

const TabContent = ({tabKey, types, astroId}) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const custMapRef = useRef({});

  const resolveName = useCallback(async (callerId) => {
    if (!callerId) return 'Customer';
    if (custMapRef.current[callerId]) return custMapRef.current[callerId];
    const {data} = await supabase
      .from('customers')
      .select('id, name, first_name, last_name')
      .eq('id', callerId)
      .single();
    if (data) {
      const name = data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Customer';
      custMapRef.current[callerId] = name;
      return name;
    }
    return 'Customer';
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        try {
          const id = astroId || (await AsyncStorage.getItem('astroId'));
          if (!id) return;

          const {data, error} = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('vendor_id', id)
            .in('call_type', types)
            .order('started_at', {ascending: false})
            .limit(100);

          if (error || !data || !active) return;

          // Bulk-fetch customer names
          const callerIds = [...new Set(data.map(s => s.caller_id).filter(Boolean))];
          if (callerIds.length) {
            const {data: custs} = await supabase
              .from('customers')
              .select('id, name, first_name, last_name')
              .in('id', callerIds);
            if (custs) {
              custs.forEach(c => {
                custMapRef.current[c.id] = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Customer';
              });
            }
          }

          const enriched = data.map(s => ({
            ...s,
            customerName: custMapRef.current[s.caller_id] || 'Customer',
          }));

          if (active) setSessions(enriched);

          // ── Realtime subscription ──────────────────────────────────────────
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }

          const channel = supabase
            .channel(`session_history_${tabKey}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_sessions',
                filter: `vendor_id=eq.${id}`,
              },
              async (payload) => {
                const row = payload.new;
                if (!row || !types.includes(row.call_type)) return;
                const customerName = await resolveName(row.caller_id);
                if (!active) return;
                setSessions(prev => {
                  // Avoid duplicate if focus-refresh already caught it
                  if (prev.some(s => s.id === row.id)) return prev;
                  return [{...row, customerName}, ...prev];
                });
              },
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_sessions',
                filter: `vendor_id=eq.${id}`,
              },
              (payload) => {
                const row = payload.new;
                if (!row || !types.includes(row.call_type)) return;
                if (!active) return;
                setSessions(prev =>
                  prev.map(s =>
                    s.id === row.id
                      ? {...s, ...row, customerName: s.customerName}
                      : s,
                  ),
                );
              },
            )
            .subscribe();

          channelRef.current = channel;
        } catch (e) {
          console.log('[SessionHistory] load error:', e);
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
    }, [astroId, types.join(',')]),
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
      data={sessions}
      keyExtractor={item => item.id?.toString()}
      renderItem={({item}) => <SessionCard item={item} tabKey={tabKey} />}
      contentContainerStyle={sessions.length === 0 ? styles.emptyContainer : styles.listContent}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={52} color="#ccc" />
          <Text style={styles.emptyText}>No history yet</Text>
          <Text style={styles.emptySubText}>Sessions will appear here after calls end</Text>
        </View>
      }
    />
  );
};

export default function SessionHistory({route}) {
  const [activeTab, setActiveTab] = useState(0);
  const [astroId, setAstroId] = useState(null);

  React.useEffect(() => {
    AsyncStorage.getItem('astroId').then(id => setAstroId(id));
  }, []);

  const tab = TABS[activeTab];

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t, i) => {
          const active = i === activeTab;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.75}>
              <Ionicons
                name={t.icon}
                size={18}
                color={active ? COLORS.AstroMaroon : '#999'}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {active && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <TabContent
        key={tab.key}
        tabKey={tab.key}
        types={tab.types}
        astroId={astroId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    gap: verticalScale(3),
    position: 'relative',
  },
  tabItemActive: {},
  tabLabel: {
    fontSize: moderateScale(10),
    color: '#999',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: scale(8),
    right: scale(8),
    height: 2,
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 2,
  },

  // ── List ─────────────────────────────────────────────────────────────────────
  listContent: {
    padding: scale(14),
    paddingBottom: verticalScale(30),
  },
  emptyContainer: {
    flexGrow: 1,
  },

  // ── Card ─────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(12),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.07,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(14),
    borderLeftWidth: 4,
    gap: scale(10),
  },
  iconBadge: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  customerName: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sessionDate: {
    fontSize: moderateScale(11),
    color: '#888',
    marginTop: verticalScale(2),
  },
  statusPill: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(20),
  },
  pillActive: {backgroundColor: '#E8F5E9'},
  pillDone:  {backgroundColor: '#F3F3F3'},
  statusText: {fontSize: moderateScale(11), fontWeight: '700'},
  statusActive: {color: '#2E7D32'},
  statusDone:   {color: '#888'},

  // ── Stats ────────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingVertical: verticalScale(10),
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: verticalScale(2),
  },
  statDivider: {
    width: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: verticalScale(2),
  },
  statLabel: {
    fontSize: moderateScale(10),
    color: '#aaa',
    fontWeight: '500',
  },
  statValue: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#333',
  },
  earnedValue: {
    color: '#2E7D32',
  },

  // ── States ───────────────────────────────────────────────────────────────────
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: verticalScale(80),
    gap: verticalScale(8),
  },
  emptyText: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: '#999',
  },
  emptySubText: {
    fontSize: moderateScale(12),
    color: '#bbb',
    textAlign: 'center',
    paddingHorizontal: scale(30),
  },
});
