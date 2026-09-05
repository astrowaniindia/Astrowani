import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Animated, PanResponder, StyleSheet, ActivityIndicator} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

/**
 * Slide-to-confirm, in the shape people already know from food-delivery checkouts.
 *
 * Used where money leaves the wallet. A tap is easy to do by accident on a phone in
 * one hand; a deliberate drag across the width of the control is not, which is the
 * whole reason this pattern exists on payment screens.
 *
 * PanResponder + Animated rather than gesture-handler/reanimated: this is one
 * horizontal drag with no gesture composition, and the plain API keeps it working
 * inside a Modal without any provider in the tree above it.
 *
 * The knob's arrow keeps a small looping nudge to the right so the control reads as
 * draggable without a caption telling you so. It stops the moment a drag starts —
 * an idle hint that keeps moving under your thumb looks broken.
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
  const hint = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  // Latched so a slow finger cannot fire onConfirm twice on one drag.
  const firedRef = useRef(false);

  const KNOB = scale(46);
  const PAD = scale(4);
  const maxX = Math.max(0, trackW - KNOB - PAD * 2);
  // 75% across. Far enough that a stray sideways scroll never triggers it, close
  // enough that a normal swipe completes without a stretch.
  const threshold = maxX * 0.75;

  const locked = disabled || busy;

  // Idle nudge. Runs only while genuinely idle — not mid-drag, not while the
  // purchase is in flight, and not when the control is disabled.
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

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        // Claim only clearly-horizontal movement, so this can live inside a
        // ScrollView without stealing its vertical drags.
        onMoveShouldSetPanResponder: (_e, g) =>
          !locked && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          setDragging(true);
          firedRef.current = false;
        },
        onPanResponderMove: (_e, g) => {
          if (locked) return;
          x.setValue(Math.min(Math.max(0, g.dx), maxX));
        },
        onPanResponderRelease: (_e, g) => {
          setDragging(false);
          const travelled = Math.min(Math.max(0, g.dx), maxX);
          if (travelled >= threshold && !firedRef.current) {
            firedRef.current = true;
            // Snap to the end first so the control visibly completes rather than
            // springing back while the work starts behind it.
            Animated.timing(x, {toValue: maxX, duration: 110, useNativeDriver: true}).start(() => {
              if (onConfirm) onConfirm();
            });
          } else {
            Animated.spring(x, {toValue: 0, friction: 6, tension: 80, useNativeDriver: true}).start();
          }
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(x, {toValue: 0, friction: 6, tension: 80, useNativeDriver: true}).start();
        },
      }),
    [locked, maxX, threshold, onConfirm, x],
  );

  // Reset to the left whenever the control goes idle again, so a failed purchase
  // leaves a control the customer can actually use a second time.
  useEffect(() => {
    if (!busy) {
      firedRef.current = false;
      Animated.timing(x, {toValue: 0, duration: 150, useNativeDriver: true}).start();
    }
  }, [busy, x]);

  const hintShift = hint.interpolate({inputRange: [0, 1], outputRange: [0, scale(6)]});
  // The label fades out as the knob crosses it, so the two never overlap.
  const labelOpacity = maxX
    ? x.interpolate({inputRange: [0, maxX * 0.55], outputRange: [1, 0], extrapolate: 'clamp'})
    : 1;

  return (
    <View
      style={[styles.track, locked && styles.trackDisabled]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      <Animated.Text style={[styles.label, {opacity: labelOpacity}]} numberOfLines={1}>
        {busy ? confirmingLabel || label : label}
      </Animated.Text>

      <Animated.View
        style={[
          styles.knob,
          {width: KNOB, height: KNOB, borderRadius: KNOB / 2, left: PAD},
          {transform: [{translateX: x}]},
        ]}
        {...responder.panHandlers}>
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
        ) : (
          <Animated.View style={{transform: [{translateX: hintShift}]}}>
            <MaterialIcons
              name="double-arrow"
              size={moderateScale(22)}
              color={COLORS.AstroMaroon}
            />
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
    paddingHorizontal: scale(56),
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
