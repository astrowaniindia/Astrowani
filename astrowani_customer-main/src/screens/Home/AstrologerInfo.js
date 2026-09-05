import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  Dimensions,
  Modal,
  StatusBar,
  TextInput,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AntDesign from 'react-native-vector-icons/AntDesign';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import io from 'socket.io-client';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import GiftModal from '../../Component/Modal';
import useGiftSender from '../../hooks/useGiftSender';
import useChatRequest from '../../hooks/useChatRequest';
import RequestingPopup from '../../components/RequestingPopup';
import {supabase} from '../../api/SupabaseClient';
import {SOCKET_URL} from '../../config/api';
import {showStatusPopup} from '../../components/StatusPopup';
import StarRating from '../../components/StarRating';
import AstrologerBadge from '../../components/AstrologerBadge';
import {ensureProfileComplete} from '../../utils/profileGate';
import {getWalletBalance} from '../../utils/wallet';
import {showInsufficientBalanceAlert} from '../../utils/insufficientBalanceAlert';
import {LanguageContext} from '../../context/LanguageContext';
import useElapsedSeconds from '../../hooks/useElapsedSeconds';
import {formatBusyLabel} from '../../utils/busyLabel';
import {requestNotifyMe} from '../../utils/notifyMe';
import {captureEvent} from '../../utils/Analytics';
import {
  unreachableState,
  unreachableLabelKey,
  unreachableIcon,
  unreachableAlertKey,
  unreachableReason,
} from '../../utils/astrologerAvailability';
import {useModalPresence} from '../../utils/modalPresentation';

const { width } = Dimensions.get('window');

