// Sign-up, step 3 of 3: the guide avatar welcomes the customer by name, and a
// single "Hi" button takes them to Home.
//
// GIFT MODE (2026-09-19): when the free 12-minute call is on and this customer is
// eligible, the screen instead shows "Namaste <name> ji" and the free-call card
// itself (inline, not a popup), with the guide avatar greeting them. Nobody drops
// between the OTP and Home, so this is the moment the offer is most likely to land;
// on Home the same offer was a popup that 59% closed. The Namaste tap is replaced by
// the one Claim button. There is no on-screen skip (owner's call, 2026-09-19);
// Android back still goes Home -- but on the card's 'intro' step it now asks once
// first (2026-09-20, see askBeforeLeaving below), and the gift box on Home keeps the
// offer reachable either way.
//
// Deliberately asks for nothing. Birth details are asked when the customer first
// tries something that needs them (see utils/profileGate.js).
//
// Copy is Hinglish in the English setting (it reads warmer than formal English
// for this audience) and Devanagari in the Hindi setting.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  BackHandler,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Defs, Line, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import { getFreeCallOffer } from '../../api/FreeCallApi';
import FreeCallOffer from '../../components/FreeCallOffer';
import { markFreeCallOfferSeen } from '../../utils/onboardingFlags';
import { showStatusPopup } from '../../components/StatusPopup';

// How long to wait for the offer before falling back to the plain welcome.
const GIFT_WAIT_MS = 5000;

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const GUIDE_AVATAR_ASPECT = 145 / 281;
const GOLD = COLORS.AstroGold;
const CREAM = '#FFF8EE';

// A north-Indian kundli chart (square, inner diamond, both diagonals) — far more
// recognisable to a customer than a generic sparkle icon.
function KundliIcon({ size }) {
  const p = 1;
  const m = size / 2;
  const e = size - p;
  return (
    <Svg width={size} height={size}>
      <Rect x={p} y={p} width={size - p * 2} height={size - p * 2} stroke={GOLD} strokeWidth={1.5} fill="none" rx={1} />
      <Polygon points={`${m},${p} ${e},${m} ${m},${e} ${p},${m}`} stroke={GOLD} strokeWidth={1.1} fill="none" />
      <Line x1={p} y1={p} x2={e} y2={e} stroke={GOLD} strokeWidth={0.9} />
      <Line x1={e} y1={p} x2={p} y2={e} stroke={GOLD} strokeWidth={0.9} />
    </Svg>
  );
}

