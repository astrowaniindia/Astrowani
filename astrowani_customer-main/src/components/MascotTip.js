// The guide mascot: the Astrowani avatar with a speech bubble, optional action
// buttons, a close button, and (for skippable tips) a "turn tips off" link.
//
// Purely presentational — WHEN a tip shows, and its text, come from
// utils/mascotTips.js. `tone`:
//   'light' — white bubble, for cream / white screens (Home, Wallet)
//   'dark'  — translucent bubble, for the brown popups (waiting for astrologer)
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const AVATAR_ASPECT = 145 / 281;

export default function MascotTip({
  text,
  actions = [], // [{ label, onPress, primary }]
  onClose,
  onTurnOff,
  turnOffLabel,
  tone = 'light',
  avatarWidth = scale(44),
  style,
}) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const dark = tone === 'dark';
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={[styles.row, { opacity: enter, transform: [{ translateY }] }, style]}>
      <Image
        source={require('../assets/images/guideAvatarLogin.png')}
        style={{ width: avatarWidth, aspectRatio: AVATAR_ASPECT }}
        resizeMode="contain"
      />
      <View style={[styles.bubble, dark ? styles.bubbleDark : styles.bubbleLight]}>
        <View style={[styles.tail, dark ? styles.tailDark : styles.tailLight]} />
        {onClose ? (
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close tip">
            <MaterialIcons name="close" size={moderateScale(16)} color={dark ? COLORS.AstroSoftOrange : '#9b8f8a'} />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.text, dark ? styles.textDark : styles.textLight, onClose && styles.textWithClose]}>
          {text}
        </Text>

        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={`${a.label}-${i}`}
                onPress={a.onPress}
                activeOpacity={0.85}
                style={[
                  styles.actionBtn,
                  a.primary !== false
                    ? (dark ? styles.actionPrimaryDark : styles.actionPrimaryLight)
                    : (dark ? styles.actionSecondaryDark : styles.actionSecondaryLight),
                ]}>
                <Text
                  style={[
                    styles.actionText,
                    a.primary !== false
                      ? (dark ? styles.actionTextPrimaryDark : styles.actionTextPrimaryLight)
                      : (dark ? styles.actionTextSecondaryDark : styles.actionTextSecondaryLight),
                  ]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {onTurnOff && turnOffLabel ? (
          <TouchableOpacity onPress={onTurnOff} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={[styles.turnOff, dark && styles.turnOffDark]}>{turnOffLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  bubble: {
    flex: 1,
    marginLeft: scale(10),
    marginBottom: verticalScale(10),
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(12),
  },
  bubbleLight: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ecd9cf',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  bubbleDark: {
    backgroundColor: 'rgba(255,248,238,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
  },
  // Points back at the avatar from the bubble's lower-left corner.
  tail: {
    position: 'absolute',
    left: -scale(7),
    bottom: verticalScale(14),
    width: 0,
    height: 0,
    borderTopWidth: scale(6),
    borderBottomWidth: scale(6),
    borderRightWidth: scale(7),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  tailLight: { borderRightColor: '#fff' },
  tailDark: { borderRightColor: 'rgba(255,248,238,0.12)' },
  close: { position: 'absolute', top: verticalScale(6), right: scale(6), zIndex: 2 },
  text: { fontSize: moderateScale(13.5), lineHeight: moderateScale(19.5) },
  textWithClose: { paddingRight: scale(16) },
  textLight: { color: '#3d2b22' },
  textDark: { color: '#FFF8EE' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: verticalScale(10) },
  actionBtn: {
    borderRadius: moderateScale(18),
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(14),
    marginRight: scale(8),
    marginTop: verticalScale(2),
  },
  actionPrimaryLight: { backgroundColor: COLORS.AstroMaroon },
  actionSecondaryLight: { borderWidth: 1, borderColor: COLORS.AstroMaroon },
  actionPrimaryDark: { backgroundColor: COLORS.AstroGold },
  actionSecondaryDark: { borderWidth: 1, borderColor: COLORS.AstroSoftOrange },
  actionText: { fontSize: moderateScale(13), fontWeight: '700' },
  actionTextPrimaryLight: { color: '#fff' },
  actionTextSecondaryLight: { color: COLORS.AstroMaroon },
  actionTextPrimaryDark: { color: COLORS.AstroMaroon },
  actionTextSecondaryDark: { color: COLORS.AstroSoftOrange },
  turnOff: {
    marginTop: verticalScale(8),
    fontSize: moderateScale(11.5),
    color: '#9b8f8a',
    textDecorationLine: 'underline',
  },
  turnOffDark: { color: COLORS.AstroSoftOrange },
});
