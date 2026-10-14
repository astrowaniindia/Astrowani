// The pre-login "YOU WIN" gift reveal, shown to a signed-out visitor whose install
// came from the targeted Google Ads campaign (utils/acquisition.js
// isTargetCampaignFirstOpen -> App.js picks this as the initial route).
//
// WHY IT LOOKS LIKE THIS. That campaign buys installs at ~₹41 against the broad
// campaign's ~₹1.91 (astrowani-backend/src/acquisitionRoutes.js), so the first seconds
// of the app are the most expensive seconds we own. A card that states an offer reads
// as an advert and gets dismissed; a prize the person OPENS THEMSELVES lands as
// something they already have and would be giving up by closing.
//
// The box therefore waits, closed and fidgeting, until they tap ANYWHERE — that tap is
// the whole conversion moment. Then: lid off, burst, "YOU WIN!" punches in dead centre
// and travels up to the top, and the prize, the guide and the CTA arrive under it.
//
// Replaces (does not delete) CampaignFreeCallPrompt.js — see
// CAMPAIGN_GIFT_REVEAL_ENABLED in utils/featureFlags.js. Both hand off identically:
// accept -> queueFreeCallFromCampaign(), cross -> queueCampaignDeclined(), and
// SignupWelcome acts on whichever was queued.
//
// EVERY animation here drives transform/opacity only, so all of it runs on the native
// driver. On a cheap phone this is the first thing a paid visitor ever sees; a reveal
// that janks is worse than no reveal.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import { markCampaignFreeCallPromptShown } from '../../utils/acquisition';
import { queueFreeCallFromCampaign, queueCampaignDeclined } from '../../utils/freeCallInvite';
import { showPendingGift } from '../../utils/pendingGiftBubble';
import { showSignupNudge } from '../../utils/signupNudge';
import { NUDGE_MS } from '../../components/SignupNudgeHost';

const GOLD = COLORS.AstroGold;
const CREAM = '#FFF8EE';
const DEEP = '#4A1C10';
const GUIDE_AVATAR_ASPECT = 145 / 281;

const BOX = scale(168);
// The teaser and the tap hint float a fixed distance above/below the box's centre, so
// the BOX itself stays exactly on the stage centre — which is where the rays and the
// confetti emanate from. Laying them out in a column instead would shove the box off
// that centre by half the text block's height and the burst would look misaligned.
const TEASER_LIFT = BOX * 0.80;
const HINT_DROP = BOX * 0.72;
// How far "YOU WIN!" travels from dead centre up to its resting place at the top.
const WIN_RISE = verticalScale(215);
// Where the prize card settles: just under the risen title.
const PRIZE_DROP = verticalScale(94);

// ── The "it goes in your pocket" exit ────────────────────────────────────────
// Dismissing does not just close the screen: the whole screen collapses into the
// gift bubble and flies to the bottom-right corner — landing exactly where Home's
// floating gift sits ("Your 11min free call is waiting", components/FreeCallGiftBubble).
// The prize is not lost by pressing ✕, it is PUT SOMEWHERE, and the customer has
// watched where. These three must stay in step with that component's own geometry.
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BUBBLE = scale(52);              // FreeCallGiftBubble SIZE
const LABEL_W = scale(126);            // PendingGiftBubbleHost GIFT_LABEL_W
// The host centres the circle over its (wider) hint pill, so the circle itself sits
// further in from the screen edge than the pill does. Land on that same spot.
const BUBBLE_RIGHT = scale(14) + (LABEL_W - BUBBLE) / 2;
// Must equal PendingGiftBubbleHost's `wrap.bottom`, which is what this bubble hands
// over to the instant it lands — a mismatch makes the gift jump as the screen changes.
const BUBBLE_BOTTOM = verticalScale(48);
// Big enough that the circle covers the screen at the start of the collapse.
const COLLAPSE_SCALE = (Math.max(SCREEN_W, SCREEN_H) * 1.3) / BUBBLE;
// Offset from the bubble's resting centre to the screen's centre, i.e. how far it
// travels on the way down to the corner.
const COLLAPSE_DX = SCREEN_W / 2 - (SCREEN_W - BUBBLE_RIGHT - BUBBLE / 2);
const COLLAPSE_DY = SCREEN_H / 2 - (SCREEN_H - BUBBLE_BOTTOM - BUBBLE / 2);