function Halo({ size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 40000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = size / 2;
  const dots = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return { cx: r + Math.cos(a) * (r - 26), cy: r + Math.sin(a) * (r - 26) };
    }),
    [r],
  );
  return (
    <View pointerEvents="none" style={[styles.halo, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFB347" stopOpacity="0.45" />
            <Stop offset="0.6" stopColor="#C8743A" stopOpacity="0.15" />
            <Stop offset="1" stopColor={COLORS.AstroMaroon} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#glow)" />
        <Circle cx={r} cy={r} r={r - 44} stroke={GOLD} strokeOpacity={0.18} strokeWidth={1} fill="none" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={r}
            cy={r}
            r={r - 10}
            stroke={GOLD}
            strokeOpacity={0.5}
            strokeWidth={1.5}
            strokeDasharray="3 9"
            fill="none"
          />
          {dots.map((d, i) => (
            <Circle key={i} cx={d.cx} cy={d.cy} r={i % 3 === 0 ? 3 : 1.8} fill={GOLD} fillOpacity={i % 3 === 0 ? 0.8 : 0.45} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function SignupWelcome({ navigation, route }) {
  const { t } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const name = (route?.params?.name || '').trim();
  const firstName = name.split(/\s+/)[0] || '';

  const enter = useRef(new Animated.Value(0)).current;
  const bubbleIn = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const leftRef = useRef(false);
  // Where the free-call card is: 'intro' (offer not taken up yet), 'slots', 'done'.
  const giftStepRef = useRef('intro');
  const askingRef = useRef(false);
  // null = still asking, false = no offer for this customer, object = show the gift.
  const [gift, setGift] = useState(null);

  useEffect(() => {
    captureEvent('signup_welcome_viewed');
    // Ask for the free call offer now, while the customer reads this screen, so
    // Home can show its popup the moment it opens.
    let settled = false;
    const giveUp = setTimeout(() => {
      if (!settled) { settled = true; setGift(false); }
    }, GIFT_WAIT_MS);
    // Usually already on its way from the name screen (SignupName prefetches it).
    getFreeCallOffer({ usePrefetched: true }).then((fc) => {
      // Faces are warmed in api/FreeCallApi.js, as soon as ANY offer fetch lands --
      // including SignupName's prefetch, which is a minute earlier than this screen.
      if (settled) return;
      settled = true;
      const show = !!(fc?.enabled && fc?.eligible && fc?.offer);
      setGift(show ? fc : false);
      if (show) {
        // Seen here, so Home does not raise the same offer again as a popup.
        // The gift box on Home still offers it until they book.
        AsyncStorage.getItem('customerId')
          .then((id) => { if (id) markFreeCallOfferSeen(id); })
          .catch(() => {});
      }
    }).catch(() => {
      if (!settled) { settled = true; setGift(false); }
    });
    Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(bubbleIn, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -8, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    float.start();
    beat.start();
    return () => { float.stop(); beat.stop(); clearTimeout(giveUp); };
  }, [enter, bubbleIn, bounce, pulse]);

  const goHome = (via) => {
    if (leftRef.current) return;
    leftRef.current = true;
    captureEvent('signup_welcome_hi_tapped', { via });
    navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
  };

  const onGiftStep = useCallback((step) => { giftStepRef.current = step; }, []);

  // This is the root of the stack after signup, so a plain back would close the
  // app. Treat it as "Hi" instead.
  //
  // ONE EXCEPTION (2026-09-20): while the free-call card is still on its 'intro'
  // step, back asks first. Measured that day, 4 of 8 new customers left this screen
  // in 2-36 seconds without ever tapping Claim — and since the card has no on-screen
  // skip, back is the only door, so a reflex gesture and a considered "no thanks"
  // look identical. A soft confirm separates the two and costs one tap. It is NOT
  // shown once a time is booked ('done'), where leaving is the correct thing to do,
  // nor on the plain welcome (no gift), which has its own Namaste button.
  const askBeforeLeaving = () => {
    if (askingRef.current) return;
    askingRef.current = true;
    captureEvent('signup_welcome_leave_confirm_shown');
    showStatusPopup({
      variant: 'confirmPay',
      title: t('freeCall.leaveTitle'),
      message: t('freeCall.leaveMessage', { count: gift?.offer?.durationMinutes || 12 }),
      // Staying is the primary action: the offer is free, so leaving should not be
      // the easiest thing to hit (same reasoning as hooks/useConfirmLeaveReport.js).
      confirmText: t('freeCall.leaveStay'),
      onConfirm: () => {
        askingRef.current = false;
        captureEvent('signup_welcome_leave_cancelled');
      },
      cancelText: t('freeCall.leaveAnyway'),
      onCancel: () => {
        askingRef.current = false;
        goHome('back_confirmed');
      },
    });
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (gift && giftStepRef.current === 'intro') askBeforeLeaving();
      else goHome('back');
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gift]);

  // Birth details right after booking: open the form on top of Home, so saving (or
  // backing out of) it lands the customer on Home.
  const addBirthDetails = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    captureEvent('signup_welcome_hi_tapped', { via: 'free_call_birth_details' });
    navigation.reset({
      index: 1,
      routes: [
        { name: 'DrawerNavigator' },
        { name: 'CompleteBirthDetails', params: { intent: 'free_call_after_booking' } },
      ],
    });
  };

  if (gift) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.AstroMaroon} />
        {/* FIXED, never scrolls (2026-09-20, owner's call). The card used to sit in a
            page-level ScrollView, which made the whole screen slide around under the
            slot grid and read as two things scrolling at once. Now the page holds
            still and only the times scroll, inside the card. Everything here is sized
            to fit one screen -- keep it that way: anything added has to earn its
            height. */}
        <View style={[styles.giftPage, { paddingBottom: insets.bottom + verticalScale(12) }]}>
          {/* The guide avatar, gently floating, says the greeting in a speech bubble. */}
          <View style={styles.giftHero}>
            <Animated.Image
              source={require('../../assets/images/guideAvatarLogin.png')}
              style={[styles.giftAvatar, { transform: [{ translateY: bounce }] }]}
              resizeMode="contain"
            />
            <View style={styles.giftBubble}>
              <View style={styles.giftTailWrap} pointerEvents="none">
                <View style={styles.giftTailBorder} />
                <View style={styles.giftTail} />
              </View>
              <Text style={styles.giftTitle}>
                {firstName ? t('welcome.giftTitle', { name: firstName }) : t('welcome.giftTitleNoName')}
              </Text>
            </View>
          </View>

          <FreeCallOffer
            inline
            visible
            offer={gift.offer}
            t={t}
            source="welcome"
            onStepChange={onGiftStep}
            needsBirthDetails
            onAddBirthDetails={addBirthDetails}
            onClose={() => goHome('free_call_done')}
          />

        </View>
      </View>
    );
  }

  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const bubbleScale = bubbleIn.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const haloSize = scale(236);

  const chips = [
    { icon: 'verified', label: t('welcome.chipExperts') },
    { icon: 'forum', label: t('welcome.chipModes') },
    { icon: 'kundli', label: t('welcome.chipReports') },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.AstroMaroon} />

      {/* Brand. The transparent star mark, drawn on its own: inside a bordered
          circle its thin spokes ran into the ring and read as clutter. */}
      <Animated.View style={[styles.brandRow, { opacity: enter }]}>
        <Image
          source={require('../../assets/images/brandStarLogo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View>
          <Text style={styles.brand}>Astrowani</Text>
          <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
        </View>
      </Animated.View>

      <View style={styles.middle}>
        {/* Speech bubble */}
        <Animated.View style={[styles.bubble, { opacity: bubbleIn, transform: [{ scale: bubbleScale }] }]}>
          <Text style={styles.bubbleTitle}>
            {firstName ? t('welcome.greetingTitle', { name: firstName }) : t('welcome.greetingTitleNoName')}
          </Text>
          <Text style={styles.bubbleText}>{t('welcome.greeting')}</Text>
          <View style={styles.bubbleTailWrap} pointerEvents="none">
            <View style={styles.bubbleTailBorder} />
            <View style={styles.bubbleTail} />
          </View>
        </Animated.View>

        {/* Avatar on a glowing, slowly turning halo */}
        <Animated.View style={[styles.stage, { opacity: enter, transform: [{ translateY: rise }] }]}>
          <Halo size={haloSize} />
          <Animated.Image
            source={require('../../assets/images/guideAvatarLogin.png')}
            style={[styles.avatar, { transform: [{ translateY: bounce }] }]}
            resizeMode="contain"
          />
          <View style={styles.shadow} />
        </Animated.View>

        {/* What they can do here — three equal tiles, so it never wraps. */}
        <Animated.View style={[styles.chips, { opacity: enter }]}>
          {chips.map((c) => (
            <View key={c.icon} style={styles.chip}>
              <View style={styles.chipIcon}>
                {c.icon === 'kundli'
                  ? <KundliIcon size={moderateScale(24)} />
                  : <Icon name={c.icon} size={moderateScale(20)} color={GOLD} />}
              </View>
              {/* Fixed two-line box, text centred inside: a one-line label and a
                  two-line label then sit at the same height in their tiles. */}
              <View style={styles.chipTextBox}>
                <Text style={styles.chipText} numberOfLines={2}>{c.label}</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(18) }]}>
        <Text style={styles.hint}>{t('welcome.hint')}</Text>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            style={styles.hiBtn}
            activeOpacity={0.85}
            disabled={gift === null}
            onPress={() => goHome('button')}>
            {gift === null
              ? <ActivityIndicator color={COLORS.AstroMaroon} />
              : <Text style={styles.hiBtnText}>{t('welcome.hi')}</Text>}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroMaroon, overflow: 'hidden' },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(12),
    marginBottom: verticalScale(4),
  },
  logo: {
    width: scale(54),
    height: scale(54),
    marginRight: scale(12),
  },
  brand: { color: GOLD, fontSize: moderateScale(24), fontWeight: '800', letterSpacing: 0.5 },
  tagline: {
    color: COLORS.AstroSoftOrange,
    fontSize: moderateScale(12.5),
    letterSpacing: 1.2,
    marginTop: 1,
  },

  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: scale(22),
  },

  bubble: {
    backgroundColor: CREAM,
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(13),
    paddingHorizontal: scale(18),
    maxWidth: scale(330),
    borderWidth: 1.5,
    borderColor: GOLD,
    marginBottom: verticalScale(4),
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 2,
  },
  bubbleTitle: {
    fontSize: moderateScale(19),
    fontWeight: '800',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    marginBottom: verticalScale(5),
  },
  bubbleText: {
    fontSize: moderateScale(13.5),
    color: '#5a4034',
    textAlign: 'center',
    lineHeight: moderateScale(20),
  },
  // A full-width row centres the tail over the avatar. Two stacked triangles: a
  // gold one slightly larger underneath gives the tail the bubble's gold border.
  bubbleTailWrap: {
    position: 'absolute',
    bottom: -verticalScale(12),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bubbleTailBorder: {
    width: 0,
    height: 0,
    borderLeftWidth: scale(11),
    borderRightWidth: scale(11),
    borderTopWidth: verticalScale(12),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: GOLD,
  },
  bubbleTail: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: scale(9),
    borderRightWidth: scale(9),
    borderTopWidth: verticalScale(10),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: CREAM,
  },

  stage: { alignItems: 'center', justifyContent: 'flex-end', marginTop: verticalScale(10) },
  halo: { position: 'absolute', top: -verticalScale(10) },
  avatar: { height: verticalScale(210), aspectRatio: GUIDE_AVATAR_ASPECT },
  // A soft ground shadow — kept small and faint, a larger one read as a dark bar.
  shadow: {
    width: scale(80),
    height: verticalScale(7),
    borderRadius: scale(40),
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginTop: -verticalScale(5),
  },

  chips: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderColor: 'rgba(255,215,0,0.4)',
    borderWidth: 1,
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(4),
    marginHorizontal: scale(4),
  },
  // Same box for every icon, so the labels line up whatever the icon's size.
  chipIcon: { height: moderateScale(26), justifyContent: 'center', alignItems: 'center' },
  chipTextBox: {
    height: moderateScale(17) * 2,
    marginTop: verticalScale(6),
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  chipText: {
    color: CREAM,
    fontSize: moderateScale(11.5),
    lineHeight: moderateScale(17),
    fontWeight: '600',
    textAlign: 'center',
  },

  footer: { paddingHorizontal: scale(24), alignItems: 'stretch' },

  giftPage: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(12),
  },
  giftHero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    marginBottom: verticalScale(10),
  },
  giftAvatar: { height: verticalScale(118), aspectRatio: GUIDE_AVATAR_ASPECT },
  giftBubble: {
    flex: 1,
    marginLeft: scale(12),
    marginBottom: verticalScale(24),
    backgroundColor: CREAM,
    borderRadius: moderateScale(18),
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  // Tail pointing left at the avatar: a gold triangle under a cream one, so the
  // tail carries the bubble's gold border.
  giftTailWrap: {
    position: 'absolute',
    left: -scale(11),
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  giftTailBorder: {
    width: 0,
    height: 0,
    borderTopWidth: scale(9),
    borderBottomWidth: scale(9),
    borderRightWidth: scale(11),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: GOLD,
  },
  giftTail: {
    position: 'absolute',
    left: scale(2),
    width: 0,
    height: 0,
    borderTopWidth: scale(7),
    borderBottomWidth: scale(7),
    borderRightWidth: scale(9),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: CREAM,
  },
  giftTitle: { color: COLORS.AstroMaroon, fontSize: moderateScale(16), fontWeight: '800', lineHeight: moderateScale(22) },
  hint: {
    color: COLORS.AstroSoftOrange,
    fontSize: moderateScale(13),
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  hiBtn: {
    backgroundColor: GOLD,
    borderRadius: moderateScale(28),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  hiBtnText: { color: COLORS.AstroMaroon, fontSize: moderateScale(19), fontWeight: '800' },
});
