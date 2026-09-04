import React, {useState, useCallback, useRef} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import SessionDetails from '../component/SessionDetails';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {supabase} from '../../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LanguageContext} from '../../context/LanguageContext';
import {captureEvent} from '../../utils/Analytics';

const getCustomerId = async () => {
  const userStr = await AsyncStorage.getItem('userData');
  const user = userStr ? JSON.parse(userStr) : null;
  return user?.id || user?._id || user?.userId || null;
};

const SessionList = ({callTypes, sessionTypeLabel}) => {
  const navigation = useNavigation();
  const {t} = React.useContext(LanguageContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const astroMapRef = useRef({});

  const resolveAstro = useCallback(async vendorId => {
    if (!vendorId) return null;
    if (astroMapRef.current[vendorId]) return astroMapRef.current[vendorId];
    const {data: a} = await supabase
      .from('astrologers')
      // `profile_image` dropped — not in the anon SELECT grant on astrologers
      // (sql/hardening_02_access_control.sql); profile_pic_url is granted and is
      // the fallback this screen already reads first below anyway.
      .select('id, first_name, last_name, profile_pic_url')
      .eq('id', vendorId)
      .single();
    if (a) astroMapRef.current[vendorId] = a;
    return a || null;
  }, []);

  // Stable English key for color lookup in SessionDetails — sessionTypeLabel is now
  // translated for display, so it can't be used as a lookup key.
  const typeKey = callTypes.includes('video') ? 'video' : callTypes.includes('live') ? 'live'
    : callTypes.includes('chat') ? 'chat' : 'audio';

  const formatSession = useCallback(
    (item, astro) => {
      const start = new Date(item.started_at || item.created_at);
      const end = item.ended_at ? new Date(item.ended_at) : null;
      const durationMins = end
        ? Math.max(1, Math.round((end - start) / 60000))
        : 0;
      const deduction = Math.round(durationMins * (item.per_minute_charge || 0));

      const name = astro
        ? `${astro.first_name || ''} ${astro.last_name || ''}`.trim() || t('common.astrologer')
        : t('common.astrologer');
      const image =
        astro?.profile_image ||
        astro?.profile_pic_url ||
        'https://cdn-icons-png.flaticon.com/128/3135/3135715.png';

      return {
        id: item.id?.toString(),
        referenceId: item.id || 'N/A',
        name,
        chatType: sessionTypeLabel,
        typeKey,
        time: start.toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true,
        }),
        rate: item.per_minute_charge || 0,
        duration: durationMins,
        deduction,
        image,
        isActive: item.is_active || false,
        // Minimal person object so the card's "View Profile" can open AstrologerInfo.
        astro: {
          userId: item.vendor_id,
          _id: item.vendor_id,
          name,
          profileImage: image,
        },
      };
    },
    [sessionTypeLabel, typeKey],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        try {
          const myId = await getCustomerId();
          if (!myId) return;

          const {data: records, error} = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('caller_id', myId)
            .in('call_type', callTypes)
            .order('started_at', {ascending: false})
            .limit(100);

          if (error || !records || !active) return;

          // Bulk-fetch astrologer info
          const vendorIds = [...new Set(records.map(r => r.vendor_id).filter(Boolean))];
          if (vendorIds.length) {
            const {data: astros} = await supabase
              .from('astrologers')
              // `profile_image` dropped — not in the anon SELECT grant on astrologers
      // (sql/hardening_02_access_control.sql); profile_pic_url is granted and is
      // the fallback this screen already reads first below anyway.
      .select('id, first_name, last_name, profile_pic_url')
              .in('id', vendorIds);
            if (astros) astros.forEach(a => (astroMapRef.current[a.id] = a));
          }

          const formatted = records.map(item =>
            formatSession(item, astroMapRef.current[item.vendor_id]),
          );
          if (active) setData(formatted);

          // ── Realtime subscription ─────────────────────────────────────────
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }

          const channel = supabase
            .channel(
              `cust_sessions_${callTypes[0]}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
            )
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_sessions',
                filter: `caller_id=eq.${myId}`,
              },
              async payload => {
                const row = payload.new;
                if (!row || !callTypes.includes(row.call_type)) return;
                const astro = await resolveAstro(row.vendor_id);
                if (!active) return;
                setData(prev => {
                  if (prev.some(s => s.id === row.id?.toString())) return prev;
                  return [formatSession(row, astro), ...prev];
                });
              },
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_sessions',
                filter: `caller_id=eq.${myId}`,
              },
              payload => {
                const row = payload.new;
                if (!row || !callTypes.includes(row.call_type)) return;
                if (!active) return;
                setData(prev =>
                  prev.map(s =>
                    s.id === row.id?.toString()
                      ? formatSession(row, astroMapRef.current[row.vendor_id])
                      : s,
                  ),
                );
              },
            )
            .subscribe();

          channelRef.current = channel;
        } catch (e) {
          console.log('[MySessionScreen] load error:', e);
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
    }, [callTypes.join(',')]),
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
      data={data}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <SessionDetails
          session={item}
          handleprofile={s => navigation.navigate('AstrologerInfo', {person: s.astro})}
        />
      )}
      contentContainerStyle={
        data.length === 0 ? styles.emptyContainer : styles.listContent
      }
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      windowSize={7}
      maxToRenderPerBatch={10}
      initialNumToRender={10}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('session.noneFound', {type: sessionTypeLabel})}</Text>
          <Text style={styles.emptySubText}>
            {t('session.willAppear')}
          </Text>
        </View>
      }
    />
  );
};

const ChatSession = () => {
  const {t} = React.useContext(LanguageContext);
  return <SessionList callTypes={['chat']} sessionTypeLabel={t('session.chatSession')} />;
};
const CallSession = () => {
  const {t} = React.useContext(LanguageContext);
  return <SessionList callTypes={['audio', 'voice']} sessionTypeLabel={t('session.audioCall')} />;
};
const VideoSession = () => {
  const {t} = React.useContext(LanguageContext);
  return <SessionList callTypes={['video']} sessionTypeLabel={t('session.videoCall')} />;
};
const LiveSession = () => {
  const {t} = React.useContext(LanguageContext);
  return <SessionList callTypes={['live']} sessionTypeLabel={t('session.liveSession')} />;
};

// Hand-built tab bar instead of @react-navigation/material-top-tabs — that library's
// TabBar (via react-native-tab-view's PagerViewAdapter) crashes with "TypeError:
// undefined is not a function" in release/Hermes builds (this was the only screen in
// either app using it, confirmed via a live device reproduction + logcat, 2026-08-08).
// Same 4 tabs, same SessionList/data logic untouched — just without the buggy
// third-party pager-based tab bar. No swipe-between-tabs gesture, tap-to-switch only.
const SESSION_TABS = [
  {key: 'ChatSession', Component: ChatSession, labelKey: 'session.tabChat'},
  {key: 'CallSession', Component: CallSession, labelKey: 'session.audioCall'},
  {key: 'VideoSession', Component: VideoSession, labelKey: 'session.videoCall'},
  {key: 'LiveSession', Component: LiveSession, labelKey: 'session.tabLive'},
];

const MySessionsScreen = () => {
  const {t} = React.useContext(LanguageContext);
  const [activeKey, setActiveKey] = useState(SESSION_TABS[0].key);
  const ActiveComponent =
    SESSION_TABS.find(tab => tab.key === activeKey)?.Component ?? ChatSession;

  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}>
      <View style={tabBarStyles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {SESSION_TABS.map(tab => {
            const isActive = tab.key === activeKey;
            return (
              <TouchableOpacity
                key={tab.key}
                style={tabBarStyles.tabItem}
                activeOpacity={0.7}
                onPress={() => {
                  captureEvent('my_sessions_tab_switched', {tab: tab.key});
                  setActiveKey(tab.key);
                }}>
                <Text
                  style={[
                    tabBarStyles.tabLabel,
                    isActive && tabBarStyles.tabLabelActive,
                  ]}>
                  {t(tab.labelKey)}
                </Text>
                {isActive && <View style={tabBarStyles.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <ActiveComponent />
    </View>
  );
};

const tabBarStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  tabItem: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: moderateScale(13),
    fontWeight: 'bold',
    color: '#888',
  },
  tabLabelActive: {
    color: COLORS.AstroMaroon,
  },
  tabIndicator: {
    marginTop: verticalScale(6),
    height: verticalScale(3),
    width: '100%',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 2,
  },
});

export default MySessionsScreen;

const styles = StyleSheet.create({
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  listContent: {paddingBottom: verticalScale(30)},
  emptyContainer: {flexGrow: 1},
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
