import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';

// Admin-assigned badge shown on astrologer cards/profile — set from
// astrowani-admin's Astrologers page (astrologers.badge column), never
// self-assignable by the astrologer. See CLAUDE.md "Astrologer Badges".
const BADGE_CONFIG = {
  verified: { label: 'Verified', icon: 'verified', color: '#1DA1F2' },
  celebrity: { label: 'Celebrity', icon: 'star', color: COLORS.AstroGold },
  top_rated: { label: 'Top Rated', icon: 'grade', color: '#2E9E5B' },
};

// variant 'corner': small absolute-positioned tag meant to sit over the
// top-left of a circular avatar (parent must be position:'relative').
// variant 'inline': plain pill for use next to a name in a text row.
export default function AstrologerBadge({ type, variant = 'corner', size = 11 }) {
  const config = BADGE_CONFIG[type];
  if (!config) return null;

  return (
    <View style={[
      variant === 'corner' ? styles.corner : styles.inline,
      { backgroundColor: config.color },
    ]}>
      <MaterialIcons name={config.icon} size={moderateScale(size)} color="#fff" />
      <Text style={[styles.text, { fontSize: moderateScale(size - 1) }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    top: -verticalScale(4),
    left: -scale(4),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(10),
    zIndex: 5,
    elevation: 3,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(12),
    marginLeft: scale(6),
  },
  text: {
    color: '#fff',
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    marginLeft: scale(2),
  },
});