const AstrologerInfo = ({route, navigation}) => {
  const { t } = React.useContext(LanguageContext);
  const {person} = route.params;

  useEffect(() => {
    if (person?.userId || person?._id) {
      captureEvent('astrologer_profile_viewed', {
        astrologer_id: person.userId || person._id,
        astrologer_name: person.name,
        specialties: person.specialties?.map((s) => s.name || s) || [],
        rate_call: person.charges?.call,
        rate_chat: person.charges?.chat,
      });
    }
  }, [person]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(person.isFavorite || false);
  const [loading, setLoading] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [reviewloading, setReviewLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewError, setReviewError] = useState('');
  const [avgRating, setAvgRating] = useState('');
  const [avgError, setAvgError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [gifts, setGifts] = useState([]);
  const [isCallWaiting, setIsCallWaiting] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  // Declares this modal to the presentation registry so root-level popups
  // (StatusPopup / CustomAlert / ...) wait for it instead of colliding with
  // it on iOS. See utils/modalPresentation.
  useModalPresence(imageModalVisible || reportModalVisible);
  const [reportReason, setReportReason] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const REPORT_REASONS = [
    'Inappropriate behavior',
    'Fraud or scam',
    'Poor service quality',
    'Other',
  ];

  const submitReport = async () => {
    if (!reportReason) {
      Alert.alert(t('common.error'), 'Please select a reason.');
      return;
    }
    setReportSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/api/reports',
        { astrologerId: person.userId || person._id, reason: reportReason, note: reportNote },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        setReportModalVisible(false);
        setReportReason('');
        setReportNote('');
        Alert.alert('Report submitted', 'Thank you — our team will review this.');
      } else {
        Alert.alert(t('common.error'), res.data?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert(t('common.error'), e.response?.data?.message || 'Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  // Gifts shown inline (always-open grid, no button/modal gate) just above Reviews.
  useEffect(() => {
    Instance.get('/api/gifts')
      .then((res) => setGifts(res.data?.data || []))
      .catch(() => {});
  }, []);
  const { sendGift, sendingGiftId } = useGiftSender();

  const callSocketRef = useRef(null);
  // Tracks the in-flight call request so cancel/back can tell the vendor to dismiss its popup
  const activeCallRef = useRef(null);

  const { requesting, requestAstro, sendChatRequest, cancelRequest } = useChatRequest(navigation);

  // Notify the vendor that the customer abandoned the pending request (dismisses their popup).
  // Updating the row to 'cancelled' triggers the vendor's Realtime backup; the socket emit is the fast path.
  const notifyVendorCancelled = (status = 'cancelled') => {
    const active = activeCallRef.current;
    activeCallRef.current = null;
    if (!active?.requestId) return;
    if (status !== 'rejected') {
      supabase
        .from('call_requests')
        .update({ status })
        .eq('id', active.requestId)
        .then(() => {}, () => {});
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

  // If the user leaves this screen (hardware back / navigation) while a call is still
  // pending, notify the vendor so their incoming-call popup doesn't linger.
  useEffect(() => {
    return () => {
      if (activeCallRef.current) {
        notifyVendorCancelled();
        if (callSocketRef.current) {
          callSocketRef.current.disconnect();
          callSocketRef.current = null;
        }
      }
    };
  }, []);

  const initiateAudioCall = async () => {
    try {
      if (!(await ensureProfileComplete(navigation, 'audio_call'))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert(t('common.error'), t('call.pleaseLogin'));
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = person.chargePerMinute || person.pricing || 15;
      const minRequired = pricePerMin * 5;

      let balance;
      try {
        balance = await getWalletBalance();
      } catch (walletErr) {
        Alert.alert(t('common.error'), t('alerts.failedWalletCheck'));
        return;
      }
      if (balance < minRequired) {
        showInsufficientBalanceAlert({ navigation, minRequired, balance, t, intent: 'call' });
        return;
      }

      setIsCallWaiting(true);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: person.userId, callType: 'audio', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsCallWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedInitiateCall'));
        return;
      }
      captureEvent('call_initiated', {call_type: 'audio', astrologer_id: person.userId});

      const callerToken =
        response.data.data?.token?.token ||
        response.data.token?.token ||
        response.data.token;
      const vendorToken =
        response.data.data?.vendorToken || response.data.vendorToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId =
        response.data.data?.sessionId || response.data.sessionId;

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3. /api/call/initiate above already inserted
      // it and returns its id.
      const requestId =
        response.data.data?.requestId || response.data.requestId;
      if (!requestId) {
        setIsCallWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedRequestAstrologer'));
        return;
      }
      const requestData = {id: requestId};

      // Track pending request so cancel/back/timeout can dismiss the vendor's popup
      activeCallRef.current = { requestId: requestData.id, astrologerId: person.userId, roomId };

      const sock = io(SOCKET_URL, { auth: { token } });
      callSocketRef.current = sock;
      sock.on('connect', () => {
        sock.emit('join_room', userEntireData.id);
        sock.emit('initiate_call', {
          astrologer_id: person.userId,
          callType: 'audio',
          callerName: userEntireData.name || 'Customer',
          callerId: userEntireData.id,
          roomId,
          vendorToken,
          requestId: requestData.id,
        });
      });

      let navigated = false;
      const goToCall = dbSessionId => {
        if (navigated) return;
        navigated = true;
        activeCallRef.current = null; // accepted → don't cancel
        supabase.removeChannel(channel);
        sock.removeAllListeners();
        sock.disconnect();
        callSocketRef.current = null;
        setIsCallWaiting(false);
        const realSessionId = dbSessionId || backendSessionId;
        navigation.navigate('VoiceCallScreen', {
          token: callerToken,
          sessionId: realSessionId,
          recieverName: person.name,
          recieverImage: person.profileImage || '',
          recieverId: person._id || person.userId,
          perMinuteCharge: Number(person.chargePerMinute ?? person.pricing) || 0,
        });
      };

      sock.once('call_accepted', data => {
        goToCall(data.sessionId);
      });

      sock.on('call_rejected', () => {
        if (!navigated) {
          navigated = true;
          activeCallRef.current = null; // vendor rejected → nothing to cancel
          supabase.removeChannel(channel);
          sock.removeAllListeners();
          sock.disconnect();
          callSocketRef.current = null;
          setIsCallWaiting(false);
          showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        }
      });

      const channel = supabase
        .channel(`call_request_astroinfo_${requestData.id}`)
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
              if (!navigated) {
                navigated = true;
                activeCallRef.current = null;
                supabase.removeChannel(channel);
                sock.removeAllListeners();
                sock.disconnect();
                callSocketRef.current = null;
                setIsCallWaiting(false);
                showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
              }
            }
          },
        )
        .subscribe();

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        if (!navigated) {
          navigated = true;
          notifyVendorCancelled('missed'); // mark missed + dismiss the vendor's popup
          supabase.removeChannel(channel);
          sock.removeAllListeners();
          sock.disconnect();
          callSocketRef.current = null;
          setIsCallWaiting(false);
          showStatusPopup({ variant: 'missed', title: t('status.notAnsweredTitle'), message: t('alerts.notPickedUpAudio') });
        }
      }, 60000);
    } catch (err) {
      setIsCallWaiting(false);
      if (err?.response?.status === 409) {
        showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        return;
      }
      console.error('[AstrologerInfo] initiateAudioCall error:', err);
      Alert.alert(t('common.error'), t('alerts.failedInitiateCall'));
    }
  };

  const initiateVideoCall = async () => {
    try {
      if (!(await ensureProfileComplete(navigation, 'video_call'))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert(t('common.error'), t('call.pleaseLogin'));
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = person.videoPrice || person.chargePerMinute || person.pricing || 15;
      const minRequired = pricePerMin * 5;

      let balance;
      try {
        balance = await getWalletBalance();
      } catch (walletErr) {
        Alert.alert(t('common.error'), t('alerts.failedWalletCheck'));
        return;
      }
      if (balance < minRequired) {
        showInsufficientBalanceAlert({ navigation, minRequired, balance, t, intent: 'video' });
        return;
      }

      setIsCallWaiting(true);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: person.userId, callType: 'video', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsCallWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedInitiateVideoCall'));
        return;
      }
      captureEvent('call_initiated', {call_type: 'video', astrologer_id: person.userId});

      const callerToken =
        response.data.data?.token?.token ||
        response.data.token?.token ||
        response.data.token;
      const vendorToken =
        response.data.data?.vendorToken || response.data.vendorToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId =
        response.data.data?.sessionId || response.data.sessionId;

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3. /api/call/initiate above already inserted
      // it and returns its id.
      const requestId =
        response.data.data?.requestId || response.data.requestId;
      if (!requestId) {
        setIsCallWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedRequestAstrologer'));
        return;
      }
      const requestData = {id: requestId};

      // Track pending request so cancel/back/timeout can dismiss the vendor's popup
      activeCallRef.current = { requestId: requestData.id, astrologerId: person.userId, roomId };

      const sock = io(SOCKET_URL, { auth: { token } });
      callSocketRef.current = sock;
      sock.on('connect', () => {
        sock.emit('join_room', userEntireData.id);
        sock.emit('initiate_call', {
          astrologer_id: person.userId,
          callType: 'video',
          callerName: userEntireData.name || 'Customer',
          callerId: userEntireData.id,
          roomId,
          vendorToken,
          requestId: requestData.id,
        });
      });

      let navigated = false;
      const goToCall = dbSessionId => {
        if (navigated) return;
        navigated = true;
        activeCallRef.current = null; // accepted → don't cancel
        supabase.removeChannel(channel);
        sock.removeAllListeners();
        sock.disconnect();
        callSocketRef.current = null;
        setIsCallWaiting(false);
        const realSessionId = dbSessionId || backendSessionId;
        navigation.navigate('VideoCallScreen', {
          token: callerToken,
          sessionId: realSessionId,
          recieverName: person.name,
          recieverImage: person.profileImage || '',
          recieverId: person._id || person.userId,
          perMinuteCharge: Number(person.videoPrice) || 0,
        });
      };

      sock.once('call_accepted', data => {
        goToCall(data.sessionId);
      });

      sock.on('call_rejected', () => {
        if (!navigated) {
          navigated = true;
          activeCallRef.current = null; // vendor rejected → nothing to cancel
          supabase.removeChannel(channel);
          sock.removeAllListeners();
          sock.disconnect();
          callSocketRef.current = null;
          setIsCallWaiting(false);
          showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        }
      });

      const channel = supabase
        .channel(`video_call_request_astroinfo_${requestData.id}`)
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
              if (!navigated) {
                navigated = true;
                activeCallRef.current = null;
                supabase.removeChannel(channel);
                sock.removeAllListeners();
                sock.disconnect();
                callSocketRef.current = null;
                setIsCallWaiting(false);
                showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
              }
            }
          },
        )
        .subscribe();

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        if (!navigated) {
          navigated = true;
          notifyVendorCancelled('missed'); // mark missed + dismiss the vendor's popup
          supabase.removeChannel(channel);
          sock.removeAllListeners();
          sock.disconnect();
          callSocketRef.current = null;
          setIsCallWaiting(false);
          showStatusPopup({ variant: 'missed', title: t('status.notAnsweredTitle'), message: t('alerts.notPickedUpVideo') });
        }
      }, 60000);
    } catch (err) {
      setIsCallWaiting(false);
      if (err?.response?.status === 409) {
        showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        return;
      }
      console.error('[AstrologerInfo] initiateVideoCall error:', err);
      Alert.alert(t('common.error'), t('alerts.failedInitiateVideoCall'));
    }
  };

  // Auto-trigger a service when arriving from a card's Chat/Call/Video button
  // (route.params.autoAction). Reuses the proven handlers above so the list cards
  // don't have to duplicate the call/chat flow. Fires once.
  const autoFiredRef = useRef(false);
  useEffect(() => {
    const action = route.params?.autoAction;
    if (!action || autoFiredRef.current) return;
    autoFiredRef.current = true;
    const unavailable = key =>
      Alert.alert(t('alerts.unavailable'), t(key, { name: person.name || 'This astrologer' }));
    const timer = setTimeout(() => {
      if (action === 'chat') {
        person.isChatEnabled !== false ? sendChatRequest(person) : unavailable('alerts.notAvailableChat');
      } else if (action === 'call') {
        person.isCallEnabled !== false ? initiateAudioCall() : unavailable('alerts.notAvailableCall');
      } else if (action === 'video') {
        person.isVideoEnabled !== false ? initiateVideoCall() : unavailable('alerts.notAvailableVideo');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleShowAllReviews = () => {
    setShowAllReviews(true);
  };

  const reviewsToShow = showAllReviews ? reviews : reviews.slice(0, 2);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get('/api/favoriteAstrologer', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const favoriteAstrologers = response.data.favoriteAstrologer || [];
        const isPersonFavorite = favoriteAstrologers.some(
          favAstrologer => favAstrologer._id === person._id,
        );

        setIsFavorite(isPersonFavorite);
      } catch (err) {
        console.log('Error fetching favorite astrologers:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchReviews = async () => {
      setReviewLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          `/api/reviews/astrologer/${person._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data) setReviews(response.data);
      } catch (err) {
        setReviewError(err.message);
      } finally {
        setReviewLoading(false);
      }
    };

    const fetchAvgRating = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          `/api/reviews/astrologer/${person._id}/average-rating`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data) setAvgRating(response.data);
      } catch (err) {
        setAvgError(err.message);
      }
    };
    
    fetchAvgRating();
    fetchReviews();
    fetchFavorites();
  }, [navigation, person._id]);

  const onShare = async () => {
    try {
      await Share.share({
        message: `Check out ${person.name || 'this Astrologer'} on Astrowani!`,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleFavorite = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');
      
      // Optimistic flip so the heart responds instantly; revert on failure.
      const next = !isFavorite;
      setIsFavorite(next);
      captureEvent('favorite_toggled', { astrologer_id: person.userId, favorited: next });
      await Instance.post(
        next ? '/api/favoriteAstrologer/add' : '/api/favoriteAstrologer/remove',
        { astrologerId: person._id },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      captureEvent('favorite_toggle_failed', { astrologer_id: person.userId });
      console.error('Favorite toggle failed:', error.message);
      setIsFavorite(prev => !prev); // revert optimistic flip
    }
  };

  const languages = person.language?.join(', ') || 'Hindi, English';
  const specialties = person.specialties?.map(s => s.name).join(', ') || 'Vedic Astrology';

  // Service availability — astrologer always shown; a disabled service turns the button
  // red + "Off" and shows an alert on tap (matches the list screens). Treat an absent
  // flag as enabled so older navigation sources don't wrongly disable a button.
  const chatEnabled = person.isChatEnabled !== false;
  const callEnabled = person.isCallEnabled !== false;
  const videoEnabled = person.isVideoEnabled !== false;
  // Unreachable — signed out ("Unavailable") or switched off ("Offline"). Either way
  // it overrides all three service buttons with one unified state. The precedence
  // lives in utils/astrologerAvailability so every card surface agrees.
  const unreachable = unreachableState(person);
  const isOffline = !!unreachable;
  // Busy — already in a session or has an unanswered pending request with someone else.
  // Blocks all three service buttons at once (chat/call/video are mutually exclusive).
  const isBusy = !isOffline && person.isBusy === true;
  const isLive = isBusy && person.busyReason === 'live';
  const busySinceMs = person.busySince ? new Date(person.busySince).getTime() : null;
  const busyElapsed = useElapsedSeconds(busySinceMs, isBusy);
  const [notifyMeSent, setNotifyMeSent] = useState(false);

  // Plain Alerts, so not covered by StatusPopup.js's central consult_blocked hook.
  const INTENT_BY_KEY = {
    'alerts.notAvailableChat': 'chat',
    'alerts.notAvailableCall': 'call',
    'alerts.notAvailableVideo': 'video',
  };
  const showUnavailable = key => {
    captureEvent('consult_blocked', { reason: 'service_off', intent: INTENT_BY_KEY[key] || 'unknown', astrologer_id: person.userId });
    Alert.alert(t('alerts.unavailable'), t(key, { name: person.name || 'This astrologer' }));
  };

  const showOffline = () => {
    captureEvent('consult_blocked', { reason: unreachableReason(unreachable), intent: 'unknown', astrologer_id: person.userId });
    Alert.alert(t('alerts.unavailable'), t(unreachableAlertKey(unreachable), { name: person.name || 'This astrologer' }));
  };

  const handleNotifyMe = async () => {
    const { ok } = await requestNotifyMe(person.userId || person._id, 'chat');
    if (ok) {
      setNotifyMeSent(true);
      Alert.alert("We'll let you know", `We'll notify you when ${person.name || 'this astrologer'} is free.`);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Background Header Arch */}
        <View style={styles.headerBackground} />

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <TouchableOpacity onPress={() => setImageModalVisible(true)} activeOpacity={0.85}>
              <FastImage
                source={{ uri: person.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png', priority: FastImage.priority.high }}
                style={styles.avatar}
              />
            </TouchableOpacity>
            <View style={styles.profileDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={1}>{person.name || 'Astrologer'}</Text>
                <AstrologerBadge type={person.badgeType} variant="inline" />
                <TouchableOpacity onPress={toggleFavorite} disabled={loading} style={styles.favBtn}>
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
                  ) : (
                    <FontAwesome name={isFavorite ? 'heart' : 'heart-o'} size={moderateScale(22)} color={isFavorite ? COLORS.AstroMaroon : '#ccc'} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.specialization} numberOfLines={1}>{person.specialties?.[0]?.name || 'Vedic Astrology'}</Text>
              <Text style={styles.languages} numberOfLines={1}>{languages}</Text>
            </View>
          </View>

          {isOffline && (
            <View style={styles.offlineBanner}>
              <MaterialIcons name={unreachableIcon(unreachable)} size={moderateScale(16)} color="#fff" />
              <Text style={styles.offlineBannerText}>
                {t(unreachableAlertKey(unreachable), { name: person.name || 'This astrologer' })}
              </Text>
            </View>
          )}

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <MaterialIcons name="star" size={moderateScale(18)} color={COLORS.AstroGold} />
              <Text style={styles.statText}>
                {avgRating?.totalReviews ? Number(avgRating.averageRating).toFixed(1) : t('profile.new')}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <MaterialIcons name="work-outline" size={moderateScale(18)} color="#666" />
              <Text style={styles.statText}>{person.experience || '1'} {t('profile.yrs')}</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={() => setModalVisible(true)}>
              <MaterialIcons name="card-giftcard" size={moderateScale(18)} color={COLORS.AstroMaroon} />
              <Text style={[styles.statText, { color: COLORS.AstroMaroon }]}>{t('profile.gift')}</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={onShare}>
              <AntDesign name="sharealt" size={moderateScale(18)} color="#666" />
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={() => setReportModalVisible(true)}>
              <MaterialIcons name="flag" size={moderateScale(18)} color="#999" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          
          {/* Specialization Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="stars" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>{t('profile.specialization')}</Text>
            </View>
            <View style={styles.tagsContainer}>
              {person.specialties?.length > 0 ? (
                person.specialties.map((item, index) => (
                  <View style={styles.tag} key={index}>
                    <Text style={styles.tagText}>{item.name}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.tag}><Text style={styles.tagText}>Vedic Astrology</Text></View>
              )}
            </View>
          </View>

          {/* About Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="info-outline" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>{t('profile.aboutServices')}</Text>
            </View>
            <Text numberOfLines={isExpanded ? undefined : 3} style={styles.bodyText}>
              {person.bio || t('profile.aboutFallback')}
            </Text>
            <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
              <Text style={styles.readMore}>{isExpanded ? t('profile.readLess') : t('home.readMore')}</Text>
            </TouchableOpacity>
          </View>

          {/* Experience Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="school" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>{t('profile.experienceQualification')}</Text>
            </View>
            <Text style={styles.bodyText}>
              {t('profile.experienceBody', { specialties })}
            </Text>
          </View>

          {/* Gifts Card — always shown open (no button/modal gate), one tap sends */}
          {gifts.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="card-giftcard" size={moderateScale(20)} color={COLORS.AstroMaroon} />
                <Text style={styles.sectionTitle}>{t('profile.sendAGift')}</Text>
              </View>
              <View style={styles.giftGrid}>
                {gifts.map((gift) => {
                  const isSending = sendingGiftId === gift._id;
                  return (
                    <TouchableOpacity
                      key={gift._id}
                      style={styles.giftGridItem}
                      activeOpacity={0.8}
                      disabled={isSending}
                      onPress={() => sendGift({
                        astrologerId: person.userId || person._id,
                        gift,
                        context: 'profile',
                        onSent: () => {},
                      })}>
                      <Image source={{ uri: gift.image }} style={styles.giftGridImage} />
                      <Text style={styles.giftGridName} numberOfLines={1}>{gift.name}</Text>
                      <Text style={styles.giftGridPrice}>{isSending ? '…' : `₹${gift.price}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Reviews Card */}
          <View style={[styles.card, { marginBottom: verticalScale(20) }]}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.sectionTitle}>{t('profile.clientReviews')}</Text>
                <Text style={styles.reviewSubText}>{t('profile.reviewsOnAstrowani', { count: avgRating.totalReviews || 0 })}</Text>
              </View>
              {avgRating.totalReviews > 0 && (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingBadgeText}>{Number(avgRating.averageRating).toFixed(1)}</Text>
                  <MaterialIcons name="star" size={moderateScale(14)} color="#FFF" />
                </View>
              )}
            </View>

            {reviewloading ? (
              <ActivityIndicator size="small" color={COLORS.AstroMaroon} style={{ marginVertical: 20 }} />
            ) : reviewError ? (
              <Text style={{ color: 'red', textAlign: 'center' }}>{reviewError}</Text>
            ) : reviewsToShow.length > 0 ? (
              reviewsToShow.map((review, index) => (
                <View key={index} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.reviewerInitial}>{review.user?.firstName?.charAt(0) || 'A'}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: scale(10) }}>
                      <Text style={styles.reviewerName}>{review.user?.firstName || 'Anonymous'}</Text>
                      <StarRating rating={review.rating} size={12} />
                    </View>
                    <Text style={styles.reviewDate}>
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-GB') : ''}
                    </Text>
                  </View>
                  {!!review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
                  {!!review.adminReply && (
                    <Text style={styles.adminReplyText}>{t('profile.astrowaniReplyPrefix')}{review.adminReply}</Text>
                  )}
                  {index !== reviewsToShow.length - 1 && <View style={styles.reviewDivider} />}
                </View>
              ))
            ) : (
              <Text style={{ textAlign: 'center', color: '#888', marginVertical: 15 }}>{t('profile.noReviewsYet')}</Text>
            )}

            <View style={styles.reviewActionRow}>
              {!showAllReviews && reviews.length > 2 && (
                <TouchableOpacity onPress={handleShowAllReviews}>
                  <Text style={styles.actionTextBtn}>{t('profile.showAll')}</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => navigation.navigate('AddReview', { person })} style={styles.addReviewBtn}>
                <Text style={styles.addReviewTxt}>{t('profile.writeReview')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Dock */}
      <View style={styles.floatingDock}>
        {isOffline ? (
          <TouchableOpacity
            style={styles.actionBtnOffline}
            activeOpacity={0.8}
            onPress={showOffline}>
            <MaterialIcons name={unreachableIcon(unreachable)} size={moderateScale(20)} color="#fff" />
            <Text style={[styles.actionBtnTextUnavailable, { marginLeft: scale(8) }]}>{t(unreachableLabelKey(unreachable))}</Text>
          </TouchableOpacity>
        ) : isLive ? (
          // Live is a "happening right now" state, not a wait — tapping jumps straight into
          // the broadcast instead of offering Notify Me (which makes no sense here).
          <TouchableOpacity
            style={[styles.actionBtnLive, { flex: 3 }]}
            activeOpacity={0.8}
            onPress={async () => {
              if (!(await ensureProfileComplete(navigation, 'live'))) return;
              if (person.liveSessionId) {
                navigation.navigate('LiveViewerScreen', { sessionId: person.liveSessionId, astrologer: person });
              } else {
                navigation.navigate('Live');
              }
            }}>
            <MaterialIcons name="live-tv" size={moderateScale(18)} color="#fff" />
            <Text style={[styles.actionBtnTextUnavailable, { marginLeft: scale(6) }]}>
              Live now — tap to watch
            </Text>
          </TouchableOpacity>
        ) : isBusy ? (
          <>
            <View style={styles.actionBtnBusy}>
              <MaterialIcons name="schedule" size={moderateScale(18)} color="#fff" />
              <Text style={[styles.actionBtnTextUnavailable, { marginLeft: scale(6) }]}>
                {formatBusyLabel(busyElapsed)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnNotify, { marginLeft: scale(8) }]}
              activeOpacity={0.8}
              disabled={notifyMeSent}
              onPress={handleNotifyMe}>
              <MaterialIcons name={notifyMeSent ? 'notifications-active' : 'notifications-none'} size={moderateScale(18)} color={COLORS.AstroMaroon} />
              <Text style={[styles.actionBtnText, { marginLeft: scale(4) }]}>{notifyMeSent ? 'Notified' : 'Notify Me'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={chatEnabled ? styles.actionBtn : styles.actionBtnUnavailable}
              activeOpacity={0.8}
              onPress={() => (chatEnabled ? sendChatRequest(person) : showUnavailable('alerts.notAvailableChat'))}>
              <MaterialIcons name={chatEnabled ? 'chat' : 'speaker-notes-off'} size={moderateScale(20)} color={chatEnabled ? COLORS.AstroMaroon : '#fff'} />
              <View style={styles.actionBtnTextCol}>
                <Text style={chatEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{chatEnabled ? t('common.chat') : t('profile.off')}</Text>
                <Text style={chatEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.pricing ? `₹${person.pricing}/min` : t('common.free')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[callEnabled ? styles.actionBtn : styles.actionBtnUnavailable, { marginLeft: scale(8) }]}
              activeOpacity={0.8}
              onPress={() => (callEnabled ? initiateAudioCall() : showUnavailable('alerts.notAvailableCall'))}>
              <MaterialIcons name={callEnabled ? 'call' : 'phone-disabled'} size={moderateScale(20)} color={callEnabled ? COLORS.AstroMaroon : '#fff'} />
              <View style={styles.actionBtnTextCol}>
                <Text style={callEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{callEnabled ? t('common.call') : t('profile.off')}</Text>
                <Text style={callEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.chargePerMinute ? `₹${person.chargePerMinute}/min` : t('common.free')}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[videoEnabled ? styles.actionBtn : styles.actionBtnUnavailable, { marginLeft: scale(8) }]}
              activeOpacity={0.8}
              onPress={() => (videoEnabled ? initiateVideoCall() : showUnavailable('alerts.notAvailableVideo'))}>
              <MaterialIcons name={videoEnabled ? 'videocam' : 'videocam-off'} size={moderateScale(20)} color={videoEnabled ? COLORS.AstroMaroon : '#fff'} />
              <View style={styles.actionBtnTextCol}>
                <Text style={videoEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{videoEnabled ? t('common.video') : t('profile.off')}</Text>
                <Text style={videoEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.videoPrice ? `₹${person.videoPrice}/min` : t('common.free')}</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      <GiftModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        astrologer={person}
        context="profile"
      />

      <RequestingPopup context="astrologer_profile_call"
        visible={isCallWaiting}
        astro={person}
        onCancel={cancelCallRequest}
      />

      <RequestingPopup context="astrologer_profile_chat"
        visible={requesting}
        astro={requestAstro}
        onCancel={cancelRequest}
      />

      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
        statusBarTranslucent>
        <TouchableOpacity
          style={styles.imageModalOverlay}
          activeOpacity={1}
          onPress={() => setImageModalVisible(false)}>
          <StatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
          <FastImage
            source={{ uri: person.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
            style={styles.imageModalPhoto}
            resizeMode={FastImage.resizeMode.contain}
          />
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}>
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalCard}>
            <Text style={styles.reportModalTitle}>Report {person.name || 'Astrologer'}</Text>
            <Text style={styles.reportModalSubtitle}>Why are you reporting this astrologer?</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reportReasonRow, reportReason === reason && styles.reportReasonRowActive]}
                onPress={() => setReportReason(reason)}>
                <MaterialIcons
                  name={reportReason === reason ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={moderateScale(18)}
                  color={reportReason === reason ? COLORS.AstroMaroon : '#999'}
                />
                <Text style={styles.reportReasonText}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.reportNoteInput}
              placeholder="Additional details (optional)"
              placeholderTextColor="#999"
              value={reportNote}
              onChangeText={setReportNote}
              multiline
              numberOfLines={3}
            />
            <View style={styles.reportModalButtons}>
              <TouchableOpacity
                style={styles.reportCancelBtn}
                onPress={() => { setReportModalVisible(false); setReportReason(''); setReportNote(''); }}>
                <Text style={styles.reportCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reportSubmitBtn} onPress={submitReport} disabled={reportSubmitting}>
                {reportSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.reportSubmitText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  scrollContainer: { paddingBottom: verticalScale(100) },
  headerBackground: {
    backgroundColor: COLORS.AstroMaroon,
    height: verticalScale(120),
    borderBottomLeftRadius: moderateScale(40),
    borderBottomRightRadius: moderateScale(40),
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  profileCard: {
    backgroundColor: '#fff',
    marginHorizontal: scale(15),
    marginTop: verticalScale(30),
    borderRadius: moderateScale(20),
    padding: scale(15),
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6,
  },
  profileTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: scale(80), height: scale(80),
    borderRadius: moderateScale(40),
    borderWidth: 1, borderColor: COLORS.AstroMaroon,
  },
  profileDetails: { flex: 1, marginLeft: scale(15) },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileName: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: '#000', flex: 1 },
  favBtn: { padding: scale(5) },
  specialization: { fontSize: moderateScale(13), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(2) },
  languages: { fontSize: moderateScale(12), color: '#666', fontFamily: 'Lato-Regular', marginTop: verticalScale(2) },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#C0392B',
    borderRadius: moderateScale(12), paddingVertical: verticalScale(8), paddingHorizontal: scale(12),
    marginTop: verticalScale(12),
  },
  offlineBannerText: {
    color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(12), marginLeft: scale(8), flex: 1,
  },
  statsBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: verticalScale(15), paddingTop: verticalScale(15),
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: '#333' },
  statDivider: { width: 1, height: '100%', backgroundColor: '#eee' },
  infoSection: { paddingHorizontal: scale(15), marginTop: verticalScale(15) },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(15),
    padding: scale(15),
    marginBottom: verticalScale(15),
    borderWidth: 1.5, borderColor: COLORS.AstroMaroon,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10), gap: 8 },
  sectionTitle: { fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: '#000' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  giftGridItem: {
    width: '25%', alignItems: 'center', paddingVertical: verticalScale(8),
  },
  giftGridImage: { width: moderateScale(48), height: moderateScale(48), borderRadius: moderateScale(10) },
  giftGridName: { fontSize: moderateScale(11), color: '#444', marginTop: verticalScale(4), fontFamily: 'Lato-Regular' },
  giftGridPrice: { fontSize: moderateScale(12), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(2) },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    backgroundColor: 'rgba(128,0,0,0.08)',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(12), paddingVertical: verticalScale(6),
    marginRight: scale(8), marginBottom: verticalScale(8),
  },
  tagText: { fontSize: moderateScale(12), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold' },
  bodyText: { fontSize: moderateScale(13), color: '#444', fontFamily: 'Lato-Regular', lineHeight: 20 },
  readMore: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(8), fontSize: moderateScale(12) },
  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(15) },
  reviewSubText: { fontSize: moderateScale(12), color: '#888', marginTop: verticalScale(2) },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.AstroGold,
    paddingHorizontal: scale(10), paddingVertical: verticalScale(5), borderRadius: moderateScale(12), gap: 4
  },
  ratingBadgeText: { color: '#FFF', fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },
  reviewItem: { marginBottom: verticalScale(15) },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(8) },
  reviewerAvatar: {
    width: scale(35), height: scale(35), borderRadius: scale(17.5),
    backgroundColor: 'rgba(128,0,0,0.1)', justifyContent: 'center', alignItems: 'center'
  },
  reviewerInitial: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontSize: moderateScale(16) },
  reviewerName: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: '#000' },
  reviewDate: { fontSize: moderateScale(11), color: '#999' },
  reviewComment: { fontSize: moderateScale(13), color: '#555', fontFamily: 'Lato-Regular', marginLeft: scale(45) },
  adminReplyText: { fontSize: moderateScale(12), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginLeft: scale(45), marginTop: verticalScale(4), fontStyle: 'italic' },
  reviewDivider: { height: 1, backgroundColor: '#f0f0f0', marginTop: verticalScale(15), marginLeft: scale(45) },
  reviewActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(10) },
  actionTextBtn: { color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', fontSize: moderateScale(13) },
  addReviewBtn: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(16), paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
  },
  addReviewTxt: { color: '#FFF', fontFamily: 'Lato-Bold', fontSize: moderateScale(12) },
  floatingDock: {
    position: 'absolute', bottom: verticalScale(20), left: scale(15), right: scale(15),
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: moderateScale(30),
    padding: scale(8), elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 15,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', backgroundColor: COLORS.AstroGold, borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(10),
  },
  actionBtnUnavailable: {
    flex: 1, flexDirection: 'row', backgroundColor: '#C0392B', borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(10), opacity: 0.9,
  },
  actionBtnOffline: {
    flex: 1, flexDirection: 'row', backgroundColor: '#C0392B', borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(12),
  },
  actionBtnBusy: {
    flex: 2, flexDirection: 'row', backgroundColor: '#E67E22', borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(12),
  },
  actionBtnLive: {
    flex: 2, flexDirection: 'row', backgroundColor: '#C0392B', borderRadius: moderateScale(25),
    justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(12),
  },
  actionBtnNotify: {
    flex: 1, flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25), justifyContent: 'center', alignItems: 'center', paddingVertical: verticalScale(11),
  },
  actionBtnTextCol: { marginLeft: scale(6) },
  actionBtnText: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  actionBtnPrice: { fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, opacity: 0.8 },
  actionBtnTextUnavailable: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: '#fff' },
  actionBtnPriceUnavailable: { fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: '#fff', opacity: 0.85 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalPhoto: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').width,
    borderRadius: moderateScale(8),
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportModalCard: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(20),
  },
  reportModalTitle: { fontSize: moderateScale(17), fontFamily: 'Lato-Bold', color: '#333', marginBottom: 4 },
  reportModalSubtitle: { fontSize: moderateScale(13), color: '#777', marginBottom: verticalScale(14) },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(6),
    gap: scale(10),
  },
  reportReasonRowActive: { backgroundColor: 'rgba(107,31,42,0.06)' },
  reportReasonText: { fontSize: moderateScale(14), color: '#333' },
  reportNoteInput: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: moderateScale(10),
    padding: scale(12),
    fontSize: moderateScale(14),
    color: '#333',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(16),
    textAlignVertical: 'top',
    minHeight: verticalScale(70),
  },
  reportModalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  reportCancelBtn: { paddingVertical: verticalScale(10), paddingHorizontal: scale(16), marginRight: scale(8) },
  reportCancelText: { color: '#777', fontSize: moderateScale(14) },
  reportSubmitBtn: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(10),
    minWidth: scale(80),
    alignItems: 'center',
  },
  reportSubmitText: { color: '#fff', fontSize: moderateScale(14), fontFamily: 'Lato-Bold' },
});

export default AstrologerInfo;
