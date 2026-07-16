import React, {useState, useEffect, useRef, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import ReusableList from '../component/ReusableList';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {SOCKET_URL} from '../../config/api';
import {supabase} from '../../api/SupabaseClient';
import {showStatusPopup} from '../../components/StatusPopup';
import {ensureProfileComplete} from '../../utils/profileGate';
import io from 'socket.io-client';
import {LanguageContext} from '../../context/LanguageContext';

const Video = ({navigation}) => {
  const {t} = React.useContext(LanguageContext);
  const [astrologer, setAstrologer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  // Mount-time socket — stays connected for the component lifetime so
  // call_accepted arrives reliably even if vendor accepts within seconds.
  const socketRef = useRef(null);
  const callChannelRef = useRef(null);
  // navigatedRef prevents stale async handlers from navigating after cancel/timeout.
  const navigatedRef = useRef(false);
  // Tracks the in-flight request so cancel/back marks it cancelled + notifies the vendor
  const activeCallRef = useRef(null);

  // Notify the vendor that the customer abandoned the pending request (dismisses their popup)
  const notifyVendorCancelled = (status = 'cancelled') => {
    const active = activeCallRef.current;
    activeCallRef.current = null;
    if (!active?.requestId) return;
    if (status !== 'rejected') {
      supabase
        .from('call_requests')
        .update({status})
        .eq('id', active.requestId)
        .then(() => {}, () => {});
    }
    socketRef.current?.emit('cancel_call', {
      astrologer_id: active.astrologerId,
      requestId: active.requestId,
      roomId: active.roomId,
    });
  };

  useEffect(() => {
    const setup = async () => {
      socketRef.current = io(SOCKET_URL);
      socketRef.current.on('connect', async () => {
        console.log('[VideoScreen] Socket connected:', socketRef.current.id);
        const userStr = await AsyncStorage.getItem('userData');
        const user = userStr ? JSON.parse(userStr) : null;
        if (user?.id) {
          socketRef.current.emit('join_room', user.id);
          console.log('[VideoScreen] Joined personal room:', user.id);
        }
      });
      socketRef.current.on('connect_error', err =>
        console.error('[VideoScreen] Socket error:', err.message),
      );
    };
    setup();
    fetchAstrologers();
    return () => {
      if (callChannelRef.current) supabase.removeChannel(callChannelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const fetchAstrologers = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');
      // Show ALL astrologers — the Video button reflects is_video_call_enabled per card
      // (red "Unavailable" when off) rather than hiding the astrologer.
      const response = await Instance.get('/api/astrologers', {
        headers: {Authorization: token},
      });
      setAstrologer(response.data.data);
      setError(null); // clear any stale error from a prior failed attempt
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on focus + live sync on any astrologer change
  useFocusEffect(
    useCallback(() => {
      fetchAstrologers();
    }, [fetchAstrologers]),
  );

  useEffect(() => {
    // Unique name per run — a fixed name makes supabase.channel() return an already-
    // subscribed channel and .on()-after-subscribe() throws.
    const channel = supabase
      .channel(`video-astro-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'astrologers'},
        () => fetchAstrologers(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAstrologers]);

  const cancelCall = () => {
    navigatedRef.current = true;
    notifyVendorCancelled();
    if (callChannelRef.current) {
      supabase.removeChannel(callChannelRef.current);
      callChannelRef.current = null;
    }
    socketRef.current?.off('call_accepted');
    socketRef.current?.off('call_rejected');
    setIsWaiting(false);
  };

  const initiateVideoCall = async item => {
    try {
      if (!(await ensureProfileComplete(navigation))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert(t('common.error'), t('call.pleaseLogin'));
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = item.videoPrice || item.chargePerMinute || item.pricing || 15;
      const minRequired = pricePerMin * 5;

      const {data: customer, error: walletErr} = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();

      if (walletErr) {
        Alert.alert(t('common.error'), t('alerts.failedWalletCheck'));
        return;
      }
      if (customer.wallet_balance < minRequired) {
        Alert.alert(
          t('alerts.insufficientBalance'),
          `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`,
        );
        return;
      }

      setIsWaiting(true);
      setWaitingAstroName(item.name);
      navigatedRef.current = false;

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: item.userId, callType: 'video', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedInitiateVideoCall'));
        return;
      }

      const callerToken =
        response.data.data?.token?.token ||
        response.data.token?.token ||
        response.data.token;
      const vendorToken =
        response.data.data?.vendorToken || response.data.vendorToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId =
        response.data.data?.sessionId || response.data.sessionId;

      const {data: requestData, error: reqErr} = await supabase
        .from('call_requests')
        .insert([{
          customer_id: userEntireData.id,
          astrologer_id: item.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: 'video',
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }])
        .select()
        .single();

      if (reqErr) {
        setIsWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedRequestAstrologer'));
        return;
      }

      // Remember the in-flight request so cancel/back can notify the vendor
      activeCallRef.current = {requestId: requestData.id, astrologerId: item.userId, roomId};

      const goToCall = dbSessionId => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        activeCallRef.current = null; // accepted → don't cancel
        if (callChannelRef.current) {
          supabase.removeChannel(callChannelRef.current);
          callChannelRef.current = null;
        }
        socketRef.current?.off('call_accepted');
        socketRef.current?.off('call_rejected');
        setIsWaiting(false);
        navigation.navigate('VideoCallScreen', {
          token: callerToken,
          sessionId: dbSessionId || backendSessionId,
          recieverName: item.name,
          recieverImage: item.profileImage || '',
          recieverId: item.userId || item._id,
        });
      };

      const cleanupAndAlert = (msg, status = 'cancelled', title = 'Call Ended') => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        notifyVendorCancelled(status);
        if (callChannelRef.current) {
          supabase.removeChannel(callChannelRef.current);
          callChannelRef.current = null;
        }
        socketRef.current?.off('call_accepted');
        socketRef.current?.off('call_rejected');
        setIsWaiting(false);
        if (msg) {
          showStatusPopup({
            title,
            message: msg,
            variant: status === 'missed' ? 'missed' : status === 'rejected' ? 'busy' : 'info',
          });
        }
      };

      // Mount-time socket is already connected and in customer's room
      socketRef.current?.once('call_accepted', data => goToCall(data.sessionId));
      socketRef.current?.on('call_rejected', () =>
        cleanupAndAlert(t('alerts.astrologerBusy'), 'rejected', 'Astrologer Busy'),
      );

      // Supabase Realtime backup
      const channel = supabase
        .channel(`video_call_request_${requestData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'call_requests',
            filter: `id=eq.${requestData.id}`,
          },
          payload => {
            if (payload.new.status === 'accepted') {
              goToCall(payload.new.session_id);
            } else if (payload.new.status === 'rejected') {
              cleanupAndAlert('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cleanupAndAlert(t('alerts.notPickedUpVideo'), 'missed', 'Not Answered');
      }, 60000);
    } catch (err) {
      setIsWaiting(false);
      console.error('[VideoScreen] initiateVideoCall error:', err);
      Alert.alert(t('common.error'), t('alerts.failedInitiateVideoCall'));
    }
  };

  const handleAstrologer = item => {
    navigation.navigate('AstrologerInfo', {person: item});
  };

  if (loading) {
    return (
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>{t('common.error')}: {error}</Text>;
  }

  return (
    <View style={{flex: 1}}>
      <ReusableList
        data={astrologer}
        handleAstrologer={handleAstrologer}
        actionButton={initiateVideoCall}
        buttonType="video"
      />
      <Modal transparent={true} visible={isWaiting} animationType="fade" onRequestClose={cancelCall}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ActivityIndicator size="large" color={COLORS.AstroGold} />
            <Text style={styles.modalTitle}>{t('home.requestSent')}</Text>
            <Text style={styles.modalText}>
              {t('video.waitingFor', {name: waitingAstroName})}
            </Text>
            <Text
              style={styles.cancelBtn}
              onPress={cancelCall}>
              {t('home.cancelRequest')}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Video;

const styles = StyleSheet.create({
  errorText: {
    color: 'red',
    textAlign: 'center',
    paddingVertical: verticalScale(10),
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(15),
    padding: scale(25),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.AstroSoftOrange,
  },
  modalTitle: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: COLORS.AstroGold,
    marginTop: verticalScale(20),
    marginBottom: verticalScale(10),
  },
  modalText: {
    fontSize: moderateScale(16),
    color: COLORS.AstroSoftOrange,
    textAlign: 'center',
    marginBottom: verticalScale(25),
    lineHeight: 22,
  },
  cancelBtn: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(16),
    backgroundColor: COLORS.AstroSoftOrange,
    paddingHorizontal: scale(30),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(25),
    overflow: 'hidden',
    width: '100%',
    textAlign: 'center',
  },
});
