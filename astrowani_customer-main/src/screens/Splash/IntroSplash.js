// Post-cold-start intro animation ("Rise & Settle") — shown by App.js while the
// AsyncStorage token bootstrap runs, in place of the old plain ActivityIndicator.
// Timeline is a 1:1 port of the confirmed web preview so the shipped animation
// matches exactly: pop past 100% scale, settle back to 100%, hold, fade out.
// App.js guarantees the full TOTAL_DURATION plays even if the bootstrap check
// finishes first — see the `isLoading || !introDone` gate there.
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const STAR_LOGO = require('../../assets/images/brandStarLogo.png');

const POP_DURATION = 500;
const SETTLE_DURATION = 250;
const HOLD_DURATION = 1500;
const FADE_OUT_DURATION = 400;
export const INTRO_DURATION_MS = POP_DURATION + SETTLE_DURATION + HOLD_DURATION + FADE_OUT_DURATION;

export default function IntroSplash({ onFinish }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.68);
  const translateY = useSharedValue(16);

  const textOpacity = useSharedValue(0);
  const textScale = useSharedValue(0.8);
  const textTranslateY = useSharedValue(16);

  const screenOpacity = useSharedValue(1);

  useEffect(() => {
    const easeOut = Easing.out(Easing.cubic);

    opacity.value = withTiming(1, { duration: POP_DURATION, easing: easeOut });
    scale.value = withSequence(
      withTiming(1.04, { duration: POP_DURATION, easing: easeOut }),
      withTiming(1, { duration: SETTLE_DURATION, easing: Easing.out(Easing.quad) }),
    );
    translateY.value = withTiming(0, { duration: POP_DURATION, easing: easeOut });

    // Text pops and settles on the exact same timeline as the logo, so the two
    // always land together instead of the text just sitting there fading in.
    textOpacity.value = withTiming(1, { duration: POP_DURATION, easing: easeOut });
    textScale.value = withSequence(
      withTiming(1.03, { duration: POP_DURATION, easing: easeOut }),
      withTiming(1, { duration: SETTLE_DURATION, easing: Easing.out(Easing.quad) }),
    );
    textTranslateY.value = withTiming(0, { duration: POP_DURATION, easing: easeOut });

    const fadeOutTimer = setTimeout(() => {
      screenOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished && onFinish) runOnJS(onFinish)();
        },
      );
    }, POP_DURATION + SETTLE_DURATION + HOLD_DURATION);

    return () => clearTimeout(fadeOutTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ scale: textScale.value }, { translateY: textTranslateY.value }],
  }));
  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));

  return (
    <Animated.View style={[styles.container, screenStyle]}>
      <Animated.Image source={STAR_LOGO} style={[styles.logo, logoStyle]} resizeMode="contain" />
      <Animated.Text style={[styles.brand, textStyle]}>ASTROWANI</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Matches values/colors.xml's splash_background and the launcher icon's
    // plate, so the native splash hands over to this animation with no colour
    // flash. Hardcoded rather than COLORS.AstroMaroon to keep this screen free
    // of imports that run before the app has bootstrapped.
    backgroundColor: '#592a19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 140,
    height: 140,
  },
  brand: {
    marginTop: 22,
    fontSize: 13,
    letterSpacing: 6,
    color: 'rgba(245,236,221,0.7)',
    fontFamily: 'Lato-Bold',
  },
});
