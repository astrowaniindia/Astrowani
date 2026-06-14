import React, {useCallback, useEffect, useState} from 'react';
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
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import LocalImage from '../../assets/images/quikseek-banner.png';
import NotificationPopup from '../notificationPopup';
import messaging from '@react-native-firebase/messaging';
import showToast from '../../utils/showToast';
import { supabase } from '../../api/SupabaseClient';
import io from 'socket.io-client';
const HomeScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [callEnabled, setCallEnabled] = useState(true);
  const [videoCallEnabled, setVideoCallEnabled] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [data, setData] = useState(null);
  const [charges, setCharges] = useState(null);

  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState('');
  const [roomId, setRoomId] = useState();
  const [isLive, setIsLive] = useState(false);

  const [user, setUser] = useState();

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return true;
      };
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        BackHandler.removeEventListener('hardwareBackPress', onBackPress);
      };
    }, []),
  );
  useEffect(() => {
    const initSocket = async () => {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const socket = io('http://10.0.2.2:4500');

      socket.on('connect', () => {
        socket.emit('join_room', astroId);
      });

      socket.on('incoming_call', (data) => {
        console.log('Incoming call request:', data);
        setPopupData({
          callType: data.call_type,
          callerName: data.customer_name,
          requestId: data.id || Date.now().toString(),
          astroId: data.astrologer_id,
          userId: data.customer_id,
          roomId: data.room_id,
          roomToken: data.room_token
        });
        setPopupVisible(true);
      });

      window.socket = socket; // Keep it globally available for handleAccept
    };

    initSocket();

    return () => {
      if (window.socket) window.socket.disconnect();
    };
  }, []);

  const handleIncomingCall = remoteMessage => {
    // Keeping this for FCM fallback if needed
    if (remoteMessage?.data) {
      const {
        callType,
        callerName,
        roomId,
        astroId,
        userId,
        callingCondition,
        sessionId,
        receiverId,
      } = remoteMessage.data;
      console.log('remoteMessage: ', remoteMessage);
      setPopupData({
        callType,
        callerName,
        roomId,
        astroId,
        userId,
        callingCondition,
        sessionId,
        receiverId,
      });

      if (roomId) {
        setPopupVisible(true);
      }
    }
  };

  const handleAccept = async () => {
    setPopupVisible(false);

    // 1. Accept request via Socket.io
    if (window.socket && popupData.userId) {
      window.socket.emit('accept_call', {
        customer_id: popupData.userId,
        astrologer_id: popupData.astroId
      });
    }

    // Await the token from AsyncStorage (user token)
    const userToken = await AsyncStorage.getItem('token');

    // Check call type and navigate accordingly
    const screenName = popupData.callType === 'video' ? 'EnxScreenVoice' : 'JoinRoom';

    navigation.navigate(screenName, {
      roomId: popupData.roomId,
      name: popupData.callerName,
      callType: popupData.callType,
      astroId: popupData.astroId,
      userId: popupData.userId,
      sessionId: popupData.sessionId,
      receiverId: popupData.receiverId,
      userToken: userToken, 
      token: popupData.roomToken || userToken, // Pass the EnableX room token from Supabase!
    });
  };

  const handleCancel = async () => {
    setPopupVisible(false);
    if (window.socket && popupData.userId) {
      window.socket.emit('reject_call', {
        customer_id: popupData.userId,
        astrologer_id: popupData.astroId
      });
    }
  };

  const featuredItems = [
    // {name: 'Consultation', icon: 'chatbox-ellipses-outline', screen: 'Consultation'},
    // { name: 'Appointments', icon: 'calendar-outline', screen: 'Appointments' },
    // {name: 'wallet', icon: 'document-text-outline', screen: 'Wallet'},
    {
      name: 'Notifications',
      icon: 'notifications-outline',
      screen: 'Notification',
    },
    {name: 'Customers', icon: 'people-outline', screen: 'MyCustomers'},
  ];

  const handleFeaturedItemPress = screenName => {
    navigation.navigate(screenName);
  };

  const toggleCall = async () => {
    const newStatus = !callEnabled;
    setCallEnabled(newStatus);
    await updateToggleStatus('call', newStatus);
  };
  const toggleVideoCall = async () => {
    const newStatus = !videoCallEnabled;
    setVideoCallEnabled(newStatus);
    await updateToggleVideoStatus('call', newStatus);
  };

  const toggleChat = async () => {
    const newStatus = !chatEnabled;
    setChatEnabled(newStatus);
    await updateToggleStatusChat('chat', newStatus);
  };

  const getUserDetails = async () => {
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { data, error } = await supabase
        .from('astrologers')
        .select('*')
        .eq('id', astroId)
        .single();

      if (data) {
        setIsLive(data.is_available);
        setUser(data);
      }
    } catch (error) {
      console.log('error on getUserDetails: ', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { data, error } = await supabase
        .from('astrologers')
        .select('today_earnings, total_earnings')
        .eq('id', astroId)
        .single();

      if (data) {
        setData({
          totalEarnings: data.total_earnings,
          todayEarnings: data.today_earnings
        });
      }
    } catch (error) {
      console.log('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  };

  const rateData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { data, error } = await supabase
        .from('astrologers')
        .select('call_charge_per_minute, chat_charge_per_minute, video_charge_per_minute, is_call_enabled, is_chat_enabled, is_video_call_enabled')
        .eq('id', astroId)
        .single();

      if (data) {
        setCharges({
          callChargePerMinute: data.call_charge_per_minute,
          chatChargePerMinute: data.chat_charge_per_minute,
          videoChargePerMinute: data.video_charge_per_minute,
        });
        setCallEnabled(data.is_call_enabled);
        setChatEnabled(data.is_chat_enabled);
        setVideoCallEnabled(data.is_video_call_enabled);
      }
    } catch (error) {
      console.log('Error fetching rates', error);
    } finally {
      setLoading(false);
    }
  };

  const updateToggleStatus = async (type, status) => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { error } = await supabase
        .from('astrologers')
        .update({ is_call_enabled: status })
        .eq('id', astroId);

      if (!error) {
        ToastAndroid.showWithGravity('Call status updated.', ToastAndroid.SHORT, ToastAndroid.CENTER);
      }
    } catch (error) {
      console.log('Error', error);
    } finally {
      setLoading(false);
    }
  };

  const updateToggleVideoStatus = async (type, status) => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { error } = await supabase
        .from('astrologers')
        .update({ is_video_call_enabled: status })
        .eq('id', astroId);

      if (!error) {
        ToastAndroid.showWithGravity('Video status updated.', ToastAndroid.SHORT, ToastAndroid.CENTER);
      }
    } catch (error) {
      console.log('Error', error);
    } finally {
      setLoading(false);
    }
  };

  const updateToggleStatusChat = async (type, status) => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { error } = await supabase
        .from('astrologers')
        .update({ is_chat_enabled: status })
        .eq('id', astroId);

      if (!error) {
        showToast('Chat status updated successfully.');
      }
    } catch (error) {
      console.log('Error', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleLiveStatus = async () => {
    const newStatus = !isLive;
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) return;

      const { error } = await supabase
        .from('astrologers')
        .update({ is_available: newStatus })
        .eq('id', astroId);

      if (!error) {
        setIsLive(newStatus);
        ToastAndroid.show(newStatus ? 'You are now live!' : 'You are offline', ToastAndroid.SHORT);
      } else {
        showToast('Failed to update live status.');
      }
    } catch (error) {
      console.error('Error updating live status:', error);
      ToastAndroid.show('Failed to update status', ToastAndroid.SHORT);
    }
  };



  useEffect(() => {
    getUserDetails();
  }, [isLive]);

  useEffect(() => {
    fetchData();
    rateData();
  }, []);

  console.log('videocall: ', videoCallEnabled);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{data?.totalEarnings || 0}</Text>
          <Text style={styles.statLabel}>Today Earning</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{data?.totalEarnings || 0}</Text>
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
        <>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Call</Text>
            <Text style={styles.rate}>
              ₹ {charges?.callChargePerMinute}/min
            </Text>
            <Switch value={callEnabled} onValueChange={toggleCall} />
            <Text
              style={[
                styles.status,
                {color: callEnabled ? COLORS.green : COLORS.red},
              ]}>
              {callEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Video</Text>
            <Text style={styles.rate}>
              ₹ {charges?.videoChargePerMinute}/min
            </Text>
            <Switch value={videoCallEnabled} onValueChange={toggleVideoCall} />
            <Text
              style={[
                styles.status,
                {color: videoCallEnabled ? COLORS.green : COLORS.red},
              ]}>
              {videoCallEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Chat</Text>
            <Text style={styles.rate}>
              ₹ {charges?.chatChargePerMinute}/min
            </Text>
            <Switch value={chatEnabled} onValueChange={toggleChat} />
            <Text
              style={[
                styles.status,
                {color: chatEnabled ? COLORS.green : COLORS.red},
              ]}>
              {chatEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </>
      </View>
      <TouchableOpacity
        style={[styles.liveButton, isLive && styles.liveButtonActive]}
        onPress={toggleLiveStatus}>
        <Ionicons
          name={isLive ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={isLive ? COLORS.green : COLORS.red}
        />
        <Text style={styles.liveButtonText}>
          {isLive ? 'LIVE NOW' : 'GO LIVE'}
        </Text>
      </TouchableOpacity>

      {/* Profile Banner (keep your existing banner code) */}
      <View style={styles.profileBanner}></View>
      <View style={styles.featuredSection}>
        <Text style={styles.featuredTitle}>Featured</Text>
        <View style={styles.featuredIcons}>
          {featuredItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.featuredItem}
              onPress={() => handleFeaturedItemPress(item.screen)}>
              <Ionicons name={item.icon} size={28} color={COLORS.AstroMaroon} />
              <Text style={styles.featuredLabel}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.historySection}>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('CallHistory')}>
          <Ionicons name="call-outline" size={24} color={COLORS.AstroMaroon} />
          <Text style={styles.historyButtonText}>Call History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('ChatHistory')}>
          <Ionicons
            name="chatbubbles-outline"
            size={24}
            color={COLORS.AstroMaroon}
          />
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
  container: {
    flex: 1,
    backgroundColor: '',
    padding: scale(15),
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(10),
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(8),
    padding: scale(15),
    alignItems: 'center',
    elevation: 4,
  },
  statNumber: {
    fontSize: moderateScale(23),
    fontWeight: 'bold',
    color: COLORS.orange,
  },
  statLabel: {
    fontSize: moderateScale(13),
    color: COLORS.lightGrey,
  },
  profileBanner: {
    backgroundColor: 'transparent',
    borderRadius: moderateScale(10),
    alignItems: 'center',
    marginVertical: verticalScale(10),
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: verticalScale(180),
    marginBottom: 0,
  },
  profileText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: moderateScale(14),
    marginBottom: verticalScale(5),
  },
  toggleSection: {
    padding: scale(10),
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  toggleLabel: {
    fontSize: moderateScale(15),
    color: '#333',
    fontWeight: 'bold',
    width: scale(50),
  },
  rate: {
    fontSize: moderateScale(14),
    color: '#666',
  },
  status: {
    fontSize: moderateScale(13),
    fontWeight: 'bold',
    width: scale(50),
    textAlign: 'right',
  },
  featuredSection: {
    padding: scale(10),
  },
  featuredTitle: {
    fontSize: moderateScale(17),
    fontWeight: 'bold',
    color: '#333',
    marginBottom: verticalScale(14),
  },
  featuredIcons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featuredItem: {
    alignItems: 'center',
    width: '25%',
    marginBottom: verticalScale(10),
  },
  featuredLabel: {
    fontSize: moderateScale(11),
    color: '#333',
    marginTop: verticalScale(5),
    textAlign: 'center',
  },
  authContainer: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  authButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  authButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  liveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lightGrey,
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  liveButtonActive: {
    backgroundColor: COLORS.lightGreen,
  },
  liveButtonText: {
    marginLeft: 10,
    fontWeight: 'bold',
    color: COLORS.dark,
  },
  historySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 15,
    marginBottom: 24,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 8,
    width: '48%',
    elevation: 2,
  },
  historyButtonText: {
    marginLeft: 10,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
