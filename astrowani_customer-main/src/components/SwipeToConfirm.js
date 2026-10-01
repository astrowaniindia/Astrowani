import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Animated, PanResponder, StyleSheet, ActivityIndicator, Vibration} from 'react-native';
import Svg, {Defs, LinearGradient, Stop, Rect, Path, G} from 'react-native-svg';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

// Flame tongues, drawn in a 100x52 box with the TIP at the left (x=0) and the
// body swelling to the right -- so the shape reads as fire streaming backwards
// off a knob travelling right. Three overlapping tongues of different lengths
// (outer red, mid orange, inner yellow core) is the standard way to make a flat
// vector flame look like fire rather than a blob; each one flickers on its own
// timing below, which is what sells it as alive.
const FLAME_TONGUES = [
  {
    d: 'M0,26 C26,8 54,2 100,4 C86,18 84,34 100,48 C54,50 26,44 0,26 Z',
    fill: 'url(#flameOuter)',
    len: 1,
  },
  {
    d: 'M10,26 C32,13 56,9 88,11 C76,20 75,33 88,42 C56,44 32,39 10,26 Z',
    fill: 'url(#flameMid)',
    len: 0.82,
  },
  {
    d: 'M26,26 C42,18 58,15 76,17 C68,22 68,31 76,36 C58,38 42,34 26,26 Z',
    fill: 'url(#flameCore)',
    len: 0.6,
  },
];

/**
 * Slide-to-confirm, in the shape people already know from food-delivery checkouts
 * (Swiggy's own slide-to-pay is the reference point: a circular knob carrying double
 * chevrons that morph to a checkmark on success, a springy snap-back if released
 * early, and a quiet idle shimmer -- nothing busier than that at rest).
 *
 * Used where money leaves the wallet. A tap is easy to do by accident on a phone in
 * one hand; a deliberate drag across the width of the control is not, which is the
 * whole reason this pattern exists on payment screens.
 *
 * PanResponder + Animated rather than gesture-handler/reanimated: this is one
 * horizontal drag with no gesture composition, and the plain API keeps it working
 * inside a Modal without any provider in the tree above it.
 *
 * TWO Animated.Values track the same drag position on purpose -- `x` (native-driven,
 * transform only) and `fillX` (JS-thread, never native-driven). `x` drives the
 * knob's translateX/scale; `fillX` drives the SVG fill/flame width. Mixing a
 * native-driven value into a non-transform/opacity property (width) throws "Style
 * property 'width' is not supported by native animated module", so they cannot be
 * the same value. Every place one moves, the other moves with it.
 *
 * Shared by every screen in the app that takes a payment behind a slide -- the 9
 * astro-report purchase screens and the wallet recharge screen.
 */
