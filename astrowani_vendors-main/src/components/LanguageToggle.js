// Small floating EN/HI toggle for screens that don't have CustomHeader (pre-login:
// Login, VerifyOtp; and full-screen surfaces: GoLiveScreen). Tapping cycles directly
// between the two languages — no modal, since there are only ever two choices.
import React, { useContext } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { LanguageContext } from '../context/LanguageContext';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

export default function LanguageToggle({ style, dark = false }) {
  const { language, changeLanguage } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        dark ? styles.btnDark : styles.btnLight,
        { top: insets.top + verticalScale(10) },
        style,
      ]}
      activeOpacity={0.8}
      onPress={() => changeLanguage(language === 'English' ? 'Hindi' : 'English')}>
      <MaterialCommunityIcons name="translate" size={16} color={dark ? '#fff' : COLORS.AstroMaroon} />
      <Text style={[styles.text, dark && styles.textDark]}>{language === 'English' ? 'हिं' : 'EN'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    zIndex: 20,
    elevation: 6,
  },
  btnLight: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  btnDark: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  text: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: COLORS.AstroMaroon,
  },
  textDark: {
    color: '#fff',
  },
});
