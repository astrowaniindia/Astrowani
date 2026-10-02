// Stage 2 of the cold-start sequence, shown only when the app behind still isn't
// drawn once the brand animation (IntroSplash) has finished.
//
// WHY A SECOND SCREEN. The same brown with the logo sitting on it for five seconds
// reads as a frozen app. Handing over to the guide avatar with a line that changes
// reads as progress, even though the wait is identical (owner's call, 2026-10-02).
//
// WHEN IT IS SKIPPED ENTIRELY. If Home already has its data — the normal case once
// utils/homePreload.js has cached a previous visit — the app is ready before stage 1
// even ends and this never mounts. It is the first-run / cold-cache screen, not a
// fixed part of every launch.
//
// Same brown as IntroSplash, values/colors.xml and AppTheme's windowBackground, so
// the handover is invisible: only the contents change, never the background.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const GUIDE_AVATAR = require('../../assets/images/guideAvatarLogin.png');

// English only, like IntroSplash: this screen deliberately imports nothing that
// runs before the app has bootstrapped, which includes the language context.
const MESSAGES = ['Your stars are aligning…', 'Your destiny is being written…'];
const MESSAGE_INTERVAL = 1600;

export default function PreparingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  // Visible from the first frame — NO opacity fade-in. This screen takes over from
  // IntroSplash on the identical brown, so there is nothing to fade in from, and an
  // entrance animation here only risks the contents being stuck invisible if it
  // doesn't run (which is exactly what happened on 2026-10-02).
  const avatarScale = useSharedValue(1);

  useEffect(() => {
    // Slow breathing scale — the one moving thing on screen, so the wait never
    // looks like a frozen frame even if the line hasn't changed yet.
    avatarScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    const timer = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, MESSAGE_INTERVAL);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.Image source={GUIDE_AVATAR} style={[styles.avatar, avatarStyle]} resizeMode="contain" />
      <View style={styles.textBlock}>
        <Text style={styles.message}>{MESSAGES[messageIndex]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#592a19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 150,
    height: 190,
  },
  textBlock: {
    marginTop: 28,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  message: {
    fontSize: 15,
    letterSpacing: 1,
    textAlign: 'center',
    color: '#F4D8BC',
    fontFamily: 'Lato-Regular',
  },
});
