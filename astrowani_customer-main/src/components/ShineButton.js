// A button that moves just enough to pull the eye: a slow "breathing" swell and a soft
// slanted sheen sweeping across it. No glow (it read as cheap). Used for the one tap a
// screen exists for: Get OTP on signup, and the free-call claim.
//
// Everything runs on the native driver and stops while `busy` is true.
// `children` may be a function receiving `{ nudgeX }` (an Animated value for a small
// forward nudge, e.g. on an arrow icon), or plain nodes.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import { scale, verticalScale } from '../utils/Scaling';

export default function ShineButton({ onPress, disabled = false, busy = false, style, children }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const nudge = useRef(new Animated.Value(0)).current;
  const [btnWidth, setBtnWidth] = useState(0);
  const still = busy || disabled;

  useEffect(() => {
    if (still) return undefined;
    const ease = Easing.inOut(Easing.quad);
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 900, easing: ease, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 900, easing: ease, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.delay(700),
        Animated.timing(sheen, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(900),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
        Animated.timing(nudge, { toValue: 0, duration: 450, easing: ease, useNativeDriver: true }),
        Animated.delay(400),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
      breathe.setValue(0);
      sheen.setValue(0);
      nudge.setValue(0);
    };
  }, [still, breathe, sheen, nudge]);

  const scaleAnim = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const sheenW = scale(46);
  const sheenX = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [-sheenW * 1.5, (btnWidth || scale(340)) + sheenW],
  });
  const nudgeX = nudge.interpolate({ inputRange: [0, 1], outputRange: [0, scale(6)] });

  return (
    <Animated.View style={{ alignSelf: 'stretch', transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.btn, style]}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={disabled || busy}
        onLayout={(e) => setBtnWidth(e.nativeEvent.layout.width)}>
        {!still && (
          // Three bands fading out from a bright centre. rotate, not skewX:
          // skewX is not applied on Android.
          <Animated.View
            pointerEvents="none"
            style={[styles.sheen, { width: sheenW, transform: [{ translateX: sheenX }, { rotate: '20deg' }] }]}>
            <View style={[styles.sheenBand, { opacity: 0.35 }]} />
            <View style={[styles.sheenBand, { opacity: 0.7, flex: 1.4 }]} />
            <View style={[styles.sheenBand, { opacity: 0.35 }]} />
          </Animated.View>
        )}
        {typeof children === 'function' ? children({ nudgeX }) : children}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden keeps the sheen inside the rounded button.
  btn: { overflow: 'hidden' },
  sheen: {
    position: 'absolute',
    top: -verticalScale(30),
    bottom: -verticalScale(30),
    left: 0,
    flexDirection: 'row',
  },
  sheenBand: { flex: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
});