const RAY_COUNT = 14;
const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = ['#FFD233', '#FFB347', '#FFF1C9', '#F5A623', '#FFE9A8', '#E8743A'];

/**
 * The box body. Drawn with NO empty padding above it: the lid is a separate SVG
 * stacked directly on top, so any slack inside either viewBox shows up as a visible
 * gap between the two halves of a supposedly closed box.
 */
function GiftBoxBody({ size }) {
  const w = size;
  const h = size * 0.66;
  return (
    <Svg width={w} height={h}>
      <Rect x={w * 0.08} y={0} width={w * 0.84} height={h} rx={w * 0.05} fill="#C2341F" stroke={GOLD} strokeWidth={2.5} />
      {/* ribbon, vertical then horizontal */}
      <Rect x={w * 0.42} y={0} width={w * 0.16} height={h} fill={GOLD} opacity={0.95} />
      <Rect x={w * 0.08} y={h * 0.34} width={w * 0.84} height={w * 0.09} fill={GOLD} opacity={0.8} />
    </Svg>
  );
}

/** The lid: bow, knot, and the slab that sits flush on the body. */
function GiftBoxLid({ size }) {
  const w = size;
  const h = size * 0.30;
  return (
    <Svg width={w} height={h}>
      <Ellipse cx={w * 0.36} cy={h * 0.3} rx={w * 0.14} ry={h * 0.28} fill={GOLD} />
      <Ellipse cx={w * 0.64} cy={h * 0.3} rx={w * 0.14} ry={h * 0.28} fill={GOLD} />
      <Circle cx={w * 0.5} cy={h * 0.33} r={w * 0.06} fill="#FFE9A8" />
      <Rect x={w * 0.03} y={h * 0.55} width={w * 0.94} height={h * 0.45} rx={w * 0.035} fill="#D83C22" stroke={GOLD} strokeWidth={2.5} />
    </Svg>
  );
}

/** The star-burst that fires out from behind the box when the lid goes. */
function Rays({ size }) {
  const r = size / 2;
  const points = useMemo(
    () => Array.from({ length: RAY_COUNT }, (_, i) => {
      const a = (i / RAY_COUNT) * Math.PI * 2;
      const spread = 0.055;
      const inner = r * 0.18;
      return [
        `${r + Math.cos(a - spread) * inner},${r + Math.sin(a - spread) * inner}`,
        `${r + Math.cos(a) * r},${r + Math.sin(a) * r}`,
        `${r + Math.cos(a + spread) * inner},${r + Math.sin(a + spread) * inner}`,
      ].join(' ');
    }),
    [r],
  );
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="burstGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFD233" stopOpacity="0.55" />
          <Stop offset="0.55" stopColor="#FFB347" stopOpacity="0.18" />
          <Stop offset="1" stopColor={COLORS.AstroMaroon} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#burstGlow)" />
      {points.map((p, i) => (
        <Polygon key={i} points={p} fill={i % 2 ? '#FFE9A8' : GOLD} opacity={i % 2 ? 0.55 : 0.9} />
      ))}
    </Svg>
  );
}

