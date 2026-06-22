import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale } from '../utils/Scaling';

/**
 * Single source of truth for star display across the app.
 * Always renders 5 stars: the first round(rating) are filled yellow (AstroGold),
 * the rest are a brown (AstroMaroon) outline. A brand-new astrologer (rating 0)
 * therefore shows an empty 5-star brown outline — no fake/hardcoded stars anywhere.
 *
 * Props:
 *  - rating: number (0–5)
 *  - size: star icon size (default 14, moderate-scaled)
 *  - totalReviews: optional count; when showValue is on, renders "(N)" / "New"
 *  - showValue: when true, shows the numeric average + review count beside the stars
 */
const StarRating = ({ rating = 0, size = 14, totalReviews, showValue = false, style }) => {
  const value = Number(rating) || 0;
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  const iconSize = moderateScale(size);

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: 5 }).map((_, i) => (
        <MaterialIcons
          key={i}
          name={i < filled ? 'star' : 'star-border'}
          size={iconSize}
          color={i < filled ? COLORS.AstroGold : COLORS.AstroMaroon}
          style={styles.star}
        />
      ))}
      {showValue && (
        <Text style={[styles.valueText, { fontSize: iconSize * 0.85 }]}>
          {totalReviews === 0 || (totalReviews == null && value === 0)
            ? 'New'
            : `${value.toFixed(1)}${totalReviews != null ? ` (${totalReviews})` : ''}`}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { marginRight: moderateScale(1) },
  valueText: { marginLeft: moderateScale(4), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold' },
});

export default StarRating;
