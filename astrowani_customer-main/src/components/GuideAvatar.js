// Floating animated "guide" astrologer avatar with a speech-bubble hint,
// used to nudge new users toward the next action on a given screen.
// By default shows once per `storageKey` (see utils/onboardingFlags.js),
// then stays dismissed on that device (dismissible via a close button).
// Pass `alwaysShow` to instead show it every time the screen mounts, with
// no close button and no persistence — for screens where the hint should
// never be permanently dismissable (e.g. login). Mount directly on a
// screen, absolutely positioned over the existing layout.
//
//   <GuideAvatar
//     storageKey="login"
//     message="First time here? Tap Register to sign up!"
//     alwaysShow
//   />
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Image } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { hasSeenGuideHint, markGuideHintSeen } from '../utils/onboardingFlags';

const GuideAvatar = ({ storageKey, message, position = 'right', bottomOffset, alwaysShow = false, avatarSize, offsetX = 0, avatarOffsetY = 0, boxOffsetY = 0, layout = 'stack', onPress }) => {
  const [visible, setVisible] = useState(alwaysShow);
  const [checked, setChecked] = useState(alwaysShow);
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const bounceLoopRef = useRef(null);

  useEffect(() => {
    if (alwaysShow) return undefined;
    let mounted = true;
    (async () => {
      const seen = await hasSeenGuideHint(storageKey);
      if (mounted && !seen) setVisible(true);
      if (mounted) setChecked(true);
    })();
    return () => { mounted = false; };
  }, [storageKey, alwaysShow]);

  useEffect(() => {
    if (!visible) return undefined;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0, duration: 350, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    bounceLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    bounceLoopRef.current.start();

    return () => bounceLoopRef.current?.stop();
  }, [visible, slideAnim, fadeAnim, bounceAnim]);

  const dismiss = () => {
    if (alwaysShow) return;
    bounceLoopRef.current?.stop();
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 40, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
    markGuideHintSeen(storageKey);
  };

  if (!checked || !visible) return null;

  const isRow = layout === 'row';
  const handlePress = onPress || (alwaysShow ? undefined : dismiss);
  const BubbleWrapper = handlePress ? TouchableOpacity : View;
  const bubbleWrapperProps = handlePress ? { activeOpacity: 0.9, onPress: handlePress } : {};

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        isRow && styles.rowContainer,
        position === 'left' ? styles.left : position === 'center' ? styles.center : styles.right,
        bottomOffset != null && { bottom: bottomOffset },
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { translateX: offsetX }] },
      ]}>
      {isRow && (
        <TouchableOpacity activeOpacity={handlePress ? 0.8 : 1} disabled={!handlePress} onPress={handlePress}>
          <Animated.Image
            source={require('../assets/images/guideAvatarLogin.png')}
            style={[
              styles.avatar,
              avatarSize != null && { width: avatarSize, height: avatarSize },
              { transform: [{ translateY: Animated.add(bounceAnim, avatarOffsetY) }] },
            ]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}

      <BubbleWrapper
        {...bubbleWrapperProps}
        style={[isRow ? styles.bubbleSquare : styles.bubble, boxOffsetY !== 0 && { transform: [{ translateY: boxOffsetY }] }]}>
        <Text style={styles.bubbleText}>{message}</Text>
        <View style={isRow ? styles.bubbleTailLeft : styles.bubbleTail} />
      </BubbleWrapper>

      {!isRow && (
        <TouchableOpacity activeOpacity={handlePress ? 0.8 : 1} disabled={!handlePress} onPress={handlePress}>
          <Animated.Image
            source={require('../assets/images/guideAvatarLogin.png')}
            style={[
              styles.avatar,
              avatarSize != null && { width: avatarSize, height: avatarSize },
              { transform: [{ translateY: Animated.add(bounceAnim, avatarOffsetY) }] },
            ]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}

      {!alwaysShow && (
        <TouchableOpacity activeOpacity={0.85} onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={moderateScale(13)} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

export default GuideAvatar;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: verticalScale(30),
    alignItems: 'center',
    zIndex: 999,
  },
  left: { left: scale(15) },
  right: { right: scale(15) },
  center: { left: 0, right: 0 },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: scale(90),
    height: scale(90),
  },
  bubble: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(14),
    maxWidth: scale(190),
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  bubbleSquare: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(14),
    maxWidth: scale(170),
    marginLeft: scale(-4),
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  bubbleText: {
    fontSize: moderateScale(12.5),
    color: COLORS.textDark,
    fontWeight: '600',
    textAlign: 'center',
  },
  bubbleTail: {
    position: 'absolute',
    bottom: verticalScale(-8),
    left: '50%',
    marginLeft: scale(-6),
    width: 0,
    height: 0,
    borderLeftWidth: scale(6),
    borderRightWidth: scale(6),
    borderTopWidth: scale(8),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: COLORS.white,
  },
  bubbleTailLeft: {
    position: 'absolute',
    left: verticalScale(-8),
    top: '50%',
    marginTop: scale(-6),
    width: 0,
    height: 0,
    borderTopWidth: scale(6),
    borderBottomWidth: scale(6),
    borderRightWidth: verticalScale(8),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: COLORS.white,
  },
  closeBtn: {
    position: 'absolute',
    top: verticalScale(-6),
    right: scale(-6),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: scale(10),
    width: scale(20),
    height: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
