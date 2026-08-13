import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { COLORS } from '../Theme/Colors';

// Admin-assigned badge shown on astrologer cards/profile — set from
// astrowani-admin's Astrologers page (astrologers.badge column), never
// self-assignable by the astrologer. See CLAUDE.md "Astrologer Badges".
const BADGE_CONFIG = {
  verified: { label: 'Verified', icon: 'verified', bg: '#1D5FA8', fg: '#fff' },
  celebrity: { label: 'Celebrity', icon: 'star', bg: COLORS.AstroMaroon, fg: COLORS.AstroGold },
  top_rated: { label: 'Top Rated', icon: 'grade', bg: '#1E6B45', fg: '#fff' },
};

// variant 'corner': a thin diagonal ribbon clipped to only the extreme
// top-left corner of the avatar — the clip window is a fraction of the
// avatar's own size (not the full circle), and the band itself is thin,
// so it reads as a small corner tag instead of a sash across the face.
// Pass the avatar's own diameter as `size` so it scales with it.
// variant 'inline': a plain pill for text rows.
export default function AstrologerBadge({ type, variant = 'corner', size }) {
  const config = BADGE_CONFIG[type];
  if (!config) return null;

  if (variant === 'inline') {
    return (
      <View style={[styles.inline, { backgroundColor: config.bg }]}>
        <MaterialIcons name={config.icon} size={moderateScale(11)} color={config.fg} />
        <Text style={[styles.inlineText, { color: config.fg }]}>{config.label}</Text>
      </View>
    );
  }

  const avatarSize = size || scale(70);
  const clip = avatarSize * 0.56;
  return (
    <View style={[styles.ribbonBox, { width: clip, height: clip }]} pointerEvents="none">
      <View
        style={[
          styles.ribbonStrip,
          {
            backgroundColor: config.bg,
            width: clip * 1.6,
            paddingVertical: clip * 0.015,
            top: clip * 0.3,
            left: -clip * 0.35,
          },
        ]}
      >
        <Text style={[styles.ribbonText, { color: config.fg, fontSize: clip * 0.2 }]} numberOfLines={1}>
          {config.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbonBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    zIndex: 5,
  },
  ribbonStrip: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1,
  },
  ribbonText: {
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    letterSpacing: 0.1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(4),
    marginLeft: scale(6),
  },
  inlineText: {
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    fontSize: moderateScale(10),
    marginLeft: scale(3),
    letterSpacing: 0.2,
  },
});
