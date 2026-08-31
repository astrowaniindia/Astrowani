// The floating gift box on Home, shown to a customer who is still eligible for
// the free 12-minute call but has closed the popup without booking.
//
// WHY IT EXISTS: the popup shows once. A customer who swipes past it would
// otherwise lose the offer with no way back to it, so this is the way back —
// not a second popup, which would be nagging.
//
// It disappears permanently the moment they book (Home stops rendering it), so
// it can never sit on screen advertising something already taken.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

const FreeCallGiftBubble = ({ visible, label, onPress }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    // A slow, small breath — enough to catch the eye on a scrolling screen
    // without behaving like an advert. Loops until the bubble unmounts.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!visible) return null;

  const scaleAnim = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
      />
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity style={styles.bubble} activeOpacity={0.85} onPress={onPress}>
          <MaterialIcons name="card-giftcard" size={moderateScale(24)} color={COLORS.AstroGold} />
        </TouchableOpacity>
      </Animated.View>
      {!!label && (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </View>
  );
};

const SIZE = scale(52);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: scale(14),
    // Clear of the bottom tab bar (verticalScale(70) in Navigation.js) so it
    // never covers a tab.
    bottom: verticalScale(86),
    alignItems: 'center',
    zIndex: 50,
  },
  ring: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.AstroMaroon,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  labelWrap: {
    marginTop: verticalScale(5),
    backgroundColor: '#FFF9F3',
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    maxWidth: scale(112),
    borderWidth: 1,
    borderColor: '#E9D9C9',
  },
  label: {
    fontSize: moderateScale(9.5),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default FreeCallGiftBubble;
