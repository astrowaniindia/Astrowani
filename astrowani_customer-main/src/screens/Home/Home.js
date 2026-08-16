import React, {useState, useEffect, useRef, act, useTransition, useCallback} from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
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
import {captureEvent} from '../../utils/Analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';
import Swiper from 'react-native-swiper';
import Astrologers, {LiveAstrologers, Reviews, services} from './Astrologers';
import Instance from '../../api/ApiCall';
import {getAstroServices} from '../../api/astroApi';
import FreeServicesScreen from '../drawerScreens/FreeSeviceScreen/FreeServicesScreen';
import AnimatedAstrologerMarquee from './AnimatedAstrologerMarquee';
import LiveAartiSection from './LiveAartiSection';
import VoiceNotesBanner from './VoiceNotesBanner';
import CustomerReview from './Review';
import axios from 'axios';
import { showAlert } from '../../Component/CustomAlert';
import { supabase } from '../../api/SupabaseClient';
import io from 'socket.io-client';
import { LanguageContext } from '../../context/LanguageContext';
import { SOCKET_URL } from '../../config/api';
import { readCache, writeCache } from '../../utils/cacheFetch';
import { showStatusPopup } from '../../components/StatusPopup';
import { showReferralPrompt } from '../../components/ReferralPromptHost';
import StarRating from '../../components/StarRating';
import AstrologerBadge from '../../components/AstrologerBadge';
import { isProfileComplete as checkProfileComplete, ensureProfileComplete } from '../../utils/profileGate';
import { isEligibleForFreeConsultation } from '../../utils/freeConsultation';
import { hasSeenFreeBotChatOffer, markFreeBotChatOfferSeen } from '../../utils/onboardingFlags';
import { getWalletBalance } from '../../utils/wallet';
import { showInsufficientBalanceAlert } from '../../utils/insufficientBalanceAlert';
import PlacementBanner from '../../components/PlacementBanner';
import FreeChatOfferPopup from '../../components/FreeChatOfferPopup';
import { formatBusyLabel } from '../../utils/busyLabel';
import { requestNotifyMe } from '../../utils/notifyMe';
import useAstrologerListSync from '../../hooks/useAstrologerListSync';
import useBlogListSync from '../../hooks/useBlogListSync';
import useChatRequest from '../../hooks/useChatRequest';
import useFreeServicePurchase from '../../hooks/useFreeServicePurchase';
import RequestingPopup from '../../components/RequestingPopup';

// Bundled fallback banners — shown until the admin adds a home_primary banner in the dashboard.
const FALLBACK_BANNERS = [
  require('../../assets/images/banner.jpeg'),
  require('../../assets/images/mainlogo.jpeg'),
];

// Free Services aren't free anymore — each card costs ₹1 per visit, confirmed via a
// "Pay ₹1" popup and debited before navigating in (see useFreeServicePurchase.js). The
// `key` here is only a wallet-ledger label, not one of the free-services API's own
// request-shape params (those stay exactly as the destination screen already sends them).
const FREE_SERVICE_ROUTES = {
  "Today's Panchang": {screen: 'PanchangScreen', key: 'panchang'},
  'Janam Kundali': {screen: 'JanamKundaliScreen', key: 'janam-kundali'},
  'Kundali Match': {screen: 'KundaliMatchScreen', key: 'kundali-match'},
  'Free Horoscope': {screen: 'Horoscope', key: 'horoscope'},
  'Shubh Muhurat': {screen: 'ShubhMuhurat', key: 'shubh-muhurat'},
};