export default function SwipeToConfirm({
  label,
  confirmingLabel,
  onConfirm,
  busy = false,
  disabled = false,
}) {
  const [trackW, setTrackW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const fillX = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  // 0 -> 1 exactly once, the instant a drag crosses the threshold. Washes the
  // track in a success colour as the knob morphs into a checkmark.
  const success = useRef(new Animated.Value(0)).current;
  // Idle shimmer: a soft light band sweeping once across the track, then a pause.
  // This is the one idle affordance kept visible at rest -- no fill, no flame, no
  // repeated arrows cluttering a control that is mostly looked at, not read.
  const shimmer = useRef(new Animated.Value(0)).current;
  // One flicker value per flame tongue. They MUST be independent and on
  // different durations -- a single shared value makes all three pulse in
  // lockstep, which reads as a blinking shape, not fire.
  const flick0 = useRef(new Animated.Value(0.6)).current;
  const flick1 = useRef(new Animated.Value(0.4)).current;
  const flick2 = useRef(new Animated.Value(0.8)).current;
  const flickers = useMemo(() => [flick0, flick1, flick2], [flick0, flick1, flick2]);
  const [dragging, setDragging] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const firedRef = useRef(false);

  const KNOB = scale(46);
  const PAD = scale(4);
  const TRACK_H = verticalScale(52);
  const maxX = Math.max(0, trackW - KNOB - PAD * 2);
  // A SMALL nudge is enough -- the customer does not have to drag the whole way,
  // just start a clearly-horizontal movement past this point and the spring below
  // carries it the rest of the way automatically. 22% (capped at a small absolute
  // distance on a wide track) still distinguishes a deliberate push from the
  // sideways jitter of a stray touch, which is all this threshold has to do --
  // onMoveShouldSetPanResponder above already filters out vertical scrolls.
  const threshold = Math.min(maxX * 0.22, scale(42));
  const locked = disabled || busy;

  useEffect(() => {
    if (dragging || locked || !maxX) {
      shimmer.stopAnimation();
      shimmer.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(shimmer, {toValue: 1, duration: 900, useNativeDriver: true}),
        Animated.timing(shimmer, {toValue: 0, duration: 0, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dragging, locked, maxX, shimmer]);

  useEffect(() => {
    if (dragging || locked || !maxX) {
      hint.stopAnimation();
      hint.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hint, {toValue: 1, duration: 620, useNativeDriver: true}),
        Animated.timing(hint, {toValue: 0, duration: 620, useNativeDriver: true}),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dragging, locked, maxX, hint]);

  // Flicker runs ONLY while a flame is actually on screen -- idle has no fire at
  // all, which is what keeps the resting control looking clean rather than busy.
  // Deliberately prime-ish, non-multiple durations per tongue so the three never
  // resynchronise into a single visible pulse.
  useEffect(() => {
    if (!dragging) {
      flickers.forEach((f) => f.stopAnimation());
      return undefined;
    }
    const timings = [
      [0.55, 1, 90, 130],
      [0.4, 0.95, 150, 110],
      [0.7, 1, 70, 170],
    ];
    const loops = flickers.map((f, i) => {
      const [lo, hi, up, down] = timings[i];
      return Animated.loop(
        Animated.sequence([
          Animated.timing(f, {toValue: hi, duration: up, useNativeDriver: false}),
          Animated.timing(f, {toValue: lo, duration: down, useNativeDriver: false}),
        ]),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dragging, flickers]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: (_e, g) =>
          !locked && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          setDragging(true);
          firedRef.current = false;
          Animated.spring(press, {toValue: 1, friction: 5, tension: 120, useNativeDriver: true}).start();
        },
        onPanResponderMove: (_e, g) => {
          if (locked) return;
          const clamped = Math.min(Math.max(0, g.dx), maxX);
          x.setValue(clamped);
          fillX.setValue(clamped);
        },
        onPanResponderRelease: (_e, g) => {
          setDragging(false);
          Animated.spring(press, {toValue: 0, friction: 5, tension: 120, useNativeDriver: true}).start();
          const travelled = Math.min(Math.max(0, g.dx), maxX);
          if (travelled >= threshold && !firedRef.current) {
            firedRef.current = true;
            if (Vibration?.vibrate) Vibration.vibrate(35);
            // A touch of spring overshoot so completion reads as a deliberate,
            // satisfying "clunk" into place, then morph to a checkmark and wash
            // the track in success colour before onConfirm's work starts.
            Animated.parallel([
              Animated.spring(x, {toValue: maxX, friction: 7, tension: 160, useNativeDriver: true}),
              Animated.spring(fillX, {toValue: maxX, friction: 7, tension: 160, useNativeDriver: false}),
            ]).start(() => {
              setShowCheck(true);
              Animated.timing(success, {toValue: 1, duration: 260, useNativeDriver: false}).start();
              if (onConfirm) onConfirm();
            });
          } else {
            Animated.parallel([
              Animated.spring(x, {toValue: 0, friction: 5, tension: 140, useNativeDriver: true}),
              Animated.spring(fillX, {toValue: 0, friction: 5, tension: 140, useNativeDriver: false}),
            ]).start();
          }
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(press, {toValue: 0, friction: 5, tension: 120, useNativeDriver: true}).start();
          Animated.parallel([
            Animated.spring(x, {toValue: 0, friction: 5, tension: 140, useNativeDriver: true}),
            Animated.spring(fillX, {toValue: 0, friction: 5, tension: 140, useNativeDriver: false}),
          ]).start();
        },
      }),
    [locked, maxX, threshold, onConfirm, x, fillX, press, success],
  );

  // Reset to the left whenever the control goes idle again, so a failed purchase
  // leaves a control the customer can actually use a second time.
  useEffect(() => {
    if (!busy) {
      firedRef.current = false;
      setShowCheck(false);
      success.setValue(0);
      Animated.timing(x, {toValue: 0, duration: 150, useNativeDriver: true}).start();
      Animated.timing(fillX, {toValue: 0, duration: 150, useNativeDriver: false}).start();
    }
  }, [busy, x, fillX, success]);

  const hintShift = hint.interpolate({inputRange: [0, 1], outputRange: [0, scale(6)]});
  const labelOpacity = maxX
    ? x.interpolate({inputRange: [0, maxX * 0.55], outputRange: [1, 0], extrapolate: 'clamp'})
    : 1;
  const knobScale = press.interpolate({inputRange: [0, 1], outputRange: [1, 1.08]});
  const knobLift = press.interpolate({inputRange: [0, 1], outputRange: [0, -5]});
  const trackWash = success.interpolate({inputRange: [0, 1], outputRange: ['rgba(30,122,60,0)', 'rgba(30,122,60,0.92)']});
  // The shimmer sweeps the full track width plus its own width, so it travels
  // fully off-screen on both ends rather than popping in/out at the edges.
  const shimmerW = Math.max(trackW * 0.22, scale(40));
  const shimmerX = shimmer.interpolate({inputRange: [0, 1], outputRange: [-shimmerW, trackW]});
  // Flame length: a fixed, believable trail rather than fire filling the whole
  // swiped distance -- a comet's tail doesn't grow forever behind it.
  //
  // inputRange must be strictly non-decreasing. `maxX` is 0 until onLayout fires
  // (first paint, before the track has measured its width), and on a narrow
  // track it can end up smaller than FLAME_LEN too -- either way putting the raw
  // FLAME_LEN before a smaller maxX in the same range throws "inputRange must be
  // monotonically non-decreasing". safeMax/flameLen below guarantee
  // 0 <= flameLen <= safeMax in every case, including a 2-point range when the
  // track is too narrow to tell FLAME_LEN and safeMax apart.
  const FLAME_LEN = scale(58);
  const safeMax = Math.max(maxX, 1);
  const flameLen = Math.min(FLAME_LEN, safeMax);
  const flameW = fillX.interpolate(
    flameLen < safeMax
      ? {inputRange: [0, flameLen, safeMax], outputRange: [0, flameLen, flameLen], extrapolate: 'clamp'}
      : {inputRange: [0, safeMax], outputRange: [0, flameLen], extrapolate: 'clamp'},
  );
  // Fades the whole flame in over the first few pixels of drag, so fire does not
  // pop into existence fully-formed the instant a finger lands on the knob.
  const flameFade = fillX.interpolate({
    inputRange: [0, 10, 30],
    outputRange: [0, 0.35, 1],
    extrapolate: 'clamp',
  });
  // The flame sits directly behind the knob's trailing edge and grows leftward
  // from there -- "streaming backward" relative to the direction of travel.
  const flameRight = Animated.add(fillX, new Animated.Value(KNOB + PAD));
  const flameLeft = Animated.subtract(flameRight, flameW);
  // Per-tongue: opacity is fade * that tongue's own flicker, and each tongue is
  // squashed/stretched vertically by its flicker too, which is what produces the
  // licking motion rather than a shape that merely brightens and dims.
  const tongueProps = FLAME_TONGUES.map((t, i) => ({
    ...t,
    opacity: Animated.multiply(flameFade, flickers[i]),
    scaleY: flickers[i].interpolate({inputRange: [0, 1], outputRange: [0.62, 1.12]}),
  }));
  // The tongue paths are authored in a 100 x 52 box. Map that box onto the real
  // trail: X stretches to however long the trail currently is, Y maps 52 onto the
  // track's actual height. Scaling X and Y separately matters -- a single uniform
  // scale would squash the flame vertically as the trail grows.
  const FLAME_BOX_W = 100;
  const FLAME_BOX_H = 52;
  const flameScaleX = Animated.divide(flameW, FLAME_BOX_W);
  const flameScaleY = TRACK_H / FLAME_BOX_H;

  return (
    <View
      style={[styles.track, locked && styles.trackDisabled]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      {trackW > 0 && (
        <Svg width={trackW} height={TRACK_H} style={StyleSheet.absoluteFill}>
          <Defs>
            {/* Progress fill -- warm gold, flush with the track's left edge and
                ending exactly at the knob. At rest fillX is 0, so this paints
                nothing: no stray ring around the idle knob. */}
            <LinearGradient id="fillGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#D99A3B" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#FFD86B" stopOpacity="0.85" />
            </LinearGradient>
            {/* Flame tongues: each fades out towards its TIP (left, x1->x2 runs
                tip-to-body) so the fire dissolves into the track instead of
                ending on a hard edge. Outer red, mid orange, inner yellow. */}
            <LinearGradient id="flameOuter" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FF3D00" stopOpacity="0" />
              <Stop offset="0.55" stopColor="#FF4E11" stopOpacity="0.75" />
              <Stop offset="1" stopColor="#E02200" stopOpacity="0.95" />
            </LinearGradient>
            <LinearGradient id="flameMid" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FF9800" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FF8A1E" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#FF6D00" stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="flameCore" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFF59D" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FFD54F" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#FFC107" stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.22" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <AnimatedRect x={0} y={0} width={fillX} height={TRACK_H} fill="url(#fillGrad)" />

          {!busy && !showCheck && (
            // Each tongue is drawn in its own 100x52 space and then translated to
            // sit behind the knob. scale maps that space onto the real trail
            // length; scaleY is the per-tongue flicker, anchored at the track's
            // vertical centre via `origin` so it licks from the middle outward
            // rather than growing downwards off the track.
            <AnimatedG x={flameLeft} scaleX={flameScaleX} scaleY={flameScaleY}>
              {tongueProps.map((t, i) => (
                <AnimatedG
                  key={i}
                  scaleY={t.scaleY}
                  originY={FLAME_BOX_H / 2}
                  opacity={t.opacity}>
                  <Path d={t.d} fill={t.fill} />
                </AnimatedG>
              ))}
            </AnimatedG>
          )}

          <AnimatedRect x={shimmerX} y={0} width={shimmerW} height={TRACK_H} fill="url(#shimmerGrad)" />
        </Svg>
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {backgroundColor: trackWash}]} />

      <Animated.Text style={[styles.label, {opacity: labelOpacity}]} numberOfLines={1}>
        {busy ? confirmingLabel || label : label}
      </Animated.Text>

      <Animated.View
        style={[
          styles.knob,
          {width: KNOB, height: KNOB, borderRadius: KNOB / 2, left: PAD},
          {
            transform: [{translateX: x}, {translateY: knobLift}, {scale: knobScale}],
            // `elevation` deliberately NOT animated: it is not a transform/opacity
            // property, and `press` is driven with useNativeDriver -- mixing a
            // native-driven value into elevation throws the same native-animated-
            // module error width would. A plain state-driven jump is fine here;
            // drag starts are instantaneous anyway.
            elevation: dragging ? 7 : 3,
          },
        ]}
        {...responder.panHandlers}>
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
        ) : showCheck ? (
          <MaterialIcons name="check" size={moderateScale(24)} color="#1E7A3C" />
        ) : (
          <Animated.View style={{transform: [{translateX: hintShift}]}}>
            <MaterialIcons name="double-arrow" size={moderateScale(22)} color={COLORS.AstroMaroon} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: verticalScale(52),
    borderRadius: verticalScale(26),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackDisabled: {opacity: 0.5},
  label: {
    textAlign: 'center',
    color: '#fff',
    fontSize: moderateScale(14.5),
    fontFamily: 'Lato-Bold',
    // Asymmetric on purpose: symmetric padding centres the text across the FULL
    // track, but the knob sits solidly on the left and visually eats into that
    // space, so a numerically-centred label still read as shifted left.
    // Derived, not eyeballed: for the text's own centred box to land in the
    // middle of the space AFTER the knob (knob's right edge -> track's right
    // edge), paddingLeft must exceed paddingRight by exactly KNOB + PAD (the
    // knob's full footprint). KNOB=46, PAD=4 -> paddingLeft = paddingRight + 50.
    paddingLeft: scale(70),
    paddingRight: scale(20),
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
