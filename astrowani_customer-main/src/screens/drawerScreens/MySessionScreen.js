import React, {useState, useCallback, useRef} from 'react';
import {View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import SessionDetails from '../component/SessionDetails';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import {getMySessions} from '../../api/SessionApi';
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
  // sessionId -> rupees actually debited / minutes actually billed, from the backend
  // (the app cannot read wallet_transactions: anon has no SELECT on it).
  const chargeMapRef = useRef({});
  const minuteMapRef = useRef({});

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
      // What was ACTUALLY taken, from the wallet ledger — never duration x rate.
      // Billed minutes and wall-clock minutes legitimately differ: the first minute is
      // charged 60s after connect, and the backend pauses billing while a participant is
      // absent. The old calculation told a customer "Charged Rs500" for a call that had
      // taken Rs400 — the app overstating what it took from them. `null` means the charge
      // could not be resolved, and the card shows "—" rather than inventing a figure.
      const charged = chargeMapRef.current[item.id];
      const deduction = charged === undefined ? null : charged;
      const billedMinutes = minuteMapRef.current[item.id] ?? null;

      // `astro` is now the astrologer the SERVER joined onto the row
      // (GET /api/customer/sessions), not a row this screen fetched itself, so the
      // name is already assembled and the avatar already resized.
      const name = astro?.name || t('common.astrologer');
      const image =
        astro?.profilePicUrl ||
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
        billedMinutes,
        hadConnectivityIssue: !!item.had_connectivity_issue,
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

          // Real charges first, so formatSession has them. Best-effort: a failure leaves
          // the map empty and every card shows "—" for the amount, which is the honest
          // answer, rather than a number computed from duration that would be too high.
          try {
            const token = await AsyncStorage.getItem('token');
            if (token) {
              const res = await Instance.get('/api/sessions/charges', {
                headers: {Authorization: `Bearer ${token}`},
              });
              if (res.data?.success) {
                chargeMapRef.current = res.data.charges || {};
                minuteMapRef.current = res.data.minutes || {};
              }
            }
          } catch (e) {
            console.warn('session charges fetch failed:', e.message);
          }

          // ONE request, with the astrologer already joined on each row. This used to be
          // a direct chat_sessions read on the anon key plus a second read of
          // astrologers; the server does both now so the chat_sessions grant can be
          // revoked (it is one of the last two tables that key can still read).
          const records = await getMySessions(callTypes);
          if (!active) return;
          setData(records.map(item => formatSession(item, item.astrologer)));

          // The two Realtime subscriptions that used to live here (INSERT and UPDATE on
          // chat_sessions, filtered to this customer) are GONE. They cannot survive RLS
          // being enabled on that table, and this is a history list: useFocusEffect
          // already re-runs this whole load every time the screen is focused, so a
          // session that started or ended while the customer was elsewhere is there when
          // they come back. The only behaviour lost is a row changing while they sit on
          // this screen, which for a past-sessions list is not worth a second websocket
          // to Supabase.
        } catch (e) {
          console.log('[MySessionScreen] load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      load();

      return () => { active = false; };
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
