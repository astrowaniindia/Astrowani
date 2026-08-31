// "My Free Calls" — the free 12-minute introductory calls an admin has assigned
// to THIS astrologer.
//
// The astrologer rings the customer INSIDE THE APP -- the same WebRTC audio call
// the paid consultations use, not the phone dialler. It runs on a real
// chat_sessions row (which is what authorises the socket session room), but that
// row is created is_free with per_minute_charge 0 and the billing loop skips it,
// so nobody is charged and nobody is paid. See freeCallRoutes.js's ring endpoint.
//
// The list is scoped server-side by the astrologer id inside the vendor JWT
// (GET /api/vendor/free-call-bookings) — never by anything this screen sends —
// because the rows carry customers' phone numbers.
//
// Deliberately NOT here: rescheduling or cancelling. Moving a customer's
// appointment is a conversation the admin has with them, not a button here.
import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

// Slot instants are always shown in IST, the offer's business timezone — the same
// clock time the customer was shown when they booked, regardless of the phone's
// own timezone.
const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
});
const dayFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short',
});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

const FreeCalls = () => {
  const navigation = useNavigation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/vendor/free-call-bookings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setBookings(res.data.bookings || []);
    } catch (e) {
      console.log('[FreeCalls] load failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Start the call. The server mints the session and rings the customer's app; we
  // then walk onto the normal audio call screen and wait for them to accept, exactly
  // as an incoming paid call does -- so there is one call screen in this app, not two.
  const callNow = async (item) => {
    setBusyId(item.id);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        `/api/vendor/free-call-bookings/${item.id}/ring`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.data?.success || !res.data.sessionId) {
        Alert.alert('Could not start the call', res.data?.message || 'Please try again.');
        return;
      }
      const minutes = res.data.durationMinutes || item.durationMinutes || 12;
      navigation.navigate('AudioCall', {
        sessionId: res.data.sessionId,
        callerName: res.data.customerName || item.customerName || 'Customer',
        perMinuteCharge: 0,
        freeCall: true,
        freeCallSeconds: minutes * 60,
      });
    } catch (e) {
      // The server refuses for reasons the astrologer can act on (the customer is
      // already on another call, they themselves are mid-session), so show what it
      // said rather than a generic failure.
      Alert.alert(
        'Could not start the call',
        e.response?.data?.message || e.message || 'Please try again.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const mark = (item, status) => {
    const label = status === 'completed' ? 'done' : 'missed';
    Alert.alert(
      `Mark as ${label}?`,
      `${item.customerName || 'This customer'} — ${timeFmt.format(new Date(item.slotStart))}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Yes, ${label}`,
          onPress: async () => {
            setBusyId(item.id);
            try {
              const token = await AsyncStorage.getItem('token');
              await Instance.patch(
                `/api/vendor/free-call-bookings/${item.id}`,
                { status },
                { headers: { Authorization: `Bearer ${token}` } },
              );
              setBookings((prev) => prev.map((b) => (b.id === item.id ? { ...b, status } : b)));
            } catch (e) {
              Alert.alert('Could not update', e.response?.data?.message || e.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  // Upcoming calls are the job; everything else is history. Split rather than
  // sorted, so a call that is due in 20 minutes can never be buried under a week
  // of completed ones.
  const { upcoming, history } = useMemo(() => {
    const up = [];
    const hist = [];
    bookings.forEach((b) => {
      if (b.status === 'booked' && !b.isPast) up.push(b);
      else hist.push(b);
    });
    hist.sort((a, b) => new Date(b.slotStart) - new Date(a.slotStart));
    return { upcoming: up, history: hist };
  }, [bookings]);

  const todayKey = dayKeyFmt.format(new Date());

  const renderCard = (item) => {
    const start = new Date(item.slotStart);
    const isToday = dayKeyFmt.format(start) === todayKey;
    const done = item.status === 'completed';
    const missed = item.status === 'missed';
    const overdue = item.status === 'booked' && item.isPast;

    return (
      <View style={[styles.card, overdue && styles.cardOverdue]}>
        <View style={styles.cardTop}>
          <View style={styles.when}>
            <Text style={styles.time}>{timeFmt.format(start)}</Text>
            <Text style={styles.day}>
              {isToday ? 'Today' : dayFmt.format(start)}
            </Text>
          </View>
          <View style={styles.tags}>
            <View style={styles.freeTag}>
              <Text style={styles.freeTagTxt}>{item.durationMinutes} MIN · FREE</Text>
            </View>
            {done && <Text style={[styles.state, styles.stateDone]}>Done</Text>}
            {missed && <Text style={[styles.state, styles.stateMissed]}>Missed</Text>}
            {overdue && <Text style={[styles.state, styles.stateOverdue]}>Time passed</Text>}
          </View>
        </View>

        <Text style={styles.name}>{item.customerName || 'Customer'}</Text>
        <Text style={styles.phone}>
          {item.customerPhone ? `${item.customerPhone} · rings in their app` : 'Rings in their app'}
        </Text>
        {!!item.adminNote && <Text style={styles.note}>Note: {item.adminNote}</Text>}

        {item.status === 'booked' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.callBtn, busyId === item.id && styles.callBtnBusy]}
              activeOpacity={0.85}
              disabled={busyId === item.id}
              onPress={() => callNow(item)}>
              <Icon name="call" size={moderateScale(17)} color="#fff" />
              <Text style={styles.callTxt}>
                {busyId === item.id ? 'Calling…' : 'Call now'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secBtn}
              activeOpacity={0.85}
              disabled={busyId === item.id}
              onPress={() => mark(item, 'completed')}>
              <Text style={styles.secTxt}>Mark done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secBtn}
              activeOpacity={0.85}
              disabled={busyId === item.id}
              onPress={() => mark(item, 'missed')}>
              <Text style={styles.secTxt}>No answer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  const sections = [
    { key: 'upcoming', title: 'Upcoming', data: upcoming },
    { key: 'history', title: 'Earlier', data: history },
  ].filter((s) => s.data.length > 0);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sections}
      keyExtractor={(s) => s.key}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          colors={[COLORS.AstroMaroon]}
        />
      }
      ListHeaderComponent={
        <Text style={styles.intro}>
          Free introductory calls assigned to you. Ring the customer yourself at the time
          shown — there is nothing for them to join.
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="event-available" size={moderateScale(40)} color="#C9B2A2" />
          <Text style={styles.emptyTxt}>No free calls assigned to you yet.</Text>
        </View>
      }
      renderItem={({ item: section }) => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {section.title} ({section.data.length})
          </Text>
          {section.data.map((b) => (
            <View key={b.id}>{renderCard(b)}</View>
          ))}
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FBF6F1' },
  content: { padding: scale(14), paddingBottom: verticalScale(30), flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF6F1' },
  intro: {
    fontSize: moderateScale(12.5),
    color: '#7A6055',
    lineHeight: moderateScale(18),
    marginBottom: verticalScale(12),
  },
  section: { marginBottom: verticalScale(8) },
  sectionTitle: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#A98A72',
    marginBottom: verticalScale(6),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(14),
    marginBottom: verticalScale(10),
    borderWidth: 1,
    borderColor: '#EEE2D8',
    elevation: 1,
  },
  cardOverdue: { borderColor: '#E5B4A8' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  when: { flex: 1 },
  time: { fontSize: moderateScale(20), fontWeight: '800', color: COLORS.AstroMaroon },
  day: { fontSize: moderateScale(12), color: '#8A6A55', marginTop: verticalScale(1) },
  tags: { alignItems: 'flex-end', gap: verticalScale(4) },
  freeTag: {
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
  },
  freeTagTxt: {
    fontSize: moderateScale(9),
    fontWeight: '800',
    color: COLORS.AstroMaroon,
    letterSpacing: 0.5,
  },
  state: { fontSize: moderateScale(10.5), fontWeight: '700' },
  stateDone: { color: '#2E7D32' },
  stateMissed: { color: '#B3261E' },
  stateOverdue: { color: '#C0392B' },
  name: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#2E1A10',
    marginTop: verticalScale(10),
  },
  phone: { fontSize: moderateScale(13), color: '#6B5347', marginTop: verticalScale(2) },
  note: {
    fontSize: moderateScale(12),
    color: '#8A6A55',
    marginTop: verticalScale(6),
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(12) },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    backgroundColor: '#2E7D32',
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(9),
  },
  callBtnBusy: { opacity: 0.6 },
  callTxt: { color: '#fff', fontWeight: '700', fontSize: moderateScale(13) },
  secBtn: {
    borderWidth: 1,
    borderColor: '#E2D3C7',
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(11),
    paddingVertical: verticalScale(9),
    justifyContent: 'center',
  },
  secTxt: { color: COLORS.AstroMaroon, fontWeight: '600', fontSize: moderateScale(12) },
  empty: { alignItems: 'center', paddingTop: verticalScale(70), gap: verticalScale(10) },
  emptyTxt: { fontSize: moderateScale(13.5), color: '#8A6A55' },
});

export default FreeCalls;
