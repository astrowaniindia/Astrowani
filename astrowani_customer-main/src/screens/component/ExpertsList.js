import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import io from 'socket.io-client';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../api/SupabaseClient';
import { SOCKET_URL } from '../../config/api';
import useChatRequest from '../../hooks/useChatRequest';
import RequestingPopup from '../../components/RequestingPopup';
import { showStatusPopup } from '../../components/StatusPopup';
import StarRating from '../../components/StarRating';
import { ensureProfileComplete } from '../../utils/profileGate';

// Shared detailed astrologer card used by the category screens. Shows the full
// profile (avatar, rating, name, specialty, languages, experience, price) plus
// THREE vertical action buttons (Chat / Call / Video) reflecting service toggles.
//
// Each button fires its request DIRECTLY (no profile redirect): chat via the
// shared useChatRequest hook, audio/video via a self-contained call flow (same
// proven pattern as AstrologerInfo — fresh socket per call, wallet check,
// call_requests insert, Realtime backup, 45s timeout, vendor-cancel sync).
const ExpertsList = ({ data, refreshing, onRefresh, showSearch = true }) => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');

  // Chat flow (shared hook owns its own RequestingPopup state)
  const { requesting, requestAstro, sendChatRequest, cancelRequest } = useChatRequest(navigation);

  // Audio/Video call flow (self-contained)
  const [isCallWaiting, setIsCallWaiting] = useState(false);
  const [waitingAstro, setWaitingAstro] = useState(null);
  const callSocketRef = useRef(null);
  const activeCallRef = useRef(null); // { requestId, astrologerId, roomId } while a call is pending

  const filteredData = React.useMemo(() => {
    if (!searchQuery || !data) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(item => {
      const nameMatch = item.name?.toLowerCase().includes(q);
      const specMatch = item.specialties?.[0]?.name?.toLowerCase().includes(q);
      return nameMatch || specMatch;
    });
  }, [data, searchQuery]);

  // Card body tap → view profile (no auto-action)
  const goProfile = item => navigation.navigate('AstrologerInfo', { person: item });

  const showUnavailable = (item, label) =>
    Alert.alert('Unavailable', `${item.name || 'This astrologer'} is not available for ${label} right now.`);

  // Tell the vendor the customer abandoned the pending request (dismisses their popup).
  const notifyVendorCancelled = (status = 'cancelled') => {
    const active = activeCallRef.current;
    activeCallRef.current = null;
    if (!active?.requestId) return;
    if (status !== 'rejected') {
      supabase.from('call_requests').update({ status }).eq('id', active.requestId).then(() => {}, () => {});
    }
    callSocketRef.current?.emit('cancel_call', {
      astrologer_id: active.astrologerId,
      requestId: active.requestId,
      roomId: active.roomId,
    });
  };

  const cancelCallRequest = () => {
    notifyVendorCancelled();
    setIsCallWaiting(false);
    if (callSocketRef.current) {
      callSocketRef.current.removeAllListeners();
      callSocketRef.current.disconnect();
      callSocketRef.current = null;
    }
  };

  // If the user leaves the screen with a pending call, dismiss the vendor's popup.
  useEffect(() => () => {
    if (activeCallRef.current) {
      notifyVendorCancelled();
      if (callSocketRef.current) {
        callSocketRef.current.disconnect();
        callSocketRef.current = null;
      }
    }
  }, []);

  // Self-contained audio/video initiation (type = 'audio' | 'video').
  const initiateCall = async (item, type) => {
    try {
      if (!(await ensureProfileComplete(navigation))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert('Error', 'Please login to continue.');
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = type === 'video'
        ? (item.videoPrice || item.chargePerMinute || item.pricing || 15)
        : (item.chargePerMinute || item.pricing || 15);
      const minRequired = pricePerMin * 5;

      const { data: customer, error: walletErr } = await supabase
        .from('customers').select('wallet_balance').eq('id', userEntireData.id).single();
      if (walletErr) {
        Alert.alert('Error', 'Failed to verify wallet balance.');
        return;
      }
      if (customer.wallet_balance < minRequired) {
        Alert.alert(
          'Insufficient Balance',
          `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`,
        );
        return;
      }

      setWaitingAstro(item);
      setIsCallWaiting(true);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        { receiverId: item.userId, callType: type, callerRole: 'customer' },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status !== 200) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to initiate call.');
        return;
      }

      const callerToken = response.data.data?.token?.token || response.data.token?.token || response.data.token;
      const vendorToken = response.data.data?.vendorToken || response.data.vendorToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId = response.data.data?.sessionId || response.data.sessionId;

      const { data: requestData, error: reqErr } = await supabase
        .from('call_requests').insert([{
          customer_id: userEntireData.id,
          astrologer_id: item.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: type,
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }]).select().single();
      if (reqErr) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to send call request.');
        return;
      }

      activeCallRef.current = { requestId: requestData.id, astrologerId: item.userId, roomId };

      const sock = io(SOCKET_URL);
      callSocketRef.current = sock;
      sock.on('connect', () => {
        sock.emit('join_room', userEntireData.id);
        sock.emit('initiate_call', {
          astrologer_id: item.userId,
          callType: type,
          callerName: userEntireData.name || 'Customer',
          callerId: userEntireData.id,
          roomId,
          vendorToken,
          requestId: requestData.id,
        });
      });

      let navigated = false;
      const screen = type === 'video' ? 'VideoCallScreen' : 'VoiceCallScreen';
      const teardown = () => {
        try { supabase.removeChannel(channel); } catch (_) {}
        sock.removeAllListeners();
        sock.disconnect();
        callSocketRef.current = null;
      };
      const goToCall = dbSessionId => {
        if (navigated) return;
        navigated = true;
        activeCallRef.current = null;
        teardown();
        setIsCallWaiting(false);
        navigation.navigate(screen, {
          token: callerToken,
          sessionId: dbSessionId || backendSessionId,
          recieverName: item.name,
          recieverImage: item.profileImage || '',
          recieverId: item.userId || item._id,
        });
      };
      const declineCleanup = msg => {
        if (navigated) return;
        navigated = true;
        activeCallRef.current = null;
        teardown();
        setIsCallWaiting(false);
        if (msg) showStatusPopup({ variant: 'busy', title: 'Astrologer Busy', message: msg });
      };

      sock.once('call_accepted', d => goToCall(d.sessionId));
      sock.on('call_rejected', () => declineCleanup('Astrologer is busy right now. Please try again after some time.'));

      const channel = supabase
        .channel(`experts_call_${requestData.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'call_requests', filter: `id=eq.${requestData.id}` },
          payload => {
            if (payload.new.status === 'accepted') goToCall(payload.new.session_id);
            else if (payload.new.status === 'rejected') declineCleanup('Astrologer is busy right now. Please try again after some time.');
          },
        )
        .subscribe();

      // Auto-cancel after 1 minute if the vendor doesn't respond → missed call
      setTimeout(() => {
        if (!navigated) {
          navigated = true;
          notifyVendorCancelled('missed');
          teardown();
          setIsCallWaiting(false);
          showStatusPopup({ variant: 'missed', title: 'Not Answered', message: `Your ${type === 'video' ? 'video call' : 'audio call'} was not picked up. Please try again later.` });
        }
      }, 60000);
    } catch (err) {
      setIsCallWaiting(false);
      console.error('[ExpertsList] initiateCall error:', err);
      Alert.alert('Error', 'Failed to initiate call. Please try again.');
    }
  };

  const handlers = {
    chat: item => sendChatRequest(item),
    call: item => initiateCall(item, 'audio'),
    video: item => initiateCall(item, 'video'),
  };

  const ActionButton = ({ item, kind }) => {
    const config = {
      chat: { enabled: item.isChatEnabled, icon: 'chat', offIcon: 'speaker-notes-off', label: 'Chat', color: COLORS.AstroMaroon },
      call: { enabled: item.isCallEnabled, icon: 'call', offIcon: 'phone-disabled', label: 'Call', color: COLORS.green },
      video: { enabled: item.isVideoEnabled, icon: 'videocam', offIcon: 'videocam-off', label: 'Video', color: '#2D6CDF' },
    }[kind];

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.actionBtn, { backgroundColor: config.enabled ? config.color : '#C0392B' }]}
        onPress={() => (config.enabled ? handlers[kind](item) : showUnavailable(item, config.label.toLowerCase()))}
      >
        <MaterialIcons name={config.enabled ? config.icon : config.offIcon} size={moderateScale(16)} color="#fff" />
        <Text style={styles.actionBtnText}>{config.enabled ? config.label : 'Off'}</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => {
    const languages = item.language?.join?.(', ') || item.language;
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => goProfile(item)}>
        <View style={styles.row}>
          <View style={styles.imageCol}>
            <Image
              source={{ uri: item.profileImage || 'https://th.bing.com/th/id/OIP.xHU435DrZMf0aN-ri48zEAHaJQ?w=126&h=180&c=7&r=0&o=5&pid=1.7' }}
              style={styles.avatar}
            />
            <StarRating
              rating={item?.rating}
              totalReviews={item?.totalReviews}
              size={12}
              style={styles.starsContainer}
            />
          </View>

          <View style={styles.details}>
            <Text style={styles.name} numberOfLines={1}>{item.name || 'Astrologer'}</Text>
            <Text style={styles.specialization} numberOfLines={1}>
              {item.specialties?.[0]?.name || 'Vedic Astrology'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              <MaterialIcons name="language" size={moderateScale(11)} color={COLORS.AstroMaroon} /> {languages || 'Hindi'}
            </Text>
            <Text style={styles.meta}>
              <MaterialIcons name="work-outline" size={moderateScale(11)} color={COLORS.AstroMaroon} /> Exp: {item.experience ?? '0'} yrs
            </Text>
            <Text style={styles.offer}>{item.pricing ? `₹${item.pricing}/min` : 'Free'}</Text>
          </View>

          <View style={styles.actionsCol}>
            <ActionButton item={item} kind="chat" />
            <ActionButton item={item} kind="call" />
            <ActionButton item={item} kind="video" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.AstroSoftOrange }}>
      {showSearch && (
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={moderateScale(22)} color={COLORS.AstroMaroon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search astrologer by name or skill..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={COLORS.AshGray}
          />
        </View>
      )}
      <FlatList
        data={filteredData}
        keyExtractor={item => String(item._id)}
        renderItem={renderItem}
        contentContainerStyle={styles.container}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialIcons name="person-search" size={moderateScale(34)} color={COLORS.AstroMaroon} />
            <Text style={styles.emptyTxt}>No astrologers found.</Text>
          </View>
        }
      />

      {/* Chat request popup (driven by useChatRequest) */}
      <RequestingPopup visible={requesting} astro={requestAstro} onCancel={cancelRequest} />

      {/* Audio/Video call waiting popup */}
      <RequestingPopup visible={isCallWaiting} astro={waitingAstro} onCancel={cancelCallRequest} />
    </View>
  );
};

export default ExpertsList;

const styles = StyleSheet.create({
  container: { padding: scale(15), paddingBottom: verticalScale(85) },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    margin: scale(15), marginBottom: scale(5), borderRadius: moderateScale(25),
    paddingHorizontal: scale(15), elevation: 4, shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(89, 42, 25, 0.1)',
  },
  searchInput: {
    flex: 1, height: verticalScale(45), marginLeft: scale(10),
    color: COLORS.AstroMaroon, fontFamily: 'Lato-Regular', fontSize: moderateScale(15),
  },
  card: {
    backgroundColor: '#fff', borderRadius: moderateScale(16), padding: scale(12),
    marginBottom: verticalScale(15), elevation: 5, shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10,
    borderWidth: 1, borderColor: 'rgba(244, 216, 188, 0.5)',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  imageCol: { alignItems: 'center', width: scale(72), marginRight: scale(6) },
  avatar: {
    width: scale(64), height: scale(64), borderRadius: scale(32),
    borderWidth: 2, borderColor: COLORS.AstroGold,
  },
  starsContainer: { flexDirection: 'row', marginTop: verticalScale(4) },
  details: { flex: 1, justifyContent: 'center' },
  name: { fontSize: moderateScale(16), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontWeight: '700' },
  specialization: { fontSize: moderateScale(12.5), color: COLORS.ARSENIC, fontFamily: 'Lato-Regular', marginBottom: verticalScale(3) },
  meta: { fontSize: moderateScale(11.5), fontFamily: 'Lato-Regular', color: '#666', marginBottom: verticalScale(2) },
  offer: { fontSize: moderateScale(13), color: COLORS.green, fontFamily: 'Lato-Bold', fontWeight: 'bold', marginTop: verticalScale(3) },
  actionsCol: { justifyContent: 'center', marginLeft: scale(4) },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: moderateScale(20), paddingHorizontal: scale(12), paddingVertical: verticalScale(7),
    marginVertical: verticalScale(3), minWidth: scale(86),
  },
  actionBtnText: { color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(12.5), fontWeight: 'bold', marginLeft: scale(4) },
  emptyBox: { alignItems: 'center', marginTop: verticalScale(60) },
  emptyTxt: { color: COLORS.AstroMaroon, fontSize: moderateScale(15), marginTop: verticalScale(10), fontFamily: 'Lato-Regular' },
});
