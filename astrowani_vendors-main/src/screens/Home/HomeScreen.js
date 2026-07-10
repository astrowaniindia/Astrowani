// HomeScreen.js — Vendor side
// Listens via Supabase Realtime for incoming chat/call requests
// Shows NotificationPopup → Accept navigates to session screen, Reject updates status
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ToastAndroid,
  BackHandler,
  Animated,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationPopup from '../notificationPopup';
import showToast from '../../utils/showToast';
import { supabase } from '../../api/SupabaseClient';
import io from 'socket.io-client';
import { SOCKET_URL } from '../../config/api';
import MissedSessionsHome from '../../components/MissedSessionsHome';
import HomeBanner from '../../components/HomeBanner';
import { isVendorProfileComplete, ensureVendorProfileComplete } from '../../utils/vendorProfile';

// On-brand animated toggle (replaces the default RN Switch for a cleaner look).
const ServiceToggle = ({ value, onValueChange }) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: ['#E2E2E6', COLORS.green] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 25] });

  return (
    <Pressable onPress={() => onValueChange(!value)} hitSlop={8}>
      <Animated.View style={[toggleStyles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[toggleStyles.thumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </Animated.View>
    </Pressable>
  );
};

const toggleStyles = StyleSheet.create({
  track: {
    width: scale(52),
    height: verticalScale(30),
    borderRadius: moderateScale(16),
    justifyContent: 'center',
  },
  thumb: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#fff',
    position: 'absolute',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
});

const HomeScreen = () => {
  const navigation = useNavigation();
  const socketRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [callEnabled, setCallEnabled] = useState(true);
  const [videoCallEnabled, setVideoCallEnabled] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [charges, setCharges] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [user, setUser] = useState(null);
  // Profile-completion gate: when false the dashboard's actions are locked.
  const [profileComplete, setProfileComplete] = useState(true);

  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState(null);

  const channelRef = useRef(null);

  useEffect(() => {
    console.log('[Vendor] Connecting socket to:', SOCKET_URL);
    socketRef.current = io(SOCKET_URL);
    socketRef.current.on('connect', () => {
      console.log('[Vendor] Socket connected:', socketRef.current.id);
    });
    socketRef.current.on('connect_error', (err) => {
      // Transient (e.g. backend waking up) — log as warning so it doesn't throw a dev redbox.
      console.log('[Vendor] Socket connection error (will retry):', err.message);
    });
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // ─── Back handler ──────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // Dismiss the incoming-call popup if the cancellation/update refers to the request
  // currently being shown. Uses a functional updater so it never reads stale popup state.
  const dismissPopupIfMatches = (data) => {
    // Accept both camelCase (Realtime-derived) and snake_case (socket payload) keys.
    const reqId = data.requestId || data.request_id;
    const roomId = data.roomId || data.room_id;
    const callerId = data.callerId || data.caller_id;
    setPopupData((prev) => {
      if (!prev) return prev;
      const matches =
        (reqId && prev.requestId && reqId === prev.requestId) ||
        (roomId && prev.roomId && roomId === prev.roomId) ||
        (callerId && prev.callerId && callerId === prev.callerId);
      if (matches) {
        setPopupVisible(false);
        ToastAndroid.show('Caller cancelled the request', ToastAndroid.SHORT);
        return null;
      }
      return prev;
    });
  };

  // ─── Supabase Realtime listener for incoming requests ─────────────────────
  const initRequestListener = async () => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;

    if (socketRef.current) {
      console.log('Emitting join_room for vendor/astrologer:', astroId);
      socketRef.current.emit('join_room', astroId);

      // Socket path: fast notification for the popup (does NOT navigate directly — handleAccept does that)
      socketRef.current.off('incoming_call'); // prevent duplicate listeners on re-init
      socketRef.current.on('incoming_call', (data) => {
        console.log('[Vendor] Socket incoming_call received:', data);
        setPopupData({
          requestId: data.requestId || null,
          callType: data.callType || 'audio',
          callerName: data.callerName || 'Customer',
          callerId: data.callerId,
          token: data.vendorToken,
          table: 'call_requests',
          roomId: data.roomId,
          sessionId: data.sessionId || null, // pre-generated by backend — same UUID customer has
        });
        setPopupVisible(true);
      });

      // Customer cancelled/abandoned the pending call → dismiss the popup if it's the one showing.
      socketRef.current.off('call_cancelled');
      socketRef.current.on('call_cancelled', (data) => {
        console.log('[Vendor] Socket call_cancelled received:', data);
        dismissPopupIfMatches(data);
      });
    }

    // Remove any existing channel
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    channelRef.current = supabase.channel(`incoming_requests_${astroId}`);
    channelRef.current
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_requests',
          filter: `receiver_id=eq.${astroId}`,
        },
        (payload) => {
          const req = payload.new;
          console.log('Incoming chat request:', req);
          setPopupData({
            requestId: req.id,
            callType: req.request_type || 'chat',
            callerName: req.caller_name || 'Customer',
            callerId: req.caller_id,
            table: 'chat_requests',
          });
          setPopupVisible(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_requests',
          filter: `astrologer_id=eq.${astroId}`,
        },
        (payload) => {
          const req = payload.new;
          console.log('Incoming call request:', req);
          setPopupData({
            requestId: req.id,
            callType: req.call_type || 'audio',
            callerName: req.customer_name || 'Customer',
            callerId: req.customer_id,
            token: req.room_token,
            table: 'call_requests',
            roomId: req.room_id,
            sessionId: req.session_id || null, // stored by customer at insert time
          });
          setPopupVisible(true);
        }
      )
      .on(
        // Realtime backup for cancellation — if the customer marks the request
        // cancelled (or it leaves 'pending'), dismiss the popup if it's the one showing.
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_requests',
          filter: `astrologer_id=eq.${astroId}`,
        },
        (payload) => {
          const req = payload.new;
          if (req && req.status && req.status !== 'pending' && req.status !== 'accepted') {
            dismissPopupIfMatches({ requestId: req.id, roomId: req.room_id, callerId: req.customer_id });
          }
        }
      )
      .subscribe();
  };

  // ─── Accept ───────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    setPopupVisible(false);
    const req = popupData;
    if (!req) return;

    // Safety net: an incomplete profile shouldn't be visible to customers, but
    // guard acceptance too so a stray request can't start a session.
    if (!profileComplete) { ensureVendorProfileComplete(navigation); return; }

    try {
      const targetTable = req.table || 'chat_requests';
      const astroId = await AsyncStorage.getItem('astroId');

      // If popup came from socket (no requestId), look up the pending call_request by roomId
      let resolvedRequestId = req.requestId;
      if (!resolvedRequestId && req.roomId && targetTable === 'call_requests') {
        const { data: pendingRow } = await supabase
          .from('call_requests')
          .select('id')
          .eq('room_id', req.roomId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        resolvedRequestId = pendingRow?.id || null;
      }

      // Guard: for call requests, verify the row is still pending (only if we found it).
      // If resolvedRequestId is null, the customer's call_requests row may not exist yet
      // (backend sends incoming_call socket BEFORE customer inserts the row) — don't abort.
      if (targetTable === 'call_requests' && resolvedRequestId) {
        const { data: statusRow } = await supabase
          .from('call_requests')
          .select('status')
          .eq('id', resolvedRequestId)
          .single();
        if (!statusRow || statusRow.status !== 'pending') {
          ToastAndroid.show('Caller cancelled the request', ToastAndroid.SHORT);
          return;
        }
      }

      const { data: astroData } = await supabase
        .from('astrologers')
        .select('chat_charge_per_minute, call_charge_per_minute, video_charge_per_minute')
        .eq('id', astroId)
        .single();

      const perMinuteCharge =
        req.callType === 'chat'
          ? astroData?.chat_charge_per_minute ?? 0
          : req.callType === 'video'
          ? astroData?.video_charge_per_minute ?? 0
          : astroData?.call_charge_per_minute ?? 0;

      // Create session using the pre-generated UUID from backend (req.sessionId).
      // Using the same UUID the customer already has ensures billing RPC and socket
      // events reference the same row on both sides.
      const sessionInsertPayload = {
        request_id: targetTable === 'chat_requests' ? resolvedRequestId : null,
        per_minute_charge: perMinuteCharge,
        vendor_id: astroId,
        caller_id: req.callerId,
        started_at: new Date().toISOString(),
        call_type: req.callType || 'chat',
        room_id: req.roomId || null,
        call_request_id: targetTable === 'call_requests' ? resolvedRequestId : null,
        is_active: false,
        next_billing_at: null,
      };
      if (req.sessionId) {
        sessionInsertPayload.id = req.sessionId;
      }
      const { data: sessionData, error: sessionErr } = await supabase
        .from('chat_sessions')
        .insert([sessionInsertPayload])
        .select('id')
        .single();

      if (sessionErr) throw sessionErr;
      const sessionId = sessionData?.id;

      // (The customer's ChatSessionScreen posts the automatic "customer details" first
      //  message on connect — see sendCustomerDetails there — so we don't insert it here
      //  to avoid a duplicate.)

      // Update status + session_id so customer's Supabase Realtime gets the real session UUID.
      // Falls back to status-only if session_id column doesn't exist yet (pre-migration).
      if (resolvedRequestId) {
        const fullPayload = { status: 'accepted' };
        if (targetTable === 'call_requests' && sessionId) {
          fullPayload.session_id = sessionId;
        }
        const { error: updateErr } = await supabase
          .from(targetTable)
          .update(fullPayload)
          .eq('id', resolvedRequestId);

        if (updateErr) {
          console.warn('[handleAccept] Update with session_id failed, retrying without:', updateErr.message);
          await supabase
            .from(targetTable)
            .update({ status: 'accepted' })
            .eq('id', resolvedRequestId);
        }
      }

      // Notify customer via socket (belt-and-suspenders alongside Supabase Realtime)
      if (socketRef.current) {
        socketRef.current.emit('accept_call', {
          customer_id: req.callerId,
          requestId: resolvedRequestId,
          sessionId: sessionId,
          room_token: req.token,
        });
      }

      // Navigate to appropriate session based on call type
      const navigationParams = {
        requestId: resolvedRequestId,
        sessionId: sessionId,
        callerName: req.callerName,
        callerId: req.callerId,
        perMinuteCharge,
        token: req.token, // EnableX Token
        callType: req.callType,
      };

      if (req.callType === 'audio' || req.callType === 'voice') {
        navigation.navigate('AudioCall', navigationParams);
      } else if (req.callType === 'video') {
        navigation.navigate('VideoCall', navigationParams);
      } else {
        // Default to chat session
        navigation.navigate('VendorChatSession', navigationParams);
      }
    } catch (e) {
      console.warn('handleAccept error:', e);
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  // ─── Reject ───────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    setPopupVisible(false);
    if (!popupData?.requestId) return;
    const targetTable = popupData.table || 'chat_requests';
    await supabase
      .from(targetTable)
      .update({ status: 'rejected' })
      .eq('id', popupData.requestId);
  };

  // ─── Data fetchers ────────────────────────────────────────────────────────
  const getUserDetails = async () => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;
    const { data: astroData } = await supabase
      .from('astrologers')
      .select('*')
      .eq('id', astroId)
      .single();
    if (astroData) {
      setIsLive(astroData.is_available);
      setUser(astroData);
      setProfileComplete(isVendorProfileComplete(astroData));
    }
  };

  // Block service toggles / GO LIVE until the profile is complete.
  const guardedToggle = (setter, field, v) => {
    if (!profileComplete) { ensureVendorProfileComplete(navigation); return; }
    setter(v);
    updateToggleStatus(field, v);
  };

  const fetchData = async () => {
    setLoading(false);
  };

  const rateData = async () => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;
    const { data: rData } = await supabase
      .from('astrologers')
      .select('call_charge_per_minute, chat_charge_per_minute, video_charge_per_minute, is_call_enabled, is_chat_enabled, is_video_call_enabled')
      .eq('id', astroId)
      .single();
    if (rData) {
      setCharges({
        callChargePerMinute: rData.call_charge_per_minute,
        chatChargePerMinute: rData.chat_charge_per_minute,
        videoChargePerMinute: rData.video_charge_per_minute,
      });
      setCallEnabled(rData.is_call_enabled);
      setChatEnabled(rData.is_chat_enabled);
      setVideoCallEnabled(rData.is_video_call_enabled);
    }
  };

  const updateToggleStatus = async (field, status) => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;
    await supabase.from('astrologers').update({ [field]: status }).eq('id', astroId);
  };

  const toggleLiveStatus = async () => {
    const newStatus = !isLive;
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;
    const { error } = await supabase
      .from('astrologers')
      .update({ is_available: newStatus })
      .eq('id', astroId);
    if (!error) {
      setIsLive(newStatus);
      ToastAndroid.show(newStatus ? 'You are now live!' : 'You are offline', ToastAndroid.SHORT);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      rateData();
      getUserDetails();
    }, [])
  );

  useEffect(() => {
    initRequestListener();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  const featuredItems = [
    { name: 'Notifications', icon: 'notifications-outline', screen: 'Notification' },
    { name: 'Customers', icon: 'people-outline', screen: 'MyCustomers' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Banner — admin-managed, rotates on the admin-set interval */}
      <HomeBanner />

      {/* TEMPORARY: pending-approval notice */}
      {user && user.approval_status !== 'approved' && (
        <View style={styles.pendingApprovalBanner}>
          <Ionicons name="time-outline" size={22} color="#fff" />
          <Text style={styles.pendingApprovalText}>
            We will review your profile and get back to you soon!
          </Text>
        </View>
      )}

      {/* Profile-incomplete notice — locks services until the profile is filled */}
      {!profileComplete && (
        <TouchableOpacity
          style={styles.incompleteProfileBanner}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="alert-circle" size={24} color="#fff" />
          <View style={styles.profileBannerTextWrap}>
            <Text style={styles.profileBannerTitle}>Complete your profile</Text>
            <Text style={styles.profileBannerSub}>
              Add your photo, experience, languages and charges so customers can find you. Tap to finish.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Toggles inside a unified premium card */}
      <View style={styles.cardContainer}>
        <Text style={styles.sectionTitle}>Service Settings</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Ionicons name="call" size={22} color={COLORS.AstroMaroon} />
            <Text style={styles.toggleLabel}>Call</Text>
          </View>
          <Text style={styles.rate}>₹{charges?.callChargePerMinute}/min</Text>
          <View style={styles.toggleRight}>
            <ServiceToggle
              value={callEnabled}
              onValueChange={(v) => guardedToggle(setCallEnabled, 'is_call_enabled', v)}
            />
          </View>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Ionicons name="videocam" size={22} color={COLORS.AstroMaroon} />
            <Text style={styles.toggleLabel}>Video</Text>
          </View>
          <Text style={styles.rate}>₹{charges?.videoChargePerMinute}/min</Text>
          <View style={styles.toggleRight}>
            <ServiceToggle
              value={videoCallEnabled}
              onValueChange={(v) => guardedToggle(setVideoCallEnabled, 'is_video_call_enabled', v)}
            />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.toggleRow}>
          <View style={styles.toggleLeft}>
            <Ionicons name="chatbubble" size={22} color={COLORS.AstroMaroon} />
            <Text style={styles.toggleLabel}>Chat</Text>
          </View>
          <Text style={styles.rate}>₹{charges?.chatChargePerMinute}/min</Text>
          <View style={styles.toggleRight}>
            <ServiceToggle
              value={chatEnabled}
              onValueChange={(v) => guardedToggle(setChatEnabled, 'is_chat_enabled', v)}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.liveButton}
        activeOpacity={0.8}
        onPress={async () => {
          if (!profileComplete) { ensureVendorProfileComplete(navigation); return; }
          const astroId = await AsyncStorage.getItem('astroId');
          if (!astroId) {
            ToastAndroid.show('Session missing. Please log in again.', ToastAndroid.SHORT);
            return;
          }
          navigation.navigate('GoLiveScreen', { astrologerId: astroId });
        }}>
        <Ionicons name="radio-button-on" size={24} color={COLORS.AstroMaroon} />
        <Text style={styles.liveButtonText}>GO LIVE</Text>
      </TouchableOpacity>

      {/* Missed sessions with time filters (Today default / Yesterday / This Month / All) */}
      <MissedSessionsHome />

      <NotificationPopup
        visible={popupVisible}
        data={popupData}
        onAccept={handleAccept}
        onCancel={handleCancel}
      />
      </ScrollView>

      {/* Fixed Bottom Bar */}
      <View style={styles.fixedBottomBar}>
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('SessionHistory')} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={20} color="#fff" />
          <Text style={styles.historyBtnText}>Session History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: scale(15), paddingBottom: verticalScale(30) },
  pendingApprovalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#b45309',
    borderRadius: moderateScale(14),
    padding: scale(14),
    marginBottom: verticalScale(14),
    elevation: 3,
    gap: scale(10),
  },
  pendingApprovalText: {
    flex: 1,
    color: '#fff',
    fontWeight: 'bold',
    fontSize: moderateScale(14),
  },
  incompleteProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(14),
    padding: scale(14),
    marginBottom: verticalScale(14),
    elevation: 3,
  },
  profileBannerTextWrap: { flex: 1, marginHorizontal: scale(12) },
  profileBannerTitle: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
  profileBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(12), marginTop: verticalScale(2), fontFamily: 'Lato-Regular' },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: verticalScale(15) },
  statCard: { 
    width: '48%', 
    backgroundColor: COLORS.white, 
    borderRadius: moderateScale(16), 
    padding: scale(16), 
    alignItems: 'flex-start', 
    elevation: 3,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  statIconContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  statNumber: { fontSize: moderateScale(22), fontWeight: 'bold', color: COLORS.orange, fontFamily: 'Lato-Bold' },
  statLabel: { fontSize: moderateScale(12), color: '#888', marginTop: verticalScale(4), fontFamily: 'Lato-Regular' },
  profileBanner: { 
    borderRadius: moderateScale(16), 
    marginBottom: verticalScale(15), 
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  profileImage: { width: '100%', height: verticalScale(160) },
  cardContainer: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    padding: scale(16),
    marginBottom: verticalScale(15),
    elevation: 3,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#333',
    marginBottom: verticalScale(12),
    fontFamily: 'Lato-Bold',
  },
  toggleRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: verticalScale(8) 
  },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: verticalScale(4) },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', width: scale(80) },
  toggleLabel: { fontSize: moderateScale(15), color: '#444', fontWeight: 'bold', marginLeft: scale(8) },
  rate: { fontSize: moderateScale(14), color: '#666', flex: 1, textAlign: 'center' },
  toggleRight: { width: scale(56), alignItems: 'flex-end' },
  liveButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: COLORS.white, 
    paddingVertical: verticalScale(14), 
    borderRadius: moderateScale(25), 
    marginBottom: verticalScale(15),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    elevation: 2,
  },
  liveButtonActive: { 
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
    elevation: 4,
  },
  liveButtonText: { marginLeft: 10, fontWeight: 'bold', fontSize: moderateScale(15), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold' },
  fixedBottomBar: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(16),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(13),
    borderRadius: moderateScale(25),
    gap: scale(8),
  },
  historyBtnText: {
    fontSize: moderateScale(15),
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: 'Lato-Bold',
  },
});

export default HomeScreen;
