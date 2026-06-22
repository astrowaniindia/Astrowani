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
} from 'react-native';
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
import useChatRequest from '../../hooks/useChatRequest';
import RequestingPopup from '../../components/RequestingPopup';
import {supabase} from '../../api/SupabaseClient';
import {SOCKET_URL} from '../../config/api';
import {showStatusPopup} from '../../components/StatusPopup';
import StarRating from '../../components/StarRating';
import {ensureProfileComplete} from '../../utils/profileGate';

const { width } = Dimensions.get('window');

const AstrologerInfo = ({route, navigation}) => {
  const {person} = route.params;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFavorite, setIsFavorite] = useState(person.isFavorite || false);
  const [loading, setLoading] = useState(false);
  const [reviewloading, setReviewLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewError, setReviewError] = useState('');
  const [avgRating, setAvgRating] = useState('');
  const [avgError, setAvgError] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [isCallWaiting, setIsCallWaiting] = useState(false);

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
      if (!(await ensureProfileComplete(navigation))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert('Error', 'Please login to continue.');
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = person.chargePerMinute || person.pricing || 15;
      const minRequired = pricePerMin * 5;

      const {data: customer, error: walletErr} = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();

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

      setIsCallWaiting(true);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: person.userId, callType: 'audio', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to initiate call.');
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
          astrologer_id: person.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: 'audio',
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }])
        .select()
        .single();

      if (reqErr) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to send call request.');
        return;
      }

      // Track pending request so cancel/back/timeout can dismiss the vendor's popup
      activeCallRef.current = { requestId: requestData.id, astrologerId: person.userId, roomId };

      const sock = io(SOCKET_URL);
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
          showStatusPopup({ variant: 'busy', title: 'Astrologer Busy', message: 'Astrologer is busy right now. Please try again after some time.' });
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
                showStatusPopup({ variant: 'busy', title: 'Astrologer Busy', message: 'Astrologer is busy right now. Please try again after some time.' });
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
          showStatusPopup({ variant: 'missed', title: 'Not Answered', message: 'Your audio call was not picked up. Please try again later.' });
        }
      }, 60000);
    } catch (err) {
      setIsCallWaiting(false);
      console.error('[AstrologerInfo] initiateAudioCall error:', err);
      Alert.alert('Error', 'Failed to initiate call. Please try again.');
    }
  };

  const initiateVideoCall = async () => {
    try {
      if (!(await ensureProfileComplete(navigation))) return;
      const token = await AsyncStorage.getItem('token');
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr || !token) {
        Alert.alert('Error', 'Please login to continue.');
        return;
      }
      const userEntireData = JSON.parse(userDataStr);

      const pricePerMin = person.videoPrice || person.chargePerMinute || person.pricing || 15;
      const minRequired = pricePerMin * 5;

      const {data: customer, error: walletErr} = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();

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

      setIsCallWaiting(true);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        {receiverId: person.userId, callType: 'video', callerRole: 'customer'},
        {headers: {Authorization: `Bearer ${token}`}},
      );

      if (response.status !== 200) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to initiate video call.');
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
          astrologer_id: person.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: 'video',
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }])
        .select()
        .single();

      if (reqErr) {
        setIsCallWaiting(false);
        Alert.alert('Error', 'Failed to send call request.');
        return;
      }

      // Track pending request so cancel/back/timeout can dismiss the vendor's popup
      activeCallRef.current = { requestId: requestData.id, astrologerId: person.userId, roomId };

      const sock = io(SOCKET_URL);
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
          showStatusPopup({ variant: 'busy', title: 'Astrologer Busy', message: 'Astrologer is busy right now. Please try again after some time.' });
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
                showStatusPopup({ variant: 'busy', title: 'Astrologer Busy', message: 'Astrologer is busy right now. Please try again after some time.' });
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
          showStatusPopup({ variant: 'missed', title: 'Not Answered', message: 'Your video call was not picked up. Please try again later.' });
        }
      }, 60000);
    } catch (err) {
      setIsCallWaiting(false);
      console.error('[AstrologerInfo] initiateVideoCall error:', err);
      Alert.alert('Error', 'Failed to initiate video call. Please try again.');
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
    const unavailable = label =>
      Alert.alert('Unavailable', `${person.name || 'This astrologer'} is not available for ${label} right now.`);
    const t = setTimeout(() => {
      if (action === 'chat') {
        person.isChatEnabled !== false ? sendChatRequest(person) : unavailable('chat');
      } else if (action === 'call') {
        person.isCallEnabled !== false ? initiateAudioCall() : unavailable('calls');
      } else if (action === 'video') {
        person.isVideoEnabled !== false ? initiateVideoCall() : unavailable('video call');
      }
    }, 400);
    return () => clearTimeout(t);
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
      await Instance.post(
        next ? '/api/favoriteAstrologer/add' : '/api/favoriteAstrologer/remove',
        { astrologerId: person._id },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
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

  const showUnavailable = serviceLabel =>
    Alert.alert('Unavailable', `${person.name || 'This astrologer'} is not available for ${serviceLabel} right now.`);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Background Header Arch */}
        <View style={styles.headerBackground} />

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <Image
              source={{ uri: person.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
              style={styles.avatar}
            />
            <View style={styles.profileDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName} numberOfLines={1}>{person.name || 'Astrologer'}</Text>
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

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <MaterialIcons name="star" size={moderateScale(18)} color={COLORS.AstroGold} />
              <Text style={styles.statText}>
                {avgRating?.totalReviews ? Number(avgRating.averageRating).toFixed(1) : 'New'}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <MaterialIcons name="work-outline" size={moderateScale(18)} color="#666" />
              <Text style={styles.statText}>{person.experience || '1'} Yrs</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={() => setModalVisible(true)}>
              <MaterialIcons name="card-giftcard" size={moderateScale(18)} color={COLORS.AstroMaroon} />
              <Text style={[styles.statText, { color: COLORS.AstroMaroon }]}>Gift</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity style={styles.statItem} onPress={onShare}>
              <AntDesign name="sharealt" size={moderateScale(18)} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Cards */}
        <View style={styles.infoSection}>
          
          {/* Specialization Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="stars" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>Specialization</Text>
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
              <Text style={styles.sectionTitle}>About My Services</Text>
            </View>
            <Text numberOfLines={isExpanded ? undefined : 3} style={styles.bodyText}>
              {person.bio || 'Experienced and professional astrologer here to guide you through your life journey.'}
            </Text>
            <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
              <Text style={styles.readMore}>{isExpanded ? 'Read Less' : 'Read More'}</Text>
            </TouchableOpacity>
          </View>

          {/* Experience Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="school" size={moderateScale(20)} color={COLORS.AstroMaroon} />
              <Text style={styles.sectionTitle}>Experience & Qualification</Text>
            </View>
            <Text style={styles.bodyText}>
              With several years of dedicated practice, I've honed my skills in {specialties}.
            </Text>
          </View>

          {/* Reviews Card */}
          <View style={[styles.card, { marginBottom: verticalScale(20) }]}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Client Reviews</Text>
                <Text style={styles.reviewSubText}>{avgRating.totalReviews || 0} reviews on Astrowani</Text>
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
                    <Text style={styles.adminReplyText}>↳ Astrowani: {review.adminReply}</Text>
                  )}
                  {index !== reviewsToShow.length - 1 && <View style={styles.reviewDivider} />}
                </View>
              ))
            ) : (
              <Text style={{ textAlign: 'center', color: '#888', marginVertical: 15 }}>No reviews yet.</Text>
            )}

            <View style={styles.reviewActionRow}>
              {!showAllReviews && reviews.length > 2 && (
                <TouchableOpacity onPress={handleShowAllReviews}>
                  <Text style={styles.actionTextBtn}>Show All</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => navigation.navigate('AddReview', { person })} style={styles.addReviewBtn}>
                <Text style={styles.addReviewTxt}>+ Write Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Dock */}
      <View style={styles.floatingDock}>
        <TouchableOpacity
          style={chatEnabled ? styles.actionBtn : styles.actionBtnUnavailable}
          activeOpacity={0.8}
          onPress={() => (chatEnabled ? sendChatRequest(person) : showUnavailable('chat'))}>
          <MaterialIcons name={chatEnabled ? 'chat' : 'speaker-notes-off'} size={moderateScale(20)} color={chatEnabled ? COLORS.AstroMaroon : '#fff'} />
          <View style={styles.actionBtnTextCol}>
            <Text style={chatEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{chatEnabled ? 'Chat' : 'Off'}</Text>
            <Text style={chatEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.pricing ? `₹${person.pricing}/min` : 'Free'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[callEnabled ? styles.actionBtn : styles.actionBtnUnavailable, { marginLeft: scale(8) }]}
          activeOpacity={0.8}
          onPress={() => (callEnabled ? initiateAudioCall() : showUnavailable('calls'))}>
          <MaterialIcons name={callEnabled ? 'call' : 'phone-disabled'} size={moderateScale(20)} color={callEnabled ? COLORS.AstroMaroon : '#fff'} />
          <View style={styles.actionBtnTextCol}>
            <Text style={callEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{callEnabled ? 'Call' : 'Off'}</Text>
            <Text style={callEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.chargePerMinute ? `₹${person.chargePerMinute}/min` : 'Free'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[videoEnabled ? styles.actionBtn : styles.actionBtnUnavailable, { marginLeft: scale(8) }]}
          activeOpacity={0.8}
          onPress={() => (videoEnabled ? initiateVideoCall() : showUnavailable('video call'))}>
          <MaterialIcons name={videoEnabled ? 'videocam' : 'videocam-off'} size={moderateScale(20)} color={videoEnabled ? COLORS.AstroMaroon : '#fff'} />
          <View style={styles.actionBtnTextCol}>
            <Text style={videoEnabled ? styles.actionBtnText : styles.actionBtnTextUnavailable}>{videoEnabled ? 'Video' : 'Off'}</Text>
            <Text style={videoEnabled ? styles.actionBtnPrice : styles.actionBtnPriceUnavailable}>{person.videoPrice ? `₹${person.videoPrice}/min` : 'Free'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <GiftModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        astrologer={person}
        context="profile"
      />

      <RequestingPopup
        visible={isCallWaiting}
        astro={person}
        onCancel={cancelCallRequest}
      />

      <RequestingPopup
        visible={requesting}
        astro={requestAstro}
        onCancel={cancelRequest}
      />
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
    borderWidth: 3, borderColor: COLORS.AstroSoftOrange,
  },
  profileDetails: { flex: 1, marginLeft: scale(15) },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileName: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: '#000', flex: 1 },
  favBtn: { padding: scale(5) },
  specialization: { fontSize: moderateScale(13), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(2) },
  languages: { fontSize: moderateScale(12), color: '#666', fontFamily: 'Lato-Regular', marginTop: verticalScale(2) },
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
  actionBtnTextCol: { marginLeft: scale(6) },
  actionBtnText: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  actionBtnPrice: { fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, opacity: 0.8 },
  actionBtnTextUnavailable: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: '#fff' },
  actionBtnPriceUnavailable: { fontSize: moderateScale(9), fontFamily: 'Lato-Bold', color: '#fff', opacity: 0.85 },
});

export default AstrologerInfo;
