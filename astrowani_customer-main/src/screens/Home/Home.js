import React, {useState, useEffect, act, useTransition, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Alert,
  RefreshControl,
  Animated
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';
import Swiper from 'react-native-swiper';
import Astrologers, {LiveAstrologers, Reviews, services} from './Astrologers';
import Instance from '../../api/ApiCall';
import FreeServicesScreen from '../drawerScreens/FreeSeviceScreen/FreeServicesScreen';
import HomeRemedies from '../Remedies/HomeRemedies';
import CustomerReview from './Review';
import Remedies from '../Remedies/Remedies';
import axios from 'axios';
import { showAlert } from '../../Component/CustomAlert';
import { supabase } from '../../api/SupabaseClient';
import io from 'socket.io-client';
import { LanguageContext } from '../../context/LanguageContext';
import { SOCKET_URL } from '../../config/api';
import { showStatusPopup } from '../../components/StatusPopup';
import StarRating from '../../components/StarRating';
import { isProfileComplete as checkProfileComplete, ensureProfileComplete } from '../../utils/profileGate';

// Bundled fallback banners — shown until the admin adds real banners in the dashboard.
const FALLBACK_BANNERS = [
  require('../../assets/images/banner.jpeg'),
  require('../../assets/images/mainlogo.jpeg'),
];

const FadeBanner = ({ banners, intervalMs = 4000 }) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  // Use admin banners when available; otherwise the bundled fallbacks.
  // Each entry is a valid RN Image source ({uri} for remote/base64, or a require() id).
  const slides = (banners && banners.length > 0)
    ? banners.filter(b => b?.imageUrl).map(b => ({ uri: b.imageUrl }))
    : FALLBACK_BANNERS;

  React.useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0.2,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      });
    }, Math.max(1000, intervalMs));
    return () => clearInterval(interval);
  }, [slides.length, intervalMs]);

  if (!slides || slides.length === 0) return null;
  const safeIndex = currentIndex % slides.length;

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <Image
        source={slides[safeIndex]}
        style={{ width: '100%', height: '100%', borderRadius: 15 }}
        resizeMode="cover"
      />
    </Animated.View>
  );
};

