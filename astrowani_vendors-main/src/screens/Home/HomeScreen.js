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
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Earnings Section */}
      <View style={styles.topSection}>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="wallet" size={20} color={COLORS.orange} />
          </View>
          <Text style={styles.statNumber}>₹{data?.todayEarnings || 0}</Text>
          <Text style={styles.statLabel}>Today's Earning</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: 'rgba(40, 167, 69, 0.1)' }]}>
            <Ionicons name="cash" size={20} color={COLORS.green} />
          </View>
          <Text style={[styles.statNumber, { color: COLORS.green }]}>₹{data?.totalEarnings || 0}</Text>
          <Text style={styles.statLabel}>Total Earning</Text>
        </View>
      </View>

      {/* Banner */}
      <View style={styles.profileBanner}>
        <Image
          resizeMode="cover"
          source={require('../../assets/images/mainlogo.jpeg')}
          style={styles.profileImage}
        />
      </View>

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
            <Switch
              value={callEnabled}
              onValueChange={(v) => { setCallEnabled(v); updateToggleStatus('is_call_enabled', v); }}
              trackColor={{ false: '#ccc', true: COLORS.green }}
              thumbColor="#fff"
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
            <Switch
              value={videoCallEnabled}
              onValueChange={(v) => { setVideoCallEnabled(v); updateToggleStatus('is_video_call_enabled', v); }}
              trackColor={{ false: '#ccc', true: COLORS.green }}
              thumbColor="#fff"
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
            <Switch
              value={chatEnabled}
              onValueChange={(v) => { setChatEnabled(v); updateToggleStatus('is_chat_enabled', v); }}
              trackColor={{ false: '#ccc', true: COLORS.green }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.liveButton, isLive && styles.liveButtonActive]}
        activeOpacity={0.8}
        onPress={toggleLiveStatus}>
        <Ionicons
          name={isLive ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={isLive ? '#fff' : COLORS.AstroMaroon}
        />
        <Text style={[styles.liveButtonText, isLive && { color: '#fff' }]}>
          {isLive ? 'LIVE NOW' : 'GO LIVE'}
        </Text>
      </TouchableOpacity>

      <NotificationPopup
        visible={popupVisible}
        data={popupData}
        onAccept={handleAccept}
        onCancel={handleCancel}
      />
      </ScrollView>

      {/* Fixed Bottom Bar for History */}
      <View style={styles.fixedBottomBar}>
        <TouchableOpacity style={styles.bottomTab} onPress={() => navigation.navigate('CallHistory')}>
          <Ionicons name="call-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.bottomTabText} numberOfLines={1}>Call</Text>
        </TouchableOpacity>
        
        <View style={styles.bottomDivider} />

        <TouchableOpacity style={styles.bottomTab} onPress={() => navigation.navigate('ChatHistory')}>
          <Ionicons name="chatbubbles-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.bottomTabText} numberOfLines={1}>Chat</Text>
        </TouchableOpacity>

        <View style={styles.bottomDivider} />

        <TouchableOpacity style={styles.bottomTab} onPress={() => navigation.navigate('LiveCallHistory')}>
          <Ionicons name="radio-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.bottomTabText} numberOfLines={1}>Live</Text>
        </TouchableOpacity>

        <View style={styles.bottomDivider} />

        <TouchableOpacity style={styles.bottomTab} onPress={() => navigation.navigate('VideoCallHistory')}>
          <Ionicons name="videocam-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.bottomTabText} numberOfLines={1}>Video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: scale(15), paddingBottom: verticalScale(30) },
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
  toggleRight: { width: scale(50), alignItems: 'flex-end' },
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
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(5),
  },
  bottomDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: verticalScale(5),
  },
  bottomTabText: {
    fontSize: moderateScale(11),
    color: COLORS.AstroMaroon,
    marginTop: verticalScale(4),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
  },
});

export default HomeScreen;