// Hoisted to module scope (was previously declared inside Home's render body,
// which recreated the component's identity on every Home re-render — since
// React remounts rather than updates a list item when its component reference
// changes, the pulsing-dot Animated.loop below could visibly restart on any
// unrelated Home state change, not just when the live list itself changed).
const AstrologerItem = ({astrologer, navigation, t}) => {
  // Pulsing red dot on the LIVE badge — the only cue the old card had that
  // something was actually happening was a flat static label; this makes it
  // read as "live right now" at a glance instead of just a color chip.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.liveCard}
      onPress={() => {
        captureEvent('home_screen_click', {section: 'live_astrologer_card', label: astrologer?.name});
        navigation.navigate('LiveViewerScreen', {
          sessionId: astrologer.sessionId,
          astrologer,
        });
      }}>
      <Image
        source={{uri: astrologer.profileImage || astrologer.image}}
        style={styles.liveCardImage}
        resizeMode="cover"
      />
      {/* Bottom scrim so the name/topic stay readable over any photo — a real
          gradient (react-native-svg is already a linked dependency, so this
          needs no native rebuild / stays OTA-shippable), not a flat tint. */}
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="liveCardGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.82} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#liveCardGradient)" />
      </Svg>

      <View style={styles.liveBadge}>
        <Animated.View style={[styles.livePulseDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.liveBadgeText}>{t('common.live').toUpperCase()}</Text>
      </View>

      <View style={styles.liveCardInfo}>
        <Text style={styles.liveCardName} numberOfLines={1}>{astrologer.name}</Text>
        {!!astrologer.specialties?.[0]?.name && (
          <Text style={styles.liveCardTopic} numberOfLines={1}>{astrologer.specialties[0].name}</Text>
        )}
        <StarRating
          rating={astrologer.rating}
          totalReviews={astrologer.totalReviews}
          size={11}
          style={styles.liveCardStars}
        />
        <View style={styles.liveCardMetaRow}>
          {!!astrologer.experience && (
            <Text style={styles.liveCardMeta} numberOfLines={1}>
              {astrologer.experience} {astrologer.experience === 1 ? 'yr' : 'yrs'} exp
            </Text>
          )}
          {!!astrologer.language?.length && (
            <>
              <Text style={styles.liveCardMetaDot}>•</Text>
              <Text style={styles.liveCardMeta} numberOfLines={1}>
                {astrologer.language.join(', ')}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const BlogItem = ({blog, navigation, language}) => {
  const title = language === 'Hindi' ? (blog.hindi?.title || blog.title) : blog.title;
  // Was always blog.metaDescription regardless of language — the title above
  // already checked for a Hindi variant, but this excerpt line never did, so a
  // fully Hindi-translated blog still showed its English excerpt underneath.
  const metaDescription = language === 'Hindi'
    ? (blog.hindi?.metaDescription || blog.metaDescription)
    : blog.metaDescription;
  return (
    <TouchableOpacity
      onPress={() => {
        captureEvent('home_screen_click', {section: 'blog_card', label: title});
        navigation.navigate('BlogScreen', {data: blog});
      }}
      style={styles.blogCard}>
      <Image style={styles.blogImg} source={{uri: blog.thumbnail}} />
      <Text style={styles.blogTitle}>{title}</Text>
      <Text style={styles.blogContent} numberOfLines={2} ellipsizeMode="tail">
        {metaDescription}
      </Text>
    </TouchableOpacity>
  );
};

const Home = ({navigation}) => {
  const { t, language } = React.useContext(LanguageContext);
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
  const [liveAstro, setLiveAstro] = useState([]);
  const [thought, setThought] = useState();
  const [user, setUser] = useState(null);
  const [astroServices, setAstroServices] = useState([]);
  const [freeChatOfferVisible, setFreeChatOfferVisible] = useState(false);
  const [freeChatOfferDismissed, setFreeChatOfferDismissed] = useState(false);
  const [freeChatPersona, setFreeChatPersona] = useState(null);

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

  // Chat — same shared hook every other Chat button in the app already uses. This card's
  // Chat button used to navigate to PersonToPersonChat.js, which calls a POST /api/sessions
  // endpoint that does not exist anywhere in the backend (confirmed via grep) — every tap
  // failed silently. Real Chat entry points (Chat.js, ExpertsList.js, AstrologerInfo.js,
  // SearchScreen.js) all use this hook; Home's card button now matches them.
  const { requesting, requestAstro, sendChatRequest, cancelRequest } = useChatRequest(navigation);
  const { purchase: purchaseFreeService } = useFreeServicePurchase();

  React.useEffect(() => {
    getAstroServices()
      .then(list => setAstroServices(list))
      .catch(err => console.log('Failed to load astro services:', err.message));
  }, []);

  const ASTRO_SERVICE_ICONS = {
    Kundli: 'https://img.icons8.com/color/128/scroll.png',
    Matching: 'https://img.icons8.com/color/128/like.png',
    Chart: 'https://img.icons8.com/color/128/combo-chart.png',
    Dasha: 'https://img.icons8.com/color/128/planet.png',
    Dosh: 'https://cdn-icons-png.flaticon.com/128/564/564619.png',
    Numerology: 'https://img.icons8.com/color/128/123.png',
    'Lal Kitab': 'https://img.icons8.com/color/128/book.png',
    'KP Astrology': 'https://img.icons8.com/color/128/compass.png',
    Tarot: 'https://img.icons8.com/color/128/tarot-cards.png',
    'PDF Reports': 'https://cdn-icons-png.flaticon.com/128/337/337946.png',
  };

  const ASTRO_SERVICE_ROUTES = {
    kundli: 'KundliInputScreen',
    matching: 'MatchingInputScreen',
    chart: 'ChartInputScreen',
    dasha: 'DashaInputScreen',
    dosh: 'DoshInputScreen',
    numerology: 'NumerologyInputScreen',
    'lal-kitab': 'LalKitabInputScreen',
    'kp-astrology': 'KPAstrologyInputScreen',
    tarot: 'TarotScreen',
    'pdf-report': 'PdfReportInputScreen',
  };

  const handleAstroServiceSelect = service => {
    captureEvent('home_screen_click', {section: 'astro_report_card', label: service.title || service.key});
    const routeName = ASTRO_SERVICE_ROUTES[service.key];
    if (routeName) navigation.navigate(routeName);
  };

  React.useEffect(() => {
    const setup = async () => {
      const authToken = await AsyncStorage.getItem('token');
      socketRef.current = io(SOCKET_URL, { auth: { token: authToken } });
      socketRef.current.on('connect', async () => {
        const userStr = await AsyncStorage.getItem('userData');
        const u = userStr ? JSON.parse(userStr) : null;
        if (u?.id) socketRef.current.emit('join_room', u.id);
      });
      socketRef.current.on('connect_error', err =>
        console.error('[HomeScreen] Socket error:', err.message),
      );
      // Real-time popup for when a referral of theirs pays out (sessionManager's
      // maybeRewardReferral emits this to the referrer's personal room) — the FCM
      // push already covers the backgrounded case, this covers app-open.
      socketRef.current.on('referral_rewarded', ({ amount }) => {
        showStatusPopup({
          variant: 'success',
          title: 'Referral Reward!',
          message: `You earned ₹${amount} — a friend you referred just completed their first session.`,
        });
      });
      // Admin-triggered referral popup (astrowani-admin's Referral Popup page) —
      // shows the same ReferralPromptHost used after a free chat, with the
      // admin's own title/message instead of the default copy.
      socketRef.current.on('show_referral_popup', ({ title, body }) => {
        showReferralPrompt(title, body);
      });
    };
    setup();
    return () => {
      if (callChannelRef.current) supabase.removeChannel(callChannelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);
  
  // Marquee buffer — was Array(1000).fill(...).flat(), a 30,000+ element array
  // for a ~30-astrologer list, held for as long as Home is mounted. 6 copies is
  // enough for the wraparound below (contentWidthRef) to always have content on
  // both sides; the rewind makes this loop indefinitely without needing a huge
  // buffer to "outrun" the interval.
  const MARQUEE_REPEAT = 6;
  const loopedAstrologers = React.useMemo(() => {
    if (!astrologerToShow || astrologerToShow.length === 0) return [];
    return Array(MARQUEE_REPEAT).fill(astrologerToShow).flat();
  }, [astrologerToShow]);

  // Measured native content width of the looped list (all MARQUEE_REPEAT copies).
  // Used to silently rewind by exactly one copy's width once we scroll into the
  // last copy — since every copy renders identical items, the jump is visually
  // imperceptible, and it keeps scrollOffset bounded forever instead of running
  // off the end of a fixed-size array.
  const contentWidthRef = React.useRef(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      if (isAutoScrolling.current && listRef.current && loopedAstrologers.length > 0) {
        scrollOffset.current += 1;
        const totalWidth = contentWidthRef.current;
        if (totalWidth > 0) {
          // Direct clamp for the case where the underlying astrologer list
          // shrinks (e.g. a background refetch) while offset was already deep
          // into a wraparound cycle sized for the OLD, larger content — without
          // this, the one-set-per-tick rewind below only closes the gap
          // gradually, meaning several ticks in a row would call
          // scrollToOffset() with a value past the new (smaller) scrollable
          // range. Modulo snaps it back in range in a single tick instead.
          if (scrollOffset.current >= totalWidth) {
            scrollOffset.current = scrollOffset.current % totalWidth;
          }
          const singleSetWidth = totalWidth / MARQUEE_REPEAT;
          if (scrollOffset.current >= totalWidth - singleSetWidth) {
            scrollOffset.current -= singleSetWidth;
          }
        }
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

      // Wallet check — need at least 5 minutes worth (matches Call.js).
      const pricePerMin = Number(item.chargePerMinute || item.pricing || 0);
      const minRequired = pricePerMin * 5;
      let balance;
      try {
        balance = await getWalletBalance();
      } catch (walletErr) {
        Alert.alert(t('common.error'), t('alerts.failedWalletCheck'));
        return null;
      }
      if (balance < minRequired) {
        showInsufficientBalanceAlert({ navigation, minRequired, balance, t });
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
        Alert.alert(t('common.error'), response.data.error || 'Unexpected Error');
        return null;
      }
      captureEvent('call_initiated', {call_type: 'audio', astrologer_id: item.userId});

      const callerToken = response.data.data?.token?.token || response.data.token?.token || response.data.token;
      const vendorToken = response.data.data?.vendorToken || response.data.vendorToken || callerToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId = response.data.data?.sessionId || response.data.sessionId;

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3. /api/call/initiate above already inserted
      // it and returns its id.
      const requestId = response.data.data?.requestId || response.data.requestId;
      if (!requestId) {
        setIsWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedRequestAstrologer'));
        return null;
      }
      const requestData = {id: requestId};

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
        cancelCall(t('alerts.astrologerBusy'), 'rejected', 'Astrologer Busy'),
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
              cancelCall(t('alerts.astrologerBusy'), 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cancelCall(t('alerts.notPickedUpAudio'), 'missed', 'Not Answered');
      }, 60000);

      return response.data.token;
    } catch (error) {
      setIsWaiting(false);
      if (error?.response?.status === 409) {
        showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        return null;
      }
      Alert.alert(t('common.error'), t('alerts.failedInitiateCall'));
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

      // Wallet check — need at least 5 minutes worth (video rate).
      const pricePerMin = Number(item.videoPrice || item.chargePerMinute || item.pricing || 0);
      const minRequired = pricePerMin * 5;
      let balance;
      try {
        balance = await getWalletBalance();
      } catch (walletErr) {
        Alert.alert(t('common.error'), t('alerts.failedWalletCheck'));
        return null;
      }
      if (balance < minRequired) {
        showInsufficientBalanceAlert({ navigation, minRequired, balance, t });
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
        Alert.alert(t('common.error'), response.data.error || 'Unexpected Error');
        return null;
      }
      captureEvent('call_initiated', {call_type: 'video', astrologer_id: item.userId});

      const callerToken = response.data.data?.token?.token || response.data.token?.token || response.data.token;
      const vendorToken = response.data.data?.vendorToken || response.data.vendorToken || callerToken;
      const roomId = response.data.data?.roomId || response.data.roomId;
      const backendSessionId = response.data.data?.sessionId || response.data.sessionId;

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3. /api/call/initiate above already inserted
      // it and returns its id.
      const requestId = response.data.data?.requestId || response.data.requestId;
      if (!requestId) {
        setIsWaiting(false);
        Alert.alert(t('common.error'), t('alerts.failedRequestAstrologer'));
        return null;
      }
      const requestData = {id: requestId};

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
        cancelCall(t('alerts.astrologerBusy'), 'rejected', 'Astrologer Busy'),
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
              cancelCall(t('alerts.astrologerBusy'), 'rejected', 'Astrologer Busy');
            }
          },
        )
        .subscribe();
      callChannelRef.current = channel;

      // Auto-cancel after 1 minute if vendor doesn't respond → missed call
      setTimeout(() => {
        cancelCall(t('alerts.notPickedUpVideo'), 'missed', 'Not Answered');
      }, 60000);

      return response.data.token;
    } catch (error) {
      setIsWaiting(false);
      if (error?.response?.status === 409) {
        showStatusPopup({ variant: 'busy', title: t('status.astrologerBusyTitle'), message: t('alerts.astrologerBusy') });
        return null;
      }
      Alert.alert(t('common.error'), t('alerts.failedInitiateVideoCall'));
      return null;
    }
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

      // Free 5-min bot-chat welcome offer — only for customers who haven't
      // used it yet (server-verified via freeBotChatCredited) and who haven't
      // had any real session yet (same "new customer" signal used elsewhere).
      // The "seen" check is a persisted, per-account AsyncStorage flag (not
      // just in-memory state) — someone who starts the chat but backs out
      // before it naturally finishes never gets freeBotChatCredited set, so
      // without a persisted flag the popup kept reappearing every time Home
      // remounted (app restart, navigating back, etc).
      if (!userData.freeBotChatCredited && !freeChatOfferDismissed) {
        const alreadySeen = await hasSeenFreeBotChatOffer(userData.id);
        if (!alreadySeen) {
          const eligible = await isEligibleForFreeConsultation(userData.id);
          if (eligible) {
            // Card content (name/photo/experience/text) is admin-editable —
            // fetched only once we actually intend to show the popup, so
            // ineligible/already-seen customers never make this extra call.
            try {
              const personaRes = await Instance.get('/api/free-bot-chat/persona');
              if (personaRes.data?.enabled === false) return;
              setFreeChatPersona(personaRes.data);
            } catch (_) {
              // Falls back to FreeChatOfferPopup's own bundled default persona.
            }
            setFreeChatOfferVisible(true);
          }
        }
      }
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
    // Stale-while-revalidate: hydrate each section from its last-fetched cache
    // immediately (no spinner, no blank gap) while the fresh network response
    // is still in flight, then swap in the real data when it arrives. Keeps
    // the loading flag true through the cache hit so callers that gate on it
    // (pull-to-refresh, etc.) still see a real in-flight fetch.
    const fetchCategories = async () => {
      const cached = await readCache('home_categories');
      if (cached) {
        setCategories(cached);
        setLoading(false);
      }
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          throw new Error('Token not found');
        }
        const response = await Instance.get('/api/categories', {
          headers: {Authorization: `Bearer ${token}`},
        });

        setCategories(response?.data?.categories);
        writeCache('home_categories', response?.data?.categories);
      } catch (err) {
        if (!cached) setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    const fetchBlogs = async () => {
      const cached = await readCache('home_blogs');
      if (cached) {
        setBlogsToShow(cached.blogsToShow);
        setBlogs(cached.blogs);
        setLoadingBlogs(false);
      }
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
        writeCache('home_blogs', {blogsToShow: sliceData, blogs: response.data});
      } catch (err) {
        if (!cached) setErrorBlogs(err.message);
      } finally {
        setLoadingBlogs(false);
      }
    };
    const fetchAstrologer = async () => {
      const cached = await readCache('home_astrologers');
      if (cached) {
        setAstrologerToShow(cached);
        setAstrologer(cached);
        setLoadingAstrologer(false);
      }
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
        setErrorAstrologer(null); // clear any stale error from a prior failed attempt
        writeCache('home_astrologers', astroResponse);
      } catch (err) {
        if (!cached) setErrorAstrologer(err.message);
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
      const cached = await readCache('home_top_reviews');
      if (cached) {
        setTopRatedReviews(cached);
        setLoadingReview(false);
      }
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
        writeCache('home_top_reviews', topReviews);
      } catch (err) {
        if (!cached) setErrorReview(err.message);
      } finally {
        setLoadingReview(false);
      }
    };

  const loadAllData = () => {
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

  // Refresh the astrologer carousel AND the live strip whenever Home regains focus (catches
  // vendor toggle changes, and someone starting/ending a broadcast while this screen wasn't
  // focused).
  useFocusEffect(
    useCallback(() => {
      fetchAstrologer();
      getLiveAstro();
    }, []),
  );

  // Live sync — re-fetch the carousel when any astrologer row changes.
  // Unique channel name per mount: a fixed name makes supabase.channel() return an
  // already-subscribed channel, and chaining .on() after subscribe() throws
  // ("cannot add postgres_changes callbacks ... after subscribe()").
  // Was a per-screen Supabase Realtime subscription to the whole astrologers
  // table. Now a debounced socket signal fanned out by the backend — see
  // hooks/useAstrologerListSync.js for why that matters at scale.
  // Also re-fetches the "Live Astrologers" strip — going live/ending a broadcast is a write
  // to this same astrologers row (is_live), so the same signal covers both; previously only
  // the carousel refreshed, leaving the live strip stuck showing "No one live" until the
  // customer manually pulled to refresh or reopened the app (reported 2026-08-08).
  useAstrologerListSync(() => { fetchAstrologer(); getLiveAstro(); });

  // Live sync — re-fetch the blog carousel when the admin publishes/edits a blog.
  // Was its own independent unfiltered Supabase Realtime subscription on
  // `blogs` — on top of BlogList.js's separate one for the same table (same
  // anti-pattern the astrologer sync above already replaced). Now shares the
  // one backend fanout via hooks/useBlogListSync.js.
  useBlogListSync(() => { fetchBlogs(); });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const handleMorePress = review => {
    captureEvent('home_screen_click', {section: 'review_card', label: review?.name});
    setSelectedReview(review);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedReview(null);
  };
  const handleSearch = () => {
    captureEvent('home_screen_click', {section: 'search'});
    navigation.navigate('SearchScreen', {data: astrologer});
  };

  const openAstrologer = (person) => {
    captureEvent('home_screen_click', {section: 'astrologer_card', label: person?.name});
    navigation.navigate('AstrologerInfo', {person: person});
  };

  // Shared profile-gate check (name, valid email, gender, dob, place of birth).
  const isProfileComplete = () => checkProfileComplete(user);

  const handleChatPress = (item) => sendChatRequest(item);

  const handleServiceSelect = async service => {
    captureEvent('home_screen_click', {section: 'free_service_card', label: service.title});
    const route = FREE_SERVICE_ROUTES[service.title];
    if (!route) return;
    const paid = await purchaseFreeService(route.key, service.title);
    if (paid) navigation.navigate(route.screen);
  };

  const renderAstrologerList = ({item}) => {
    const languages = item.language?.join(', ');
    return (
      <TouchableOpacity
        onPress={() => openAstrologer(item)}
        style={styles.AstrologerCard}>
        <View style={styles.AstroImageWrap}>
          <Image
            resizeMode="contain"
            source={{
              uri:
                item.profileImage ||
                'https://cdn-icons-png.flaticon.com/128/3135/3135715.png',
            }}
            style={styles.AstroImage}
          />
          <AstrologerBadge type={item.badgeType} size={scale(80)} />
        </View>
        <View style={styles.infoWrapper}>
          <Text style={styles.name}>{item.name || 'Name'}</Text>
          <Text style={styles.specialty}>
            {item.specialties[0]?.name || 'vedic Astrology'}
          </Text>
          <Text style={styles.exp}>Exp: {item.experience || '0'} years</Text>
          <Text style={styles.language}>{languages || 'hindi'}</Text>
        </View>
        <View style={styles.btnView}>
          {item.isOnline === false ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                Alert.alert(t('alerts.unavailable'), t('alerts.astrologerOffline', {name: item.name || 'This astrologer'}))
              }
              style={styles.offlineBtn}>
              <MaterialIcons name="wifi-off" size={moderateScale(12)} color="white" style={{marginRight: 4}} />
              <Text style={styles.unavailableBtnTxt}>{t('common.offline')}</Text>
            </TouchableOpacity>
          ) : item.isBusy === true && item.busyReason === 'live' ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                if (!(await ensureProfileComplete(navigation))) return;
                if (item.liveSessionId) {
                  navigation.navigate('LiveViewerScreen', { sessionId: item.liveSessionId, astrologer: item });
                } else {
                  navigation.navigate('Live');
                }
              }}
              style={styles.liveBtn}>
              <MaterialIcons name="live-tv" size={moderateScale(12)} color="white" style={{marginRight: 4}} />
              <Text style={styles.unavailableBtnTxt}>Live now</Text>
            </TouchableOpacity>
          ) : item.isBusy === true ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                const { ok } = await requestNotifyMe(item.userId || item._id, 'chat');
                Alert.alert(
                  ok ? "We'll let you know" : t('common.error'),
                  ok ? `We'll notify you when ${item.name || 'this astrologer'} is free.` : 'Could not join the waitlist. Please try again.'
                );
              }}
              style={styles.busyBtn}>
              <MaterialIcons name="schedule" size={moderateScale(12)} color="white" style={{marginRight: 4}} />
              <Text style={styles.unavailableBtnTxt}>
                {formatBusyLabel(item.busySince ? Math.max(0, Math.floor((Date.now() - new Date(item.busySince).getTime()) / 1000)) : 0)}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  item.isChatEnabled
                    ? handleChatPress(item)
                    : Alert.alert(t('alerts.unavailable'), t('alerts.notAvailableChat', {name: item.name || 'This astrologer'}))
                }
                style={item.isChatEnabled ? styles.chatBtn : styles.unavailableBtn}>
                <Text style={item.isChatEnabled ? styles.chatBtnTxt : styles.unavailableBtnTxt}>{item.isChatEnabled ? t('common.chat') : t('common.noChat')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const formatReviewDate = isoString => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} at ${hours}:${minutes} ${ampm}`;
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
            <Text style={styles.date}>{item?.createdAt ? formatReviewDate(item.createdAt) : '3 may 2024'}</Text>
          </View>
          <Text style={styles.review} numberOfLines={3} ellipsizeMode="tail">
            {item.comment || 'no comment'}
          </Text>
        </View>
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
            <MaterialIcons name="search" size={24} color="#592a19" />
            <Text style={styles.searchTxt}>{t('home.search')}</Text>
          </TouchableOpacity>
        </View>

        <VoiceNotesBanner navigation={navigation} />
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
            {(language === 'Hindi' ? thought?.hindi?.thoughtText : thought?.thoughtText) || t('home.welcome')}
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
          <PlacementBanner
            placement="home_primary"
            navigation={navigation}
            height={150}
            style={{ marginHorizontal: 15 }}
            fallbackImages={FALLBACK_BANNERS}
          />

          <PlacementBanner
            placement="home_secondary"
            navigation={navigation}
            height={110}
            style={{ marginHorizontal: 15, marginTop: 12 }}
          />

          <View style={styles.topAstrologers}>
            <Text style={styles.topAstrologerTxt}>{t('home.bestAstrologers')}</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => {
                captureEvent('home_screen_click', {section: 'view_all_best_astrologers'});
                navigation.navigate('Chat');
              }}>
              <Text style={styles.viewAll}>{t('home.viewAll')}</Text>
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
            // MUST stay false (Sentry REACT-NATIVE-5, https://astrowani.sentry.io/issues/7665434814/):
            // this FlatList is horizontal, nested inside the outer vertical
            // ScrollView above, and driven by a programmatic scrollToOffset()
            // auto-advance interval (see isAutoScrolling / the setInterval near the
            // top of this component) — the exact combination that hits a
            // long-documented Android ClassCastException in RN's clipping/
            // view-recycling path (ReactClippingViewManager.getChildCount tries to
            // reattach a clipped ReactHorizontalScrollView as a plain
            // ReactViewGroup). This was briefly re-enabled in b2aff4b under the
            // belief that trimming the duplicated array (MARQUEE_REPEAT) addressed
            // the crash — it doesn't; the crash is about the clipping/reattachment
            // mechanism itself, not item count, so a smaller array still hits it.
            // A tight windowSize was tried separately and reverted for an unrelated
            // reason (blank-frame flicker at wraparound); that's independent of
            // this flag and unaffected by setting it back to false.
            removeClippedSubviews={false}
            contentContainerStyle={styles.astrologerList}
            onContentSizeChange={(w) => { contentWidthRef.current = w; }}
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

        {/* Call With Astrologers — moved up here (directly under "India's Best
            Astrologers", above "Astrowani's Categories") at the user's request,
            2026-08-16. It used to sit far down the page, between Astro Reports
            and the Blog carousel. */}
        {!loadingAstrologer && !errorAstrologer && astrologerToShow?.length > 0 && (
          <>
            <View style={styles.separator} />
            <View style={styles.topAstrologers}>
              <Text style={styles.topAstrologerTxt}>{t('home.callWithAstrologers')}</Text>
            </View>
            <AnimatedAstrologerMarquee astrologers={astrologerToShow} onCallPress={getRoomTokenWebCall} />
          </>
        )}

        <View style={styles.separator} />

        <Text style={styles.CategoryTitle}>{t('home.categories')}</Text>
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
                    onPress={() => {
                      captureEvent('home_screen_click', {section: 'category_tile', label: item.name});
                      navigation.navigate('CategoryAstrologers', {
                        categoryId: item._id,
                        categoryName: language === 'Hindi' ? (item.hindi?.name || item.name) : item.name,
                      });
                    }}
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
                    <Text style={styles.categoryName}>
                      {language === 'Hindi' ? (item.hindi?.name || item.name) : item.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>{t('home.freeServices')}</Text>
        </View>
        <FreeServicesScreen
          services={services.map(s => ({...s, displayTitle: t(s.titleKey)}))}
          onServiceSelect={handleServiceSelect}
          showPrice
        />

        <View style={styles.separator} />

        {/* Live Astrologers — moved here (between Free Services / "₹1 service" and
            Astro Reports) at the user's request, 2026-08-14. */}
        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>{t('home.liveAstrologers')}</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => {
              captureEvent('home_screen_click', {section: 'view_all_live'});
              navigation.navigate('Live');
            }}>
            <Text style={styles.viewAll}>{t('home.viewAll')}</Text>
          </TouchableOpacity>
        </View>

        {liveAstro && liveAstro.length > 0 ? (
          <FlatList
            data={liveAstro}
            renderItem={({item}) => <AstrologerItem astrologer={item} navigation={navigation} t={t} />}
            keyExtractor={item => item.name}
            horizontal
            showsHorizontalScrollIndicator={false}
            removeClippedSubviews={false}
            contentContainerStyle={styles.liveAstrologersView}
          />
        ) : (
          <View style={styles.noLiveContainer}>
            <MaterialIcons name="videocam-off" size={moderateScale(28)} color={COLORS.lightGrey} />
            <Text style={styles.noLiveText}>{t('home.noOneLive')}</Text>
          </View>
        )}

        <View style={styles.separator} />

        <View style={styles.topAstrologers}>
          <Text style={styles.topAstrologerTxt}>{t('home.astroReports')}</Text>
        </View>
        <FreeServicesScreen
          services={astroServices.map(s => ({
            id: s.id,
            key: s.key,
            title: s.name,
            displayTitle: language === 'Hindi' ? (s.name_hi || s.name) : s.name,
            icon: s.image || ASTRO_SERVICE_ICONS[s.category],
            price: s.price,
          }))}
          onServiceSelect={handleAstroServiceSelect}
          showPrice
          variant="image"
        />

        <View style={styles.separator} />

        <View style={[styles.topAstrologers, styles.boxedHeader]}>
          <Text style={styles.topAstrologerTxt}>{t('home.blog')}</Text>
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => {
              captureEvent('home_screen_click', {section: 'blog_view_all'});
              navigation.navigate('BlogList', {data: blogs});
            }}>
            <Text style={styles.viewAll}>{t('home.viewAll')}</Text>
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
            renderItem={({item}) => <BlogItem blog={item} navigation={navigation} language={language} />}
            keyExtractor={item => item._id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            removeClippedSubviews={false}
            contentContainerStyle={styles.BlogView}
          />
        )}

        {/* Live Aarti / Pooja — admin-set YouTube URL, embedded in-app. Renders
            nothing at all when unset, so this is invisible unless an admin has
            actually put a stream/video here (astrowani-admin's Banners page). */}
        <LiveAartiSection />

        <View style={styles.reviewsBox}>
          <View style={[styles.customerReviews, {marginTop: verticalScale(15)}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(20)}}>
              <MaterialIcons name="format-quote" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.topAstrologerTxt, {color: 'white', fontSize: moderateScale(20), marginTop: verticalScale(5)}]}>{t('home.whatClientsSay')}</Text>
              <Text style={{color: COLORS.AstroSoftOrange, fontFamily: 'Lato-Regular', fontSize: moderateScale(12), marginTop: verticalScale(5)}}>{t('home.discoverTrust')}</Text>
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
                keyExtractor={(item, index) => index.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                removeClippedSubviews={false}
                contentContainerStyle={styles.ReviewsList}
              />
            ) : (
              <View style={styles.emptyReviewCard}>
                <MaterialIcons name="rate-review" size={moderateScale(30)} color={COLORS.AstroMaroon} />
                <Text style={styles.emptyReviewTxt}>{t('home.noReviews')}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.darkBottomSection}>
          <View style={[styles.footer, {backgroundColor: 'transparent', paddingBottom: 0}]}>
            <View style={{alignItems: 'center', marginBottom: verticalScale(15), marginTop: verticalScale(20)}}>
              <MaterialIcons name="stars" size={moderateScale(35)} color={COLORS.AstroSoftOrange} />
              <Text style={[styles.footerTitle, {color: 'white', fontSize: moderateScale(18), textAlign: 'center', marginTop: verticalScale(8)}]}>
                {t('home.whyBest')}
              </Text>
            </View>
            <View style={styles.footericonView}>
              <Text style={[styles.why, {color: '#f0f0f0', textAlign: 'center', lineHeight: verticalScale(24), fontSize: moderateScale(13)}]}>
                {t('home.whyBestBody')}
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
          onPress={() => {
            captureEvent('home_screen_click', {section: 'fixed_bar_chat'});
            navigation.navigate('Chat');
          }}
          style={styles.fixedBtn}>
          <MaterialIcons name="wechat" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>{t('home.chatWithAstrologer')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            captureEvent('home_screen_click', {section: 'fixed_bar_call'});
            navigation.navigate('Call');
          }}
          style={styles.fixedBtn}>
          <MaterialIcons name="add-call" size={22} color={COLORS.AstroMaroon} />
          <Text style={styles.fixedBtnTxt}>{t('home.talkToAstrologer')}</Text>
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
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: COLORS.AstroGold, marginTop: 20, marginBottom: 10 }}>{t('home.requestSent')}</Text>
            <Text style={{ fontSize: 16, color: COLORS.AstroSoftOrange, textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
              {t('home.waitingFor', {name: waitingAstroName})}
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
              <Text style={{ color: COLORS.AstroMaroon, fontWeight: 'bold', fontSize: 16 }}>{t('home.cancelRequest')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RequestingPopup
        visible={requesting}
        astro={requestAstro}
        onCancel={cancelRequest}
      />

      <FreeChatOfferPopup
        visible={freeChatOfferVisible}
        persona={freeChatPersona}
        onDismiss={() => {
          setFreeChatOfferVisible(false);
          setFreeChatOfferDismissed(true);
          if (user?.id) markFreeBotChatOfferSeen(user.id);
          showReferralPrompt();
        }}
        onStart={() => {
          setFreeChatOfferVisible(false);
          setFreeChatOfferDismissed(true);
          if (user?.id) markFreeBotChatOfferSeen(user.id);
          navigation.navigate('FreeBotChatScreen', { persona: freeChatPersona });
        }}
      />
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
    flexGrow: 1,
    justifyContent: 'center',
  },

  AstroImageWrap: {
    position: 'absolute',
    top: -verticalScale(40),
    zIndex: 10,
  },
  AstroImage: {
    width: scale(80),
    height: scale(80),
    borderRadius: moderateScale(40),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
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
    borderColor: COLORS.AstroMaroon,
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
  btnView: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: scale(6),
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 4,
  },
  chatBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(22),
    marginVertical: verticalScale(4),
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  videoButton: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(8),
    marginVertical: verticalScale(4),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    elevation: 1,
  },
  callButton: {
    backgroundColor: 'white',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(8),
    marginVertical: verticalScale(4),
    borderWidth: 1,
    borderColor: 'red',
    elevation: 1,
  },
  chatBtnTxt: {
    color: 'white',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
  },
  unavailableBtn: {
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(8),
    marginVertical: verticalScale(4),
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
  offlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderWidth: 1,
    borderColor: '#C0392B',
    elevation: 1,
  },
  busyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E67E22',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderWidth: 1,
    borderColor: '#E67E22',
    elevation: 1,
  },
  liveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C0392B',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    borderWidth: 1,
    borderColor: '#C0392B',
    elevation: 1,
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
  noLiveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(20),
  },
  noLiveText: {
    color: COLORS.lightGrey,
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(13),
    marginTop: verticalScale(6),
  },

  liveCard: {
    width: scale(160),
    height: verticalScale(240),
    borderRadius: moderateScale(18),
    marginHorizontal: scale(8),
    marginBottom: verticalScale(10),
    overflow: 'hidden',
    backgroundColor: '#222',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: '#ff3b30',
  },
  liveCardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  liveBadge: {
    position: 'absolute',
    top: verticalScale(10),
    left: scale(10),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff3b30',
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  livePulseDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#fff',
    marginRight: scale(5),
  },
  liveBadgeText: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
    letterSpacing: 0.5,
  },
  liveCardInfo: {
    position: 'absolute',
    bottom: verticalScale(10),
    left: scale(10),
    right: scale(10),
  },
  liveCardName: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
  liveCardTopic: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(11),
    marginTop: verticalScale(2),
  },
  liveCardStars: {
    marginTop: verticalScale(4),
  },
  liveCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: verticalScale(3),
  },
  liveCardMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(10),
  },
  liveCardMetaDot: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(10),
    marginHorizontal: scale(4),
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