const Home = ({navigation}) => {
  const { t } = React.useContext(LanguageContext);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [loadingAstrologer, setLoadingAstrologer] = useState(true);
  const [topRatedReviews, setTopRatedReviews] = useState([]);
  const [error, setError] = useState(null);
  const [errroBlogs, setErrorBlogs] = useState(null);
  const [errorAstrologer, setErrorAstrologer] = useState(null);
  const [categories, setCategories] = useState(null);
  const [blogs, setBlogs] = useState(null);
  const [blogsToshow, setBlogsToShow] = useState(null);
  const [astrologer, setAstrologer] = useState(null);
  const [astrologerToShow, setAstrologerToShow] = useState(null);
  const [errorReview, setErrorReview] = useState(null);
  const [loadingReview, setLoadingReview] = useState(true);
  const [banners, setBanners] = useState([]);
  const [bannerIntervalMs, setBannerIntervalMs] = useState(4000);
  const [liveAstro, setLiveAstro] = useState([]);
  const [thought, setThought] = useState();
  const [user, setUser] = useState(null);

  // const [categories, setCategories] = useState([])
  // const [topReviews, setTopReviews] = useState(null);
  const {height} = Dimensions.get('window');
  // console.log("b;log to showww", blogsToshow);
  const images = [
    require('../../assets/images/mainlogo.jpeg'),
    require('../../assets/images/banner.jpeg'),
  ];
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitingAstroName, setWaitingAstroName] = useState('');

  const listRef = React.useRef(null);
  const scrollOffset = React.useRef(0);
  const isAutoScrolling = React.useRef(true);

  // Call signaling refs — mirror the Call.js (Talk-To-Experts) pattern.
  // Mount-time socket joins the customer's personal room so call_accepted arrives
  // reliably even if the vendor accepts within seconds.
  const socketRef = React.useRef(null);
  const callChannelRef = React.useRef(null);
  const navigatedRef = React.useRef(false);
  // Tracks the in-flight call request so cancel/back can mark it cancelled + notify the vendor
  const activeCallRef = React.useRef(null);

  React.useEffect(() => {
    const setup = async () => {
      socketRef.current = io(SOCKET_URL);
      socketRef.current.on('connect', async () => {
        const userStr = await AsyncStorage.getItem('userData');
        const u = userStr ? JSON.parse(userStr) : null;
        if (u?.id) socketRef.current.emit('join_room', u.id);
      });
      socketRef.current.on('connect_error', err =>
        console.error('[HomeScreen] Socket error:', err.message),
      );
    };
    setup();
    return () => {
      if (callChannelRef.current) supabase.removeChannel(callChannelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);
  
  const loopedAstrologers = React.useMemo(() => {
    if (!astrologerToShow || astrologerToShow.length === 0) return [];
    return Array(1000).fill(astrologerToShow).flat();
  }, [astrologerToShow]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (isAutoScrolling.current && listRef.current && loopedAstrologers.length > 0) {
        scrollOffset.current += 1; 
        try {
          listRef.current.scrollToOffset({ offset: scrollOffset.current, animated: false });
        } catch (e) {}
      }
    }, 16);
    return () => clearInterval(timer);
  }, [loopedAstrologers.length]);

  // Cancel the in-flight call request and tear down listeners/timeout.
  // Also marks the request 'cancelled' in Supabase + tells the vendor so their
  // incoming-call popup dismisses (keeps both apps in sync on back/cancel/timeout).
  // status: 'cancelled' (user abandoned) | 'missed' (timeout, no answer) | 'rejected' (vendor declined).
  // On 'rejected' the vendor already set the row status, so we don't overwrite it.
  const cancelCall = (msg, status = 'cancelled', title = 'Call Ended') => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    const active = activeCallRef.current;
    activeCallRef.current = null;
    if (active?.requestId) {
      if (status !== 'rejected') {
        supabase
          .from('call_requests')
          .update({ status })
          .eq('id', active.requestId)
          .then(() => {}, () => {});
      }
      // Fast path: socket event so the vendor popup closes immediately.
      socketRef.current?.emit('cancel_call', {
        astrologer_id: active.astrologerId,
        requestId: active.requestId,
        roomId: active.roomId,
      });
    }
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

  const getRoomTokenWebCall = async item => {
    if (!(await ensureProfileComplete(navigation))) return null;
    try {
      const token = await AsyncStorage.getItem('token');
      const userEntireData = JSON.parse(await AsyncStorage.getItem('userData'));

      // Wallet check — need at least 5 minutes worth (matches Call.js)
      const pricePerMin = Number(item.chargePerMinute || item.pricing || 0);
      const minRequired = pricePerMin * 5;
      const { data: customer, error: walletErr } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();
      if (walletErr) {
        Alert.alert('Error', 'Failed to verify wallet balance.');
        return null;
      }
      if (customer.wallet_balance < minRequired) {
        Alert.alert(
          'Insufficient Balance',
          `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`,
        );
        return null;
      }

      navigatedRef.current = false;
      setIsWaiting(true);
      setWaitingAstroName(item.name);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        { receiverId: item.userId, callType: 'audio', callerRole: 'customer', name: item.name },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.status !== 200) {
        setIsWaiting(false);
        Alert.alert('Error', response.data.error || 'Unexpected Error');
        return null;
      }

      const callerToken = response.data.data?.token?.token || response.data.token?.token || response.data.token;
      const vendorToken = response.data.data?.vendorToken || response.data.vendorToken || callerToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId = response.data.data?.sessionId || response.data.sessionId;

      const { data: requestData, error: requestError } = await supabase
        .from('call_requests')
        .insert([{
          customer_id: userEntireData.id,
          astrologer_id: item.userId,
          customer_name: userEntireData.name || 'Customer',
          call_type: 'audio',
          status: 'pending',
          room_id: roomId,
          room_token: vendorToken,
        }])
        .select()
        .single();

      if (requestError) {
        setIsWaiting(false);
        Alert.alert('Error', 'Failed to send request to astrologer.');
        return null;
      }

      // Remember the in-flight request so cancel/back can notify the vendor
      activeCallRef.current = { requestId: requestData.id, astrologerId: item.userId, roomId };

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
        // Audio call → VoiceCallScreen (live audio screen, matches Talk-To-Experts flow)
        navigation.navigate('VoiceCallScreen', {
          token: callerToken,
          sessionId: dbSessionId || backendSessionId,
          recieverName: item.name,
          recieverImage: item.profileImage || '',
          recieverId: item.userId || item._id,
        });
      };

      // Tell backend to ring the vendor via the already-connected mount-time socket
      socketRef.current?.emit('initiate_call', {
        astrologer_id: item.userId,
        customer_id: userEntireData.id,
        customer_name: userEntireData.name || 'Customer',
        call_type: 'audio',
        room_id: roomId,
        room_token: vendorToken,
      });

      // Socket listeners — mount-time socket is already connected and in customer's room
      socketRef.current?.once('call_accepted', data => goToCall(data.sessionId));
      socketRef.current?.on('call_rejected', () =>
        cancelCall('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy'),
      );

      // Supabase Realtime backup (catches acceptance even if socket misses it)
      const channel = supabase
        .channel(`call_request_home_${requestData.id}`)
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
              cancelCall('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cancelCall('Your audio call was not picked up. Please try again later.', 'missed', 'Not Answered');
      }, 60000);

      return response.data.token;
    } catch (error) {
      setIsWaiting(false);
      Alert.alert('Error', 'Failed to initiate call');
      return null;
    }
  };

  // Video call from a Home card — mirrors getRoomTokenWebCall but callType:'video'
  // and navigates to VideoCallScreen (same flow as the Video-With-Experts tab).
  const initiateVideoCall = async item => {
    if (!(await ensureProfileComplete(navigation))) return null;
    try {
      const token = await AsyncStorage.getItem('token');
      const userEntireData = JSON.parse(await AsyncStorage.getItem('userData'));

      // Wallet check — need at least 5 minutes worth (video rate)
      const pricePerMin = Number(item.videoPrice || item.chargePerMinute || item.pricing || 0);
      const minRequired = pricePerMin * 5;
      const { data: customer, error: walletErr } = await supabase
        .from('customers')
        .select('wallet_balance')
        .eq('id', userEntireData.id)
        .single();
      if (walletErr) {
        Alert.alert('Error', 'Failed to verify wallet balance.');
        return null;
      }
      if (customer.wallet_balance < minRequired) {
        Alert.alert(
          'Insufficient Balance',
          `You need at least ₹${minRequired} to connect. Current balance: ₹${customer.wallet_balance}. Please recharge.`,
        );
        return null;
      }

      navigatedRef.current = false;
      setIsWaiting(true);
      setWaitingAstroName(item.name);

      const response = await axios.post(
        `${SOCKET_URL}/api/call/initiate`,
        { receiverId: item.userId, callType: 'video', callerRole: 'customer', name: item.name },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.status !== 200) {
        setIsWaiting(false);
        Alert.alert('Error', response.data.error || 'Unexpected Error');
        return null;
      }

      const callerToken = response.data.data?.token?.token || response.data.token?.token || response.data.token;
      const vendorToken = response.data.data?.vendorToken || response.data.vendorToken || callerToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId = response.data.data?.sessionId || response.data.sessionId;

      const { data: requestData, error: requestError } = await supabase
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

      if (requestError) {
        setIsWaiting(false);
        Alert.alert('Error', 'Failed to send request to astrologer.');
        return null;
      }

      // Remember the in-flight request so cancel/back can notify the vendor
      activeCallRef.current = { requestId: requestData.id, astrologerId: item.userId, roomId };

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

      socketRef.current?.emit('initiate_call', {
        astrologer_id: item.userId,
        customer_id: userEntireData.id,
        customer_name: userEntireData.name || 'Customer',
        call_type: 'video',
        room_id: roomId,
        room_token: vendorToken,
      });

      socketRef.current?.once('call_accepted', data => goToCall(data.sessionId));
      socketRef.current?.on('call_rejected', () =>
        cancelCall('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy'),
      );

      const channel = supabase
        .channel(`video_call_request_home_${requestData.id}`)
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
              cancelCall('Astrologer is busy right now. Please try again after some time.', 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cancelCall('Your video call was not picked up. Please try again later.', 'missed', 'Not Answered');
      }, 60000);

      return response.data.token;
    } catch (error) {
      setIsWaiting(false);
      Alert.alert('Error', 'Failed to initiate video call');
      return null;
    }
  };
  const getBanner = async () => {
    return await Instance(`/api/banners/all?app=customer`)
      .then(response => {
        // console.log("response: ", response?.data);
        setBanners(response?.data?.data);
        const secs = Number(response?.data?.intervalSeconds);
        if (secs > 0) setBannerIntervalMs(secs * 1000);
      })
      .catch(error => {
        console.log('error on getBanner: ', error);
      });
  };
  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }

      const response = await Instance.get('/api/users/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data) {
        const userData = response.data.data;
        // Check if userData is empty object
        if (Object.keys(userData).length === 0) {
          // navigation.navigate('UserProfileScreen', {user: userData});
          // return;
        }
        // ✅ Check if email is missing, null, undefined, or empty string
        if (!userData.email || userData.email.trim() === '') {
          // navigation.navigate('UserProfileScreen', {user: userData});
          // return;
        }
      setUser(userData);
      // Store user data in AsyncStorage for chat screens
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      console.log(userData, 'this is user data++++++++++++++');
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
      // navigation.navigate('UserProfileScreen');
    }
  };

  const getThoutsOfTheDay = async () => {
    return await Instance(`/api/thoughts/latest`)
      .then(response => {
        // console.log("response: ", response?.data);
        setThought(response?.data);
        setLoading(false);
      })
      .catch(error => {
        console.log('error on getThoutsOfTheDay: ', error);
        setLoading(false);
      });
  };
    const fetchCategories = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          throw new Error('Token not found');
        }
        const response = await Instance.get('/api/categories', {
          headers: {Authorization: `Bearer ${token}`},
        });

        setCategories(response?.data?.categories);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    const fetchBlogs = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');
        const response = await Instance.get('/api/blogs', {
          headers: {Authorization: `Bearer ${token}`},
        });
        const sliceData =
          response.data.length >= 6 ? response.data.slice(0, 6) : response.data;
        setBlogsToShow(sliceData);
        setBlogs(response.data);
      } catch (err) {
        setErrorBlogs(err.message);
      } finally {
        setLoadingBlogs(false);
      }
    };
    const fetchAstrologer = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');
        const response = await Instance.get('/api/astrologers', {
          headers: {Authorization: `Bearer ${token}`},
        });
        const astroResponse = response.data.data || [];
        // Show every astrologer in the carousel (no hard slice, no filtering).
        // Per-card Chat/Call buttons reflect each astrologer's toggles (red "Unavailable" when off).
        setAstrologerToShow(astroResponse);
        setAstrologer(astroResponse);
      } catch (err) {
        setErrorAstrologer(err.message);
      } finally {
        setLoadingAstrologer(false);
      }
    };

    const getLiveAstro = async () => {
      // Only astrologers actually broadcasting (real lives, not fake "Scheduled").
      return await Instance.get(`/api/live/active`)
        .then(response => {
          setLiveAstro(response.data.data || []);
          setLoading(false);
        })
        .catch(error => {
          console.log('getLiveAstro: ', error);
          setLoading(false);
        });
    };

    const fetchTopReviews = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get(
          '/api/reviews/astrologers/reviews',
          {
            headers: {Authorization: `Bearer ${token}`},
          }
        );

        const sortedReviews = response.data.sort((a, b) => b.rating - a.rating);

        const topReviews =
          sortedReviews.length >= 5 ? sortedReviews.slice(0, 5) : sortedReviews;

        setTopRatedReviews(topReviews);
      } catch (err) {
        setErrorReview(err.message);
      } finally {
        setLoadingReview(false);
      }
    };

  const loadAllData = () => {
    getBanner();
    getThoutsOfTheDay();
    fetchUserProfile();
    fetchAstrologer();
    fetchCategories();
    fetchBlogs();
    fetchTopReviews();
    getLiveAstro();
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Refresh the astrologer carousel whenever Home regains focus (catches vendor toggle changes)
  useFocusEffect(
    useCallback(() => {
      fetchAstrologer();
    }, []),
  );

  // Live sync — re-fetch the carousel when any astrologer row changes.
  // Unique channel name per mount: a fixed name makes supabase.channel() return an
  // already-subscribed channel, and chaining .on() after subscribe() throws
  // ("cannot add postgres_changes callbacks ... after subscribe()").
  const astroChannelName = React.useRef(
    `home-astro-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  ).current;
  useEffect(() => {
    const channel = supabase
      .channel(astroChannelName)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'astrologers'},
        () => fetchAstrologer(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Live sync — re-fetch the blog carousel when the admin publishes/edits a blog.
  // Unique channel name per mount (same rule as the astrologer subscription above).
  const blogChannelName = React.useRef(
    `home-blog-list-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  ).current;
  useEffect(() => {
    const channel = supabase
      .channel(blogChannelName)
      .on(
        'postgres_changes',
        {event: '*', schema: 'public', table: 'blogs'},
        () => fetchBlogs(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const handleMorePress = review => {
    setSelectedReview(review);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedReview(null);
  };
  const handleSearch = () => {
    navigation.navigate('SearchScreen', {data: astrologer});
  };

  const openAstrologer = (person) => {
    console.log(person,"%%%%%%%%%%%%%%%%%");
    navigation.navigate('AstrologerInfo', {person: person});
  };

  // Shared profile-gate check (name, valid email, gender, dob, place of birth).
  const isProfileComplete = () => checkProfileComplete(user);

  const handleChatPress = async (item) => {
    if (!(await ensureProfileComplete(navigation))) return;
    console.log("Starting chat from Home with astrologer:", item._id);
    console.log(item,"this is items")
    navigation.navigate('PersonToPersonChat', {
      person: item,
    });
  };

  const handleServiceSelect = service => {
    if (service.title === "Today's Panchang") {
      navigation.navigate('PanchangScreen');
    } else if (service.title === 'Janam Kundali') {
      navigation.navigate('JanamKundaliScreen');
    } else if (service.title === 'Kundali Match') {
      navigation.navigate('KundaliMatchScreen');
    } else if (service.title === 'Free Horoscope') {
      navigation.navigate('Horoscope');
    } else if (service.title === 'Shubh Muhurat') {
      navigation.navigate('ShubhMuhurat');
    } else if (service.title === 'Vrat and Upvaas') {
      navigation.navigate('VrataUpvaas');
    }
  };

  const renderAstrologerList = ({item}) => {
    const languages = item.language?.join(', ');
    return (
      <TouchableOpacity
        onPress={() => openAstrologer(item)}
        style={styles.AstrologerCard}>
        <Image
          resizeMode="contain"
          source={{
            uri:
              item.profileImage ||
              'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
          }}
          style={styles.AstroImage}
        />
        <View style={styles.infoWrapper}>
          <Text style={styles.name}>{item.name || 'Name'}</Text>
          <Text style={styles.specialty}>
            {item.specialties[0]?.name || 'vedic Astrology'}
          </Text>
          <Text style={styles.exp}>Exp: {item.experience || '0'} years</Text>
          <Text style={styles.language}>{languages || 'hindi'}</Text>
        </View>
        <View style={styles.btnView}>
          <Text style={[styles.charge, {color: 'green'}]}>
            {item.isFree ? 'Free' : `₹${item.chargePerMinute || 0}/min`}
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                item.isChatEnabled
                  ? handleChatPress(item)
                  : Alert.alert('Unavailable', `${item.name || 'This astrologer'} is not available for chat right now.`)
              }
              style={item.isChatEnabled ? styles.chatBtn : styles.unavailableBtn}>
              <Text style={item.isChatEnabled ? styles.chatBtnTxt : styles.unavailableBtnTxt}>{item.isChatEnabled ? t('chat') : 'No Chat'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                item.isCallEnabled
                  ? getRoomTokenWebCall(item)
                  : Alert.alert('Unavailable', `${item.name || 'This astrologer'} is not available for calls right now.`)
              }
              style={item.isCallEnabled ? styles.callButton : styles.unavailableBtn}>
              <Text style={item.isCallEnabled ? styles.chatBtnTxt : styles.unavailableBtnTxt}>{item.isCallEnabled ? t('call') : 'No Call'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                item.isVideoEnabled
                  ? initiateVideoCall(item)
                  : Alert.alert('Unavailable', `${item.name || 'This astrologer'} is not available for video call right now.`)
              }
              style={item.isVideoEnabled ? styles.videoButton : styles.unavailableBtn}>
              <Text style={item.isVideoEnabled ? styles.chatBtnTxt : styles.unavailableBtnTxt}>{item.isVideoEnabled ? 'Video' : 'No Video'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderReviewList = ({item}) => {
    return (
      <TouchableOpacity
        onPress={() => handleMorePress(item)}
        style={styles.ReviewCard}>
        <View style={styles.reviewImageView}>
          <Image
            source={{
              uri:
                item.user?.profilePic ||
                'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
            }}
            style={styles.ReviewerImage}
          />

          <StarRating rating={item.rating} totalReviews={item.totalReviews} size={14} style={styles.starsContainer} />
        </View>

        <View style={styles.ReviewWrapper}>
          <View>
            <Text style={styles.reviewer}>
              {item.user?.firstName || 'Anonymous'}
            </Text>
            <Text style={styles.date}>{item?.createdAt || '3 may 2024'}</Text>
          </View>
          <Text style={styles.review} numberOfLines={3} ellipsizeMode="tail">
            {item.comment || 'no comment'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const AstrologerItem = ({astrologer}) => {
    return (
      <TouchableOpacity
        style={styles.AstroBackWrapper}
        onPress={() =>
          navigation.navigate('LiveViewerScreen', {
            sessionId: astrologer.sessionId,
            astrologer,
          })
        }>
        <Image
          source={{uri: astrologer.profileImage || astrologer.image}}
          style={styles.liveAstrologerimg}
        />
        <View style={[styles.livebtn, styles.live]}>
          <Text style={styles.livetxt}>{t('live')}</Text>
        </View>
        <View style={styles.astroNameview}>
          <Text style={styles.livename}>{astrologer.name}</Text>
          <Text style={styles.topic}>{astrologer.specialties?.[0]?.name || ''}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const BlogItem = ({blog}) => {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('BlogScreen', {data: blog})}
        style={styles.blogCard}>
        <Image style={styles.blogImg} source={{uri: blog.thumbnail}} />
        <Text style={styles.blogTitle}>{blog.title}</Text>
        <Text style={styles.blogContent} numberOfLines={2} ellipsizeMode="tail">
          {blog.metaDescription}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{flex: 1, backgroundColor: COLORS.AstroMaroon}}>
      <ScrollView 
        style={{flex: 1}}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.AstroMaroon]} />
        }
      >
        <View style={styles.searchBtnView}>
          <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
            <MaterialIcons name="search" size={24} color="#800000" />
            <Text style={styles.searchTxt}>{t('search')}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={{
            backgroundColor: COLORS.AstroMaroon,
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            paddingBottom: 40,
            paddingTop: 5,
            paddingHorizontal: '5%',
          }}>
          <Text style={[styles.topAstrologerTxt, {color: 'white', textAlign: 'center'}]}>
            {thought?.thoughtText || t('welcome')}
          </Text>
        </View>

        <View style={{
          backgroundColor: COLORS.AstroSoftOrange, 
          flex: 1, 
          paddingBottom: 50,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          marginTop: -25,
          paddingTop: 20,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 5
        }}>
          <View style={{height: 150, marginHorizontal: 15, borderRadius: 15, overflow: 'hidden'}}>
            <FadeBanner banners={banners} intervalMs={bannerIntervalMs} />
          </View>

          <View style={styles.topAstrologers}>
            <Text style={styles.topAstrologerTxt}>{t('bestAstrologers')}</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => navigation.navigate('Chat')}>
              <Text style={styles.viewAll}>{t('viewAll')}</Text>
            </TouchableOpacity>
          </View>
        {loadingAstrologer ? (
          <View style={styles.indicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : errorAstrologer ? (
          <Text style={styles.errorText}>{errorAstrologer}</Text>
        ) : (
          <FlatList
            ref={listRef}
            data={loopedAstrologers}
            keyExtractor={(item, index) => item._id.toString() + index.toString()}
            renderItem={renderAstrologerList}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.astrologerList}
            onScroll={(e) => {
              if (!isAutoScrolling.current) {
                scrollOffset.current = e.nativeEvent.contentOffset.x;
              }
            }}
            scrollEventThrottle={16}
            onTouchStart={() => { isAutoScrolling.current = false; }}
            onTouchEnd={() => { isAutoScrolling.current = true; }}
            onTouchCancel={() => { isAutoScrolling.current = true; }}
            onScrollBeginDrag={() => { isAutoScrolling.current = false; }}
            onScrollEndDrag={() => { isAutoScrolling.current = true; }}
            onMomentumScrollBegin={() => { isAutoScrolling.current = false; }}
            onMomentumScrollEnd={() => { isAutoScrolling.current = true; }}
          />
        )}

        <View style={styles.separator} />

        <Text style={styles.CategoryTitle}>Astrowani's Categories</Text>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.CategoryView}>
              {loading ? (
                <View style={styles.indicator}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                categories?.length > 0 &&
                categories?.map((item, index) => (
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('CategoryAstrologers', {
                        categoryId: item._id,
                        categoryName: item.name,
                      })
                    }
                    key={index}
                    style={styles.category}>
                    <FastImage
                      style={styles.categoryImg}
                      resizeMode="cover"
                      source={{
                        uri:
                          item.image ||
                          'https://th.bing.com/th/id/OIP.u8mYbwil7gU0BZejsy4ySAAAAA?w=276&h=176&c=7&r=0&o=5&pid=1.7',
                        priority: FastImage.priority.normal,
                      }}
                    />
                    <Text style={styles.categoryName}>{item.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>{t('remedies')}</Text>
        </View>

        <HomeRemedies navigation={navigation} />

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>Live Astrologers</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => navigation.navigate('Live')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={liveAstro}
          renderItem={({item}) => <AstrologerItem astrologer={item} />}
          keyExtractor={item => item.name}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.liveAstrologersView}
        />
        
        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>Free Services</Text>
        </View>
        <FreeServicesScreen
          services={services}
          onServiceSelect={handleServiceSelect}
        />

        <View style={styles.separator} />

        <View style={[styles.topAstrologers, styles.boxedHeader]}>
          <Text style={styles.topAstrologerTxt}>Astrowani's Blog</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => navigation.navigate('BlogList', {data: blogs})}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
        {loadingBlogs ? (
          <View style={styles.indicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : errroBlogs ? (
          <Text style={styles.errorText}>{errroBlogs}</Text>
        ) : (
          <FlatList
            data={blogs?.data}
            renderItem={({item}) => <BlogItem blog={item} />}
            keyExtractor={item => item._id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.BlogView}
          />
        )}
        <CustomerReview />
        <Remedies />

        <View style={styles.reviewsBox}>
          <View style={[styles.customerReviews, {marginTop: verticalScale(15)}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(20)}}>
              <MaterialIcons name="format-quote" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.topAstrologerTxt, {color: 'white', fontSize: moderateScale(20), marginTop: verticalScale(5)}]}>What Our Clients Say</Text>
              <Text style={{color: COLORS.AstroSoftOrange, fontFamily: 'Lato-Regular', fontSize: moderateScale(12), marginTop: verticalScale(5)}}>Discover why thousands trust Astrowani</Text>
            </View>
            
            {loadingReview ? (
              <View style={styles.indicator}>
                <ActivityIndicator size="small" color={'white'} />
              </View>
            ) : errorReview ? (
              <Text style={styles.errorText}>{errorReview}</Text>
            ) : topRatedReviews && topRatedReviews.length > 0 ? (
              <FlatList
                data={topRatedReviews}
                renderItem={renderReviewList}
                keyExtractor={item => item._id.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ReviewsList}
              />
            ) : (
              <View style={styles.emptyReviewCard}>
                <MaterialIcons name="rate-review" size={moderateScale(30)} color={COLORS.AstroMaroon} />
                <Text style={styles.emptyReviewTxt}>No reviews available yet.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.darkBottomSection}>
          <View style={[styles.footer, {backgroundColor: 'transparent', paddingBottom: 0}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(15), marginTop: verticalScale(20)}}>
              <MaterialIcons name="stars" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.footerTitle, {color: 'white', fontSize: moderateScale(18), textAlign: 'center', marginTop: verticalScale(8)}]}>
                Why Astrowani Is Best For Astrology?
              </Text>
            </View>
            <View style={styles.footericonView}>
              <Text style={[styles.why, {color: '#f0f0f0', textAlign: 'center', lineHeight: verticalScale(24), fontSize: moderateScale(13)}]}>
                Astrowani reveals the destiny that Stars has designed for us.
                Astrowani is a proven science with its methods and way of
                interpreting the influence of stars and planets on earthly affairs
                and human destinies. Astrowani, with its scientific method of
                calculation and prediction of actual events, is approving enough
                to make people start believing in it. And it has been doing the
                same since the early Vedic period.
              </Text>
            </View>
          </View>
        </View>

        {selectedReview && (
          <Modal
            visible={modalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={closeModal}>
            <View style={styles.modalBackground}>
              <View style={styles.modalContainer}>
                <Image
                  source={{
                    uri:
                      selectedReview.user?.profilePic ||
                      'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
                  }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalName}>
                  {selectedReview.user?.firstName || 'Anonymous'}
                </Text>

                <StarRating rating={selectedReview.rating} size={18} style={styles.starsContainer} />

                <Text style={styles.modalReview}>
                  {selectedReview.comment || 'no comment'}
                </Text>
                <TouchableOpacity
                  onPress={closeModal}
                  style={styles.closeIconWrapper}>
                  <MaterialIcons
                    name="close"
                    size={moderateScale(24)}
                    color="black"
                    style={styles.closeButton}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
        </View>
      </ScrollView>
      <View style={styles.fixedBtnView}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Chat')}
          style={styles.fixedBtn}>
          <MaterialIcons name="wechat" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>Chat with Astrologer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Call')}
          style={styles.fixedBtn}>
          <MaterialIcons name="add-call" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>Talk To Astrologer</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent={true} visible={isWaiting} animationType="fade" onRequestClose={() => cancelCall()}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ 
            width: '85%', 
            backgroundColor: COLORS.AstroMaroon, 
            borderRadius: 15, 
            padding: 25, 
            alignItems: 'center',
            borderWidth: 1,
            borderColor: COLORS.AstroSoftOrange
          }}>
            <ActivityIndicator size="large" color={COLORS.AstroGold} />
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.AstroGold, marginTop: 20, marginBottom: 10 }}>Request Sent</Text>
            <Text style={{ fontSize: 16, color: COLORS.AstroSoftOrange, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              Waiting for {waitingAstroName} to accept your request...
            </Text>
            <TouchableOpacity 
              style={{ 
                backgroundColor: COLORS.AstroSoftOrange, 
                paddingHorizontal: 30, 
                paddingVertical: 12, 
                borderRadius: 25,
                width: '100%',
                alignItems: 'center'
              }}
              onPress={() => cancelCall()}
            >
              <Text style={{ color: COLORS.AstroMaroon, fontWeight: 'bold', fontSize: 16 }}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  separator: {
    height: verticalScale(1),
    backgroundColor: COLORS.AstroMaroon,
    marginHorizontal: scale(15),
    marginVertical: verticalScale(10),
    opacity: 0.15,
  },
  main: {backgroundColor: 'white'},
  searchTxt: {
    paddingHorizontal: scale(5),
  },
  searchBtnView: {
    backgroundColor: COLORS.AstroMaroon,
    marginTop: -2,
  },
  searchBtn: {
    backgroundColor: COLORS.white,
    marginHorizontal: scale(15),
    marginVertical: verticalScale(12),
    borderRadius: moderateScale(25),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(12),
    alignItems: 'center',
    flexDirection: 'row',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  backgroundImg: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  imageBackWrapper: {
    width: scale(320),
    marginHorizontal: scale(15),
    marginVertical: verticalScale(15),
    height: verticalScale(120),
    borderRadius: moderateScale(10),
    overflow: 'hidden',
  },
  textWrapper: {
    width: scale(180),
    marginVertical: verticalScale(13),
  },
  freetext: {
    color: 'white',
    textAlign: 'center',
    fontSize: moderateScale(18),
    marginHorizontal: scale(5),
    fontFamily: 'Poppins-Bold',
    alignSelf: 'center',
    marginTop: -45,
  },
  topAstro: {
    color: 'white',
    marginHorizontal: scale(5),
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    marginVertical: verticalScale(4),
    position: 'absolute',
    bottom: 0,
    left: moderateScale(150),
  },
  chatnowBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(18),
    width: scale(90),
    backgroundColor: 'orange',
    borderRadius: moderateScale(20),
    // marginTop: verticalScale(30),
    marginHorizontal: scale(10),
  },
  callnowBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(18),
    width: scale(90),
    backgroundColor: 'red',
    borderRadius: moderateScale(20),
    // marginTop: verticalScale(30),
    marginHorizontal: scale(10),
  },
  chatnowTxt: {
    color: 'black',

    fontSize: moderateScale(10),
    fontFamily: 'Poppins-Bold',
  },
  topAstrologers: {
    marginHorizontal: scale(15),
    marginVertical: verticalScale(4),
    marginTop: verticalScale(25),
    marginBottom: verticalScale(10),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerReviews: {
    marginHorizontal: scale(15),
    marginVertical: verticalScale(4),
    marginTop: verticalScale(25),
    marginBottom: verticalScale(10),
    justifyContent: 'space-between',
  },
  topAstrologerTxt: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(16),
  },
  boxedHeader: {
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(12),
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  viewAllBtn: {
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(6),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(25),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  viewAll: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
  },
  astrologerList: {
    paddingHorizontal: scale(15),
    paddingBottom: verticalScale(10),
  },
  ReviewsList: {
    paddingVertical: verticalScale(3),
  },

  AstroImage: {
    width: scale(80),
    height: scale(80),
    borderRadius: moderateScale(40),
    borderWidth: 3,
    borderColor: 'white',
    position: 'absolute',
    top: -verticalScale(40),
    zIndex: 10,
    backgroundColor: '#fff',
  },
  AstrologerCard: {
    alignItems: 'center',
    marginBottom: verticalScale(15),
    marginTop: verticalScale(45),
    width: scale(160),
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    marginRight: scale(15),
    paddingBottom: verticalScale(12),
    paddingTop: verticalScale(45),
    borderWidth: 1,
    borderColor: 'white',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  infoWrapper: {
    flex: 1,
  },
  ReviewWrapper: {
    flex: 1,
    marginLeft: scale(20),
  },
  name: {
    fontFamily: 'Lato-Bold',
    color: 'black',
    fontSize: moderateScale(15),
    textAlign: 'center',
  },
  reviewer: {
    fontFamily: 'Lato-Bold',
    color: 'black',
    fontSize: moderateScale(15),
    marginBottom: verticalScale(2),
  },

  specialty: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginTop: verticalScale(1),
    marginBottom: verticalScale(4),
  },
  exp: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginBottom: verticalScale(1),
  },
  language: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
    marginBottom: verticalScale(1),
  },

  charge: {
    color: 'gray',
    fontWeight: 'bold',
    fontSize: moderateScale(12),
    textAlign: 'center',
    marginTop: scale(5),
  },
  chatBtn: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: 'green',
    elevation: 1,
  },
  videoButton: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    elevation: 1,
  },
  callButton: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: 'red',
    elevation: 1,
  },
  chatBtnTxt: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
  },
  unavailableBtn: {
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    marginVertical: verticalScale(5),
    borderWidth: 1,
    borderColor: '#C0392B',
    opacity: 0.9,
    elevation: 1,
  },
  unavailableBtnTxt: {
    color: 'white',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
  },
  ReviewCard: {
    flexDirection: 'row',
    borderRadius: moderateScale(16),
    backgroundColor: 'white',
    width: scale(250),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    marginVertical: verticalScale(10),
    marginRight: scale(15),
    padding: moderateScale(12),
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ReviewerImage: {
    width: scale(65),
    height: scale(65),
    borderRadius: moderateScale(50),
    borderColor: COLORS.white,
    borderWidth: scale(0.5),
  },
  reviewImageView: {
    alignItems: 'center',
    width: scale(75),
  },
  review: {
    color: 'black',
    fontFamily: 'Lato-Regular',
    width: scale(100),
    fontSize: moderateScale(12),
  },
  rating: {
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
  date: {
    color: COLORS.gray,
    marginBottom: verticalScale(10),
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: verticalScale(10),
  },
  star: {
    marginRight: scale(1), // Add space between stars if needed
  },
  moretxt: {
    color: 'red',
    marginVertical: verticalScale(8),
    width: scale(33),
    borderBottomWidth: moderateScale(0.5),
    borderBottomColor: 'red',
  },

  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: moderateScale(10),
    padding: moderateScale(20),
    alignItems: 'center',
  },
  modalImage: {
    width: scale(100),
    height: verticalScale(100),
    borderRadius: moderateScale(50),
    marginBottom: verticalScale(15),
    borderWidth: scale(0.5),
    borderColor: COLORS.AshGray,
  },
  modalName: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: 'black',
  },
  modalProfession: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
  },

  modalReview: {
    fontSize: moderateScale(14),
    color: 'black',
    textAlign: 'center',
    marginVertical: verticalScale(15),
    fontWeight: 'bold',
  },
  closeButton: {marginBottom: verticalScale(15)},
  bar: {
    width: scale(320),
    alignSelf: 'center',
    elevation: 2,

    shadowColor: COLORS.AstroMaroon,
  },
  separator: {
    borderTopWidth: moderateScale(2), // Thickness of the separator
    width: scale(320),
    marginVertical: verticalScale(13),
    alignSelf: 'center',
    borderTopColor: 'rgba(128, 0, 0, 0.1)',
  },
  CategoryTitle: {
    marginHorizontal: scale(15),
    marginTop: verticalScale(10),
    marginBottom: verticalScale(5),
    color: 'black',
    fontFamily: 'Lato-Bold',
  },
  liveAstrologersView: {
    flexDirection: 'row',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    marginVertical: verticalScale(5),
  },

  AstroBackWrapper: {
    width: scale(140),
    height: verticalScale(185),
    borderRadius: moderateScale(16),
    marginHorizontal: scale(8),
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 5,
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    marginBottom: verticalScale(10),
  },
  liveAstrologerimg: {
    width: scale(74),
    height: scale(74),
    borderRadius: moderateScale(37),
    marginVertical: verticalScale(12),
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  livebtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(4),
    height: verticalScale(15),
    marginVertical: verticalScale(3),
  },
  live: {
    backgroundColor: 'red',
    borderRadius: moderateScale(4),
    width: scale(30),
    alignSelf: 'center',
  },
  scheduled: {
    backgroundColor: 'orange',
    borderRadius: moderateScale(4),
    width: scale(60),
    alignSelf: 'center',
  },
  livetxt: {
    color: 'white',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  scheduledtxt: {
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  astroNameview: {
    padding: scale(5),
  },
  livename: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
  },
  topic: {
    color: 'black',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  CategoryView: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(15),
  },
  category: {
    marginHorizontal: scale(8),
    alignItems: 'center',
    width: scale(75),
  },
  categoryImg: {
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  categoryName: {
    color: 'black',
    fontSize: moderateScale(11),
    textAlign: 'center',
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(8),
  },
  fixedBtnView: {
    position: 'absolute',
    bottom: verticalScale(85),
    left: 0,
    right: 0,
    flexDirection: 'row',
    marginHorizontal: scale(5),
    marginVertical: verticalScale(15),
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fixedBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(30),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginHorizontal: scale(10),
  },
  fixedBtnTxt: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
    marginHorizontal: scale(6),
  },
  BlogView: {
    flexDirection: 'row',
    paddingHorizontal: scale(10),
    marginVertical: verticalScale(5),
    paddingVertical: verticalScale(10),
  },
  footer: {
    marginTop: verticalScale(20),
    backgroundColor: COLORS.AstroSoftOrange,
    paddingBottom: verticalScale(75),
  },
  reviewsBox: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(24),
    marginHorizontal: scale(10),
    paddingBottom: verticalScale(20),
    paddingTop: verticalScale(10),
    marginTop: verticalScale(20),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  darkBottomSection: {
    backgroundColor: COLORS.AstroMaroon,
    borderTopLeftRadius: moderateScale(35),
    borderTopRightRadius: moderateScale(35),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(85),
    marginTop: verticalScale(25),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  emptyReviewCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: moderateScale(20),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '85%',
    borderWidth: 1.5,
    borderColor: COLORS.AstroSoftOrange,
    marginVertical: verticalScale(10),
  },
  emptyReviewTxt: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(10),
    fontSize: moderateScale(14),
  },
  blogCard: {
    backgroundColor: '#fff',
    width: scale(220),
    marginHorizontal: scale(8),
    borderRadius: moderateScale(16),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginBottom: verticalScale(10),
  },
  blogImg: {
    width: scale(220),
    height: verticalScale(110),
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
  },
  blogTitle: {
    paddingHorizontal: scale(5),
    paddingVertical: verticalScale(10),
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    textAlign: 'center',
  },
  blogContent: {
    paddingHorizontal: scale(7),
    paddingBottom: verticalScale(5),
    marginBottom: verticalScale(5),
    fontSize: moderateScale(12),
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
    color: 'gray',
  },
  moreBtn: {
    alignSelf: 'center',
  },

  footericonView: {
    flexDirection: 'row',
  },
  footerTitle: {
    marginVertical: verticalScale(20),
    textAlign: 'center',
    color: 'black',
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
  verifyLogo: {
    width: scale(55),
    height: verticalScale(55),
  },
  firstsection: {
    width: scale(116),
    alignItems: 'center',
  },
  sectionTxt: {
    color: COLORS.black,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
    fontSize: moderateScale(13),
    marginVertical: verticalScale(5),
  },
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
  why: {
    textAlign: 'center',
    color: 'black',
    fontSize: moderateScale(13),
    lineHeight: verticalScale(20),
    fontFamily: 'Lato-Regular',
    marginHorizontal: scale(15),
  },
  backgroundImg: {
    flex: 1,
    resizeMode: 'cover',
    justifyContent: 'space-between',
  },

  centerTextWrapper: {
    flex: 1,
    // justifyContent: 'center',
    // alignItems: 'center',
  },

  bottomWrapper: {
    flexDirection: 'row', // or 'row' if you want text and button side-by-side
    alignItems: 'center',
    // gap: 10,
    // justifyContent: "space-between",
    padding: 5,
  },
  topAstro: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: 'white',
  },

  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  chatnowBtn: {
    backgroundColor: '#B71C1C',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 5,
    paddingHorizontal: 8,
  },

  callnowBtn: {
    backgroundColor: 'orange',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 5,
    paddingHorizontal: 8,
  },
  chatnowTxt: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 10,
  },
  backgroundImg: {
    height: 200,
  },
  imageBackWrapper: {
    flex: 2,
  },
});
