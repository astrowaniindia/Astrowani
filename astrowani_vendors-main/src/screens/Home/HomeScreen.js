// HomeScreen.js — Vendor side
// Listens via Supabase Realtime for incoming chat/call requests
// Shows NotificationPopup → Accept navigates to session screen, Reject updates status
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Switch,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ToastAndroid,
  BackHandler,
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

const HomeScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [callEnabled, setCallEnabled] = useState(true);
  const [videoCallEnabled, setVideoCallEnabled] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [charges, setCharges] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [user, setUser] = useState(null);

  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState(null);

  const channelRef = useRef(null);

  // ─── Back handler ──────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );

  // ─── Supabase Realtime listener for incoming requests ─────────────────────
  const initRequestListener = async () => {
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) return;

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
          console.log('Incoming request:', req);
          setPopupData({
            requestId: req.id,
            callType: req.request_type || 'chat',
            callerName: req.caller_name || 'Customer',
            callerId: req.caller_id,
          });
          setPopupVisible(true);
        }
      )
      .subscribe();
  };

  // ─── Accept ───────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    setPopupVisible(false);
    const req = popupData;
    if (!req) return;

    try {
      // Update request status
      await supabase
        .from('chat_requests')
        .update({ status: 'accepted' })
        .eq('id', req.requestId);

      // Create session with per-minute charge
      const astroId = await AsyncStorage.getItem('astroId');
      const { data: astroData } = await supabase
        .from('astrologers')
        .select('chat_charge_per_minute, call_charge_per_minute')
        .eq('id', astroId)
        .single();

      const perMinuteCharge =
        req.callType === 'chat'
          ? astroData?.chat_charge_per_minute ?? 0
          : astroData?.call_charge_per_minute ?? 0;

      await supabase.from('chat_sessions').insert([
        {
          request_id: req.requestId,
          per_minute_charge: perMinuteCharge,
          vendor_id: astroId,
          caller_id: req.callerId,
          started_at: new Date().toISOString(),
        },
      ]);

      // Navigate to vendor chat session
      navigation.navigate('VendorChatSession', {
        requestId: req.requestId,
        callerName: req.callerName,
        callerId: req.callerId,
        perMinuteCharge,
      });
    } catch (e) {
      console.warn('handleAccept error:', e);
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  // ─── Reject ───────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    setPopupVisible(false);
    if (!popupData?.requestId) return;
    await supabase
      .from('chat_requests')
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
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const astroId = await AsyncStorage.getItem('astroId');
    if (!astroId) { setLoading(false); return; }
    const { data: earningData } = await supabase
      .from('astrologers')
      .select('today_earnings, total_earnings')
      .eq('id', astroId)
      .single();
    if (earningData) {
      setData({
        totalEarnings: earningData.total_earnings,
        todayEarnings: earningData.today_earnings,
      });
    }
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

  useEffect(() => {
    fetchData();
    rateData();
    getUserDetails();
    initRequestListener();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  const featuredItems = [
    { name: 'Notifications', icon: 'notifications-outline', screen: 'Notification' },
    { name: 'Customers', icon: 'people-outline', screen: 'MyCustomers' },
    { name: 'Wallet', icon: 'wallet-outline', screen: 'Wallet' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>₹{data?.todayEarnings || 0}</Text>
          <Text style={styles.statLabel}>Today Earning</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>₹{data?.totalEarnings || 0}</Text>
          <Text style={styles.statLabel}>Total Earning</Text>
        </View>
      </View>

      <View style={styles.profileBanner}>
        <Image
          resizeMode="cover"
          source={require('../../assets/images/mainlogo.jpeg')}
          style={styles.profileImage}
        />
      </View>

      <View style={styles.toggleSection}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Call</Text>
          <Text style={styles.rate}>₹{charges?.callChargePerMinute}/min</Text>
          <Switch
            value={callEnabled}
            onValueChange={(v) => { setCallEnabled(v); updateToggleStatus('is_call_enabled', v); }}
          />
          <Text style={[styles.status, { color: callEnabled ? COLORS.green : COLORS.red }]}>
            {callEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Video</Text>
          <Text style={styles.rate}>₹{charges?.videoChargePerMinute}/min</Text>
          <Switch
            value={videoCallEnabled}
            onValueChange={(v) => { setVideoCallEnabled(v); updateToggleStatus('is_video_call_enabled', v); }}
          />
          <Text style={[styles.status, { color: videoCallEnabled ? COLORS.green : COLORS.red }]}>
            {videoCallEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Chat</Text>
          <Text style={styles.rate}>₹{charges?.chatChargePerMinute}/min</Text>
          <Switch
            value={chatEnabled}
            onValueChange={(v) => { setChatEnabled(v); updateToggleStatus('is_chat_enabled', v); }}
          />
          <Text style={[styles.status, { color: chatEnabled ? COLORS.green : COLORS.red }]}>
            {chatEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.liveButton, isLive && styles.liveButtonActive]}
        onPress={toggleLiveStatus}>
        <Ionicons
          name={isLive ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={isLive ? COLORS.green : COLORS.red}
        />
        <Text style={styles.liveButtonText}>{isLive ? 'LIVE NOW' : 'GO LIVE'}</Text>
      </TouchableOpacity>

      <View style={styles.featuredSection}>
        <Text style={styles.featuredTitle}>Featured</Text>
        <View style={styles.featuredIcons}>
          {featuredItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.featuredItem}
              onPress={() => navigation.navigate(item.screen)}>
              <Ionicons name={item.icon} size={28} color={COLORS.AstroMaroon} />
              <Text style={styles.featuredLabel}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.historySection}>
        <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('CallHistory')}>
          <Ionicons name="call-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.historyButtonText}>Call History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('ChatHistory')}>
          <Ionicons name="chatbubbles-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.historyButtonText}>Chat History</Text>
        </TouchableOpacity>
      </View>

      <NotificationPopup
        visible={popupVisible}
        data={popupData}
        onAccept={handleAccept}
        onCancel={handleCancel}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '', padding: scale(15) },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: verticalScale(10) },
  statCard: { width: '48%', backgroundColor: COLORS.white, borderRadius: moderateScale(8), padding: scale(15), alignItems: 'center', elevation: 4 },
  statNumber: { fontSize: moderateScale(23), fontWeight: 'bold', color: COLORS.orange },
  statLabel: { fontSize: moderateScale(13), color: COLORS.lightGrey },
  profileBanner: { backgroundColor: 'transparent', borderRadius: moderateScale(10), alignItems: 'center', marginVertical: verticalScale(10), overflow: 'hidden' },
  profileImage: { width: '100%', height: verticalScale(180) },
  toggleSection: { padding: scale(10) },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: verticalScale(10), borderBottomWidth: 1, borderBottomColor: '#ddd' },
  toggleLabel: { fontSize: moderateScale(15), color: '#333', fontWeight: 'bold', width: scale(50) },
  rate: { fontSize: moderateScale(14), color: '#666' },
  status: { fontSize: moderateScale(13), fontWeight: 'bold', width: scale(50), textAlign: 'right' },
  featuredSection: { padding: scale(10) },
  featuredTitle: { fontSize: moderateScale(17), fontWeight: 'bold', color: '#333', marginBottom: verticalScale(14) },
  featuredIcons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  featuredItem: { alignItems: 'center', width: '25%', marginBottom: verticalScale(10) },
  featuredLabel: { fontSize: moderateScale(11), color: '#333', marginTop: verticalScale(5), textAlign: 'center' },
  liveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lightGrey, padding: 15, borderRadius: 8, marginVertical: 10 },
  liveButtonActive: { backgroundColor: COLORS.lightGreen },
  liveButtonText: { marginLeft: 10, fontWeight: 'bold', color: COLORS.dark },
  historySection: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 15, marginBottom: 24 },
  historyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 15, borderRadius: 8, width: '48%', elevation: 2 },
  historyButtonText: { marginLeft: 10, fontWeight: 'bold' },
});

export default HomeScreen;