export default function CampaignGiftReveal({ navigation, route }) {
  const { t: tRaw } = useContext(LanguageContext);
  // The Metro campaign runs the same reveal in ENGLISH (see campaignMetro.* in
  // LanguageContext). One screen, two key prefixes — a second copy of this file
  // would be two animations to keep in step for the sake of different wording.
  const metro = route?.params?.variant === 'metro';
  const t = (key, vars) => tRaw(metro ? key.replace(/^campaignGift\./, 'campaignMetro.') : key, vars);
  const insets = useSafeAreaInsets();
  const leftRef = useRef(false);
  const openedRef = useRef(false);
  const [opened, setOpened] = useState(false);

  // ── One Animated.Value per beat ────────────────────────────────────────────
  const drop = useRef(new Animated.Value(0)).current;      // box falls in
  const wobble = useRef(new Animated.Value(0)).current;    // anticipation fidget
  const hintPulse = useRef(new Animated.Value(0)).current; // "tap to open" breath
  const lid = useRef(new Animated.Value(0)).current;       // lid flies off
  const burst = useRef(new Animated.Value(0)).current;     // rays + confetti
  const flash = useRef(new Animated.Value(0)).current;     // white pop
  const boxOut = useRef(new Animated.Value(0)).current;    // body clears the stage
  const winPop = useRef(new Animated.Value(0)).current;    // "YOU WIN" punches in
  const winRise = useRef(new Animated.Value(0)).current;   // ...then travels up
  const prize = useRef(new Animated.Value(0)).current;     // prize card
  const avatarIn = useRef(new Animated.Value(0)).current;  // guide slides up
  const ctaIn = useRef(new Animated.Value(0)).current;     // button slides up
  const pulse = useRef(new Animated.Value(1)).current;     // button heartbeat
  const float = useRef(new Animated.Value(0)).current;     // guide bob
  const collapse = useRef(new Animated.Value(0)).current;  // screen -> corner bubble
  const [collapsing, setCollapsing] = useState(false);
  // Once the landed bubble has been handed to PendingGiftBubbleHost, this screen stops
  // drawing its own. Both render the same bubble on the same spot, and for the beat
  // they overlapped their two cream labels sat slightly apart — which read on screen as
  // two gifts in the corner.
  const [handedOff, setHandedOff] = useState(false);

  const shakeRef = useRef(null);
  const exitTimer = useRef(null);
  const nudgingRef = useRef(false);

  // ── Journey timing ─────────────────────────────────────────────────────────
  // Every event this screen sends carries how long the person had been looking at
  // it, because on a paid install the question is never just "did they convert" but
  // "how long did the box sit there before they touched it". `openedAt` is null until
  // the box is opened, which is also how the abandon watcher below knows the
  // difference between leaving a closed box and leaving an opened one.
  const shownAtRef = useRef(Date.now());
  const openedAtRef = useRef(null);
  const abandonSentRef = useRef(false);
  const secsSinceShown = () => Math.round((Date.now() - shownAtRef.current) / 1000);
  const secsSinceOpen = () => (openedAtRef.current
    ? Math.round((Date.now() - openedAtRef.current) / 1000)
    : null);

  // Fixed per mount: a confetti burst re-randomised on every render would re-fly
  // itself whenever React re-rendered this screen.
  const confetti = useMemo(
    () => Array.from({ length: CONFETTI_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = scale(90) + Math.random() * scale(160);
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist * 0.75,
        fall: verticalScale(90) + Math.random() * verticalScale(240),
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
        size: scale(5) + Math.random() * scale(7),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        round: Math.random() < 0.35,
      };
    }),
    [],
  );

  useEffect(() => {
    captureEvent('campaign_gift_reveal_shown');
    // Marked once it is actually on screen, so a launch killed mid-bootstrap shows it
    // again next time rather than burning the one chance silently.
    markCampaignFreeCallPromptShown();

    // The box drops in and settles...
    Animated.timing(drop, {
      toValue: 1, duration: 620, easing: Easing.bezier(0.2, 1.3, 0.4, 1), useNativeDriver: true,
    }).start();

    // ...then fidgets, like something alive is inside, until it is tapped.
    const shake = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(420),
      ]),
    );
    shakeRef.current = shake;
    const startShake = setTimeout(() => shake.start(), 640);

    const hint = Animated.loop(
      Animated.sequence([
        Animated.timing(hintPulse, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(hintPulse, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -8, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.045, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    hint.start();
    bob.start();
    beat.start();

    // THE ONE EXIT NOTHING ELSE SEES. The ✕ only exists after the box is open, and
    // this screen is the app's initial route, so someone who never taps the box can
    // only leave by backgrounding or killing the app — which until now produced no
    // event at all, leaving "shown but never opened" indistinguishable from "still
    // sitting there". That is the single most expensive outcome on a ~₹41 install, so
    // it gets its own event rather than being inferred from a funnel gap.
    const onAppState = (next) => {
      if (next === 'active') return;
      if (openedRef.current || leftRef.current || abandonSentRef.current) return;
      abandonSentRef.current = true;
      captureEvent('campaign_gift_reveal_abandoned', {
        seconds_on_screen: secsSinceShown(),
        opened: false,
      });
    };
    const appStateSub = AppState.addEventListener('change', onAppState);

    return () => {
      clearTimeout(startShake);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      shake.stop();
      hint.stop();
      bob.stop();
      beat.stop();
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The tap that opens it. Guarded by a ref so a double tap cannot fire twice. */
  const openGift = () => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (shakeRef.current) shakeRef.current.stop();
    wobble.setValue(0);
    setOpened(true);
    openedAtRef.current = Date.now();
    // How long the closed box sat there before it was touched — the measure of
    // whether the fidget/"tap anywhere" prompt is doing its job.
    captureEvent('campaign_gift_reveal_opened', { seconds_to_open: secsSinceShown() });

    Animated.parallel([
      Animated.timing(lid, { toValue: 1, duration: 760, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(flash, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(boxOut, { toValue: 1, duration: 600, delay: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      // "YOU WIN!" lands dead centre, holds for a beat...
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(winPop, { toValue: 1, friction: 4.5, tension: 95, useNativeDriver: true }),
      ]),
      // ...then carries itself up to the top, making room for the prize.
      Animated.sequence([
        Animated.delay(950),
        Animated.timing(winRise, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1320),
        Animated.spring(prize, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1600),
        Animated.spring(avatarIn, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1820),
        Animated.spring(ctaIn, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
      ]),
    ]).start();
  };

  /**
   * Accepting the prize goes through the sign-up reassurance first. The jump from
   * "YOU WIN" straight to a phone-number field is where this screen loses people, so
   * the card says the call is already theirs and that the form is three taps — then
   * the app moves on by itself. Nothing to press, nothing to get past.
   */
  const acceptWithNudge = () => {
    if (leftRef.current || nudgingRef.current) return;
    nudgingRef.current = true;
    showSignupNudge();
    exitTimer.current = setTimeout(() => leave('cta', true), NUDGE_MS);
  };

  const leave = (via, accepted) => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (accepted) {
      captureEvent('campaign_gift_reveal_accepted', {
        seconds_on_screen: secsSinceShown(),
        seconds_since_open: secsSinceOpen(),
      });
      queueFreeCallFromCampaign();
    } else {
      captureEvent('campaign_gift_reveal_closed', {
        via,
        opened: openedRef.current,
        seconds_on_screen: secsSinceShown(),
        seconds_since_open: secsSinceOpen(),
      });
      // Asked once here — SignupWelcome must not raise its own offer card afterwards.
      queueCampaignDeclined();
    }
    navigation.replace('Login');
  };

  /**
   * Dismiss: the screen folds itself into the gift bubble and drops it into the
   * bottom-right corner — the exact spot Home's own gift sits — before moving on.
   * The point is that pressing ✕ visibly PUTS the prize somewhere rather than
   * throwing it away, so the bubble on Home afterwards is a thing they watched
   * land there, not a new thing to be explained.
   */
  const dismissIntoBubble = () => {
    if (leftRef.current || collapsing) return;
    setCollapsing(true);
    captureEvent('campaign_gift_reveal_collapsed');
    Animated.timing(collapse, {
      toValue: 1,
      duration: 880,
      easing: Easing.bezier(0.45, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => {
      // Hand the landed bubble over to the host above the navigator BEFORE leaving, so
      // it simply stays in the corner through Login/OTP/name instead of blinking out
      // with this screen. Both draw the same bubble on the same coordinates, so the
      // swap is invisible.
      showPendingGift();
      setHandedOff(true);
      // A beat on the corner, so the landing registers before the screen changes.
      exitTimer.current = setTimeout(() => leave('cross', false), 320);
    });
  };

  // ── Interpolations ─────────────────────────────────────────────────────────
  const boxTranslate = drop.interpolate({ inputRange: [0, 1], outputRange: [-verticalScale(320), 0] });
  const boxWobble = wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  const boxFade = boxOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const boxSink = boxOut.interpolate({ inputRange: [0, 1], outputRange: [0, verticalScale(34)] });

  const lidLift = lid.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, -verticalScale(130), -verticalScale(300)] });
  const lidSpin = lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-42deg'] });
  const lidFade = lid.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] });

  const flashScale = flash.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.4] });
  const flashFade = flash.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.85, 0] });

  const raysScale = burst.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.25, 1.1, 1.55] });
  const raysFade = burst.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.95, 0.45, 0] });
  const raysSpin = burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '28deg'] });

  const winScale = winPop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const winTravel = winRise.interpolate({ inputRange: [0, 1], outputRange: [0, -WIN_RISE] });
  const prizeRise = prize.interpolate({ inputRange: [0, 1], outputRange: [PRIZE_DROP + verticalScale(26), PRIZE_DROP] });
  const prizeScale = prize.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const avatarRise = avatarIn.interpolate({ inputRange: [0, 1], outputRange: [verticalScale(130), 0] });
  const ctaRise = ctaIn.interpolate({ inputRange: [0, 1], outputRange: [verticalScale(70), 0] });
  const hintFade = hintPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  // The collapse: everything on screen drops away fast while the bubble shrinks out of
  // the middle and slides into the corner, its gift icon and label appearing only once
  // it is small enough for them to read as a bubble rather than a wall of gold.
  const contentFade = collapse.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' });
  const bubbleScale = collapse.interpolate({ inputRange: [0, 1], outputRange: [COLLAPSE_SCALE, 1] });
  const bubbleX = collapse.interpolate({ inputRange: [0, 1], outputRange: [COLLAPSE_DX, 0] });
  const bubbleY = collapse.interpolate({ inputRange: [0, 1], outputRange: [COLLAPSE_DY, 0] });
  const bubbleIconFade = collapse.interpolate({ inputRange: [0, 0.68, 0.9], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const bubbleLabelFade = collapse.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Everything on screen, so the collapse can fold the lot away in one go. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: contentFade }]}
        pointerEvents={collapsing ? 'none' : 'box-none'}
      >
      {/* ── The stage: box, then burst, then prize. Every layer is an absolute fill
             centred on itself, so the box sits exactly on the screen's centre and the
             burst fires from the same point. ──────────────────────────────────── */}
      <View style={styles.stage}>
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, { opacity: raysFade, transform: [{ scale: raysScale }, { rotate: raysSpin }] }]}
        >
          <Rays size={scale(340)} />
        </Animated.View>

        <Animated.View pointerEvents="none" style={styles.layer}>
          <Animated.View
            style={[styles.flash, { opacity: flashFade, transform: [{ scale: flashScale }] }]}
          />
        </Animated.View>

        <View pointerEvents="none" style={styles.layer}>
          {confetti.map((c, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                {
                  width: c.size,
                  height: c.round ? c.size : c.size * 1.9,
                  borderRadius: c.round ? c.size : 1.5,
                  backgroundColor: c.color,
                  opacity: burst.interpolate({ inputRange: [0, 0.08, 0.72, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.dx] }) },
                    {
                      translateY: burst.interpolate({
                        inputRange: [0, 0.42, 1],
                        outputRange: [0, c.dy, c.dy + c.fall],
                      }),
                    },
                    { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${c.spin}deg`] }) },
                    { scale: burst.interpolate({ inputRange: [0, 0.14, 1], outputRange: [0.3, 1, 0.9] }) },
                  ],
                },
              ]}
            />
          ))}
        </View>

        {/* the box: lid stacked flush on the body, both leaving at the reveal */}
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, { opacity: boxFade, transform: [{ translateY: boxTranslate }] }]}
        >
          <Animated.View style={{ alignItems: 'center', transform: [{ translateY: boxSink }, { rotate: boxWobble }] }}>
            <Animated.View
              style={[styles.lid, { opacity: lidFade, transform: [{ translateY: lidLift }, { rotate: lidSpin }] }]}
            >
              <GiftBoxLid size={BOX} />
            </Animated.View>
            <GiftBoxBody size={BOX} />
          </Animated.View>
        </Animated.View>

        {/* teaser above the box, tap hint below it — both floating off the centre so
            the box stays put */}
        {!opened && (
          <>
            <View pointerEvents="none" style={styles.layer}>
              <Animated.Text
                style={[styles.teaser, { opacity: drop, transform: [{ translateY: -TEASER_LIFT }] }]}
              >
                {t('campaignGift.teaser')}
              </Animated.Text>
            </View>
            <View pointerEvents="none" style={styles.layer}>
              <Animated.Text
                style={[styles.tapHint, { opacity: hintFade, transform: [{ translateY: HINT_DROP }] }]}
              >
                {t('campaignGift.tapToOpen')}
              </Animated.Text>
            </View>
          </>
        )}

        {/* the prize: title punches in dead centre, then rises; card follows under it */}
        {opened && (
          <>
            <View pointerEvents="none" style={styles.layer}>
              <Animated.Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.youWin,
                  { opacity: winPop, transform: [{ translateY: winTravel }, { scale: winScale }] },
                ]}
              >
                {t('campaignGift.youWin')}
              </Animated.Text>
            </View>
            <View pointerEvents="none" style={styles.layer}>
              <Animated.View
                style={[
                  styles.prizeCard,
                  {
                    opacity: prize,
                    transform: [{ translateY: Animated.add(prizeRise, winTravel) }, { scale: prizeScale }],
                  },
                ]}
              >
                <Text style={styles.prizeTitle}>{t('campaignGift.prizeTitle')}</Text>
                <Text style={styles.prizeSub}>{t('campaignGift.prizeSub')}</Text>
              </Animated.View>
            </View>
          </>
        )}
      </View>

      {/* ── Guide + CTA, pinned to the bottom. Deliberately OUT of the normal flow:
             as flow siblings they shortened the stage by their own height, which put
             the stage's centre — and therefore the gift box and the burst — well above
             the screen's centre even though everything was "centred". ────────────── */}
      <View style={styles.bottomBlock} pointerEvents="box-none">
      <Animated.View
        style={[styles.guideRow, { opacity: avatarIn, transform: [{ translateY: avatarRise }] }]}
        pointerEvents="none"
      >
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{t('campaignGift.avatarLine')}</Text>
          <View style={styles.bubbleTailWrap}>
            <View style={styles.bubbleTailBorder} />
            <View style={styles.bubbleTail} />
          </View>
        </View>
        <Animated.Image
          source={require('../../assets/images/guideAvatarLogin.png')}
          style={[styles.guide, { transform: [{ translateY: float }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* ── CTA. pointerEvents is gated on `opened`: before the reveal this button is
             invisible but still laid out, and an invisible button that can be pressed
             is worse than no button. ───────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={opened ? 'auto' : 'none'}
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + verticalScale(18),
            opacity: ctaIn,
            transform: [{ translateY: ctaRise }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={acceptWithNudge}>
            <Text style={styles.ctaText}>{t('campaignGift.cta')}</Text>
            <Icon name="arrow-forward" size={moderateScale(20)} color={COLORS.AstroMaroon} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
      </View>
      </Animated.View>

      {/* Tap-anywhere catcher. Rendered AFTER the content so it is above all of it, and
          unmounted the moment the box opens so it never swallows the CTA. The ✕ below
          is rendered after this and carries a higher zIndex, so it still works. */}
      {!opened && (
        <Pressable style={styles.tapCatcher} onPress={openGift} accessibilityRole="button" />
      )}

      {/* The way out appears only AFTER the gift is open. While the box is still shut
          there is nothing to decline yet, and an ✕ sitting over an unopened present is
          an invitation to leave before ever seeing what is in it. */}
      {opened && !collapsing && (
        <Animated.View
          style={[styles.closeWrap, { top: insets.top + verticalScale(10), opacity: avatarIn }]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            activeOpacity={0.7}
            onPress={dismissIntoBubble}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Icon name="close" size={moderateScale(22)} color={CREAM} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* The screen, folded into Home's gift bubble and dropped in the corner. It is
          deliberately the SAME maroon circle + gold gift icon + cream label that
          FreeCallGiftBubble renders, landing on its exact coordinates, so what the
          customer sees on Home afterwards is the thing they just watched land. */}
      {collapsing && !handedOff && (
        <View style={styles.collapseLayer} pointerEvents="none">
          <Animated.View
            style={[
              styles.collapseBubble,
              { transform: [{ translateX: bubbleX }, { translateY: bubbleY }, { scale: bubbleScale }] },
            ]}
          >
            <Animated.View style={{ opacity: bubbleIconFade }}>
              <Icon name="card-giftcard" size={moderateScale(24)} color={GOLD} />
            </Animated.View>
          </Animated.View>
          <Animated.View style={[styles.collapseLabel, { opacity: bubbleLabelFade }]}>
            <Text style={styles.collapseLabelText} numberOfLines={2}>{t('freeCall.giftHint')}</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroMaroon, overflow: 'hidden' },
  tapCatcher: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  closeWrap: { position: 'absolute', right: scale(16), zIndex: 30 },
  closeBtn: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Fills the WHOLE screen (not the space left over above the guide/CTA), so the
  // stage's centre is the screen's centre — which is where the box must sit.
  stage: { ...StyleSheet.absoluteFillObject },
  bottomBlock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  // Every stage layer fills the stage and centres its own content, so each one shares
  // the exact same centre point.
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  flash: {
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    backgroundColor: '#FFF3C4',
  },
  confetti: { position: 'absolute' },
  lid: { alignItems: 'center', marginBottom: -verticalScale(1) },

  teaser: {
    color: COLORS.AstroSoftOrange,
    fontSize: moderateScale(15),
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
    paddingHorizontal: scale(32),
  },
  tapHint: {
    color: GOLD,
    fontSize: moderateScale(13),
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
  },

  collapseLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  collapseBubble: {
    position: 'absolute',
    right: BUBBLE_RIGHT,
    bottom: BUBBLE_BOTTOM,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  // Same cream pill FreeCallGiftBubble puts under its icon, in the same place.
  collapseLabel: {
    position: 'absolute',
    right: scale(14),
    width: LABEL_W,
    bottom: BUBBLE_BOTTOM - verticalScale(39),
    alignItems: 'stretch',
  },
  collapseLabelText: {
    backgroundColor: '#FFF9F3',
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E9D9C9',
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    fontSize: moderateScale(9),
    lineHeight: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    textAlign: 'center',
    overflow: 'hidden',
  },

  youWin: {
    color: GOLD,
    fontSize: moderateScale(72),
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    textShadowColor: 'rgba(255,180,40,0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  prizeCard: {
    backgroundColor: CREAM,
    borderRadius: moderateScale(18),
    borderWidth: 2,
    borderColor: GOLD,
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  prizeTitle: {
    color: DEEP,
    fontSize: moderateScale(27),
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  prizeSub: {
    color: '#6A4A38',
    fontSize: moderateScale(15),
    fontWeight: '600',
    marginTop: verticalScale(4),
    textAlign: 'center',
  },

  // A COLUMN, centred: the guide stands in the middle of the screen and what he says
  // sits directly under him. Side-by-side (the earlier layout) pushed him off to the
  // left and hung the bubble over his shoulder, which read as a label pinned next to
  // him rather than him speaking to the person holding the phone.
  // A COLUMN, centred: what the guide says sits in a speech bubble ABOVE his head and
  // he stands under it, just above the button. Side-by-side (the earliest layout) shoved
  // him off to the left and hung the bubble over his shoulder, which read as a label
  // pinned next to him rather than him speaking to the person holding the phone.
  guideRow: {
    alignItems: 'center',
    paddingHorizontal: scale(18),
    marginBottom: verticalScale(36),
  },
  guide: { height: verticalScale(140), aspectRatio: GUIDE_AVATAR_ASPECT },
  // DELIBERATELY NOT the prize card's solid cream slab with a thick gold frame: at that
  // weight two cream cards stacked up the screen competed with each other and the eye could not
  // tell which one was the prize. This is a quiet translucent caption — the prize stays
  // the only bright block on the screen.
  bubble: {
    alignSelf: 'center',
    maxWidth: scale(290),
    marginBottom: verticalScale(13),
    backgroundColor: 'rgba(0,0,0,0.26)',
    borderRadius: moderateScale(14),
    borderWidth: 1,
    borderColor: 'rgba(255,210,51,0.45)',
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(14),
  },
  bubbleText: {
    color: CREAM,
    fontSize: moderateScale(12.5),
    fontWeight: '600',
    lineHeight: moderateScale(18),
    textAlign: 'center',
  },
  // Tail pointing DOWN at the guide standing under it: a border triangle with a fill
  // triangle just inside it, so the tail carries the bubble's own edge.
  bubbleTailWrap: { position: 'absolute', bottom: -scale(10), left: 0, right: 0, alignItems: 'center' },
  bubbleTailBorder: {
    width: 0,
    height: 0,
    borderLeftWidth: scale(9),
    borderRightWidth: scale(9),
    borderTopWidth: scale(10),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,210,51,0.45)',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: scale(2),
    width: 0,
    height: 0,
    borderLeftWidth: scale(7),
    borderRightWidth: scale(7),
    borderTopWidth: scale(8),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // AstroMaroon (#592a19) under the bubble's own black-26% wash — the tail has to be
    // opaque or the overlap with the border triangle shows as a darker notch.
    borderTopColor: '#421F12',
  },

  footer: { paddingHorizontal: scale(20) },
  cta: {
    flexDirection: 'row',
    backgroundColor: GOLD,
    borderRadius: moderateScale(30),
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 14,
  },
  ctaText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(17),
    fontWeight: '900',
    marginRight: scale(8),
  },
});
