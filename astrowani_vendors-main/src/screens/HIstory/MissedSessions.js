import React, {useState, useCallback, useContext, useEffect} from 'react';
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
import {getMissedSessions} from '../../api/SessionApi';
import {COLORS} from '../../Theme/Colors';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';

// Each tab now says which rows of the ONE merged missed list it keeps, rather than
// which table to read and under which column name. The read itself is
// GET /api/vendor/missed (astrowani-backend/src/sessionReadRoutes.js), because
// chat_requests is one of the last two tables the publishable key in this APK can still
// read and that grant is being revoked.
const TABS = [
  {key: 'chat',  labelKey: 'sessionHistory.chat',      icon: 'chatbubble-outline',
   keep: m => m.kind === 'chat'},
  {key: 'audio', labelKey: 'sessionHistory.audioCall', icon: 'call-outline',
   keep: m => m.kind === 'call' && m.callType !== 'video'},
  {key: 'video', labelKey: 'sessionHistory.videoCall', icon: 'videocam-outline',
   keep: m => m.kind === 'call' && m.callType === 'video'},
];

const fmtTime = ts =>
  ts
    ? new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '';

const TabContent = ({tab}) => {
  const {t} = useContext(LanguageContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          // One request for calls AND chats, merged and sorted by the server; this tab
          // keeps its own slice. The astrologer comes from the token, so astroId is no
          // longer part of the query.
          const missed = await getMissedSessions({limit: 100});
          if (!active) return;
          setRows(missed.filter(tab.keep));

          // The Realtime UPDATE subscription that used to live here is GONE: it cannot
          // survive RLS being enabled on chat_requests, and useFocusEffect already
          // re-runs this load every time the screen is focused, which is when a missed
          // session needs to appear. Nothing arrives while an astrologer stares at their
          // own missed list that is worth a second websocket to Supabase.
        } catch (e) {
          console.log('[MissedSessions] load error:', e);
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }, [tab.keep]),
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
            <Text style={styles.name}>{item.name || t('common.customer')}</Text>
            <Text style={styles.time}>{fmtTime(item.createdAt)}</Text>
          </View>
          <View style={styles.missedPill}>
            <Ionicons name="close-circle" size={14} color="#fff" />
            <Text style={styles.missedText}>{t('missed.missed')}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-done-circle-outline" size={52} color="#ccc" />
          <Text style={styles.emptyText}>{t('missed.noMissed')}</Text>
          <Text style={styles.emptySubText}>{t('missed.noMissedSub')}</Text>
        </View>
      }
    />
  );
};

export default function MissedSessions() {
  const {t} = useContext(LanguageContext);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    // Opening the screen clears the drawer's "new missed" badge.
    AsyncStorage.setItem('missed_seen_at', new Date().toISOString());
  }, []);

  const tab = TABS[activeTab];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((tabItem, i) => {
          const active = i === activeTab;
          return (
            <TouchableOpacity
              key={tabItem.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(i)}
              activeOpacity={0.75}>
              <Ionicons name={tabItem.icon} size={18} color={active ? COLORS.AstroMaroon : '#999'} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tabItem.labelKey)}</Text>
              {active && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TabContent key={tab.key} tab={tab} />
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
