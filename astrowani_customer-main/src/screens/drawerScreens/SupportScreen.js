// Help & Support — the hub.
//
// WHAT THIS REPLACES. A form asking for name, email, issue type and message,
// inside an app the customer is already logged into, which posted one ticket to
// a backend with no reply path. Nothing ever came back. The customer could not
// see whether anyone had read it, and the admin's answer (support_tickets.
// admin_note) was never shown anywhere in the app.
//
// Now: one tap into a conversation that answers immediately and brings in a
// person when it matters, plus every past conversation with its current state —
// so "did anyone see my problem" is answered by looking, not by asking again.
//
// The old ticket form is gone rather than kept alongside. Two support entry
// points, one of which silently goes nowhere, is worse than one.
import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';

// Plain-language state, never the internal status string. A customer should not
// have to learn our vocabulary to know whether someone is coming.
const STATE = {
  // Headset, matching the bot's avatar in the thread. A sparkle read as "AI
  // magic", which is the wrong promise for a fixed set of written answers.
  bot: { key: 'stateBot', color: '#8a7c76', icon: 'headset' },
  awaiting_human: { key: 'stateAwaiting', color: '#E67E22', icon: 'time-outline' },
  human: { key: 'stateHuman', color: '#1a8f4c', icon: 'person' },
  resolved: { key: 'stateResolved', color: '#1a8f4c', icon: 'checkmark-circle' },
  closed: { key: 'stateClosed', color: '#9b8f8a', icon: 'archive-outline' },
};

export default function SupportScreen({ navigation }) {
  const { t } = useContext(LanguageContext);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Instance does not attach the token itself — see SupportChatScreen's auth().
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/support/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(res?.data?.data || []);
    } catch (_) {
      // A failed list must not block starting a new conversation — that is the
      // one thing on this screen that always has to work.
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => navigation.navigate('SupportChat');
  const openOne = (id) => navigation.navigate('SupportChat', { conversationId: id });

  const renderItem = ({ item }) => {
    const s = STATE[item.status] || STATE.bot;
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openOne(item.id)}>
        <View style={[styles.cardIcon, { backgroundColor: `${s.color}1A` }]}>
          <Ionicons name={s.icon} size={moderateScale(18)} color={s.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.subject || t(`support.category.${item.category || 'other'}`)}
          </Text>
          <Text style={[styles.cardState, { color: s.color }]}>{t(`support.${s.key}`)}</Text>
        </View>
        <Text style={styles.cardWhen}>
          {item.last_message_at ? new Date(item.last_message_at).toLocaleDateString() : ''}
        </Text>
        <Ionicons name="chevron-forward" size={moderateScale(18)} color="#c4b5ad" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.AstroMaroon]} tintColor={COLORS.AstroMaroon} />
        }
        ListHeaderComponent={
          <>
            <TouchableOpacity style={styles.hero} activeOpacity={0.9} onPress={openNew}>
              <View style={styles.heroIcon}>
                <Ionicons name="chatbubble-ellipses" size={moderateScale(24)} color={COLORS.AstroMaroon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>{t('support.heroTitle')}</Text>
                <Text style={styles.heroSub}>{t('support.heroSub')}</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={moderateScale(28)} color="#fff" />
            </TouchableOpacity>

            <View style={styles.assureRow}>
              <Ionicons name="shield-checkmark-outline" size={moderateScale(15)} color="#1a8f4c" />
              <Text style={styles.assureText}>{t('support.assurance')}</Text>
            </View>

            {rows.length > 0 && <Text style={styles.sectionTitle}>{t('support.pastTitle')}</Text>}
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}><ActivityIndicator color={COLORS.AstroMaroon} /></View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('support.noneYet')}</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f3f1' },
  list: { padding: scale(16), paddingBottom: verticalScale(30) },
  center: { paddingVertical: verticalScale(40), alignItems: 'center' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(18),
    padding: scale(16),
  },
  heroIcon: {
    width: scale(46), height: scale(46), borderRadius: scale(23),
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    marginRight: scale(12),
  },
  heroTitle: { color: '#fff', fontSize: moderateScale(16), fontWeight: 'bold' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(12), marginTop: verticalScale(3), lineHeight: moderateScale(17) },

  assureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(12),
    paddingHorizontal: scale(4),
  },
  assureText: { marginLeft: scale(7), fontSize: moderateScale(11.5), color: '#6b574d', flex: 1, lineHeight: moderateScale(16) },

  sectionTitle: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#5c4a42',
    marginTop: verticalScale(22),
    marginBottom: verticalScale(10),
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(13),
    marginBottom: verticalScale(9),
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },
  cardIcon: {
    width: scale(36), height: scale(36), borderRadius: scale(18),
    alignItems: 'center', justifyContent: 'center',
    marginRight: scale(11),
  },
  cardTitle: { fontSize: moderateScale(13.5), color: '#2b1a12', fontWeight: '600' },
  cardState: { fontSize: moderateScale(11.5), marginTop: verticalScale(2), fontWeight: '600' },
  cardWhen: { fontSize: moderateScale(10.5), color: '#a8998f', marginRight: scale(6) },

  empty: { paddingVertical: verticalScale(30), alignItems: 'center' },
  emptyText: { fontSize: moderateScale(12.5), color: '#8a7c76', textAlign: 'center' },
});
