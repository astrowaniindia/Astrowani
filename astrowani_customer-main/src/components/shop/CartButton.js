// The cart icon + live count for use in any screen header.
//
// One shared component rather than inline JSX per header: it was duplicated in
// Navigation.js's `options`, which meant the icon, badge offset and tap target had to be
// kept in sync by hand across every screen that shows it.
//
// Resolves its own navigation via useNavigation(), so it can be dropped into a `header`
// component (like routes/CustomHeader.js) that receives no navigation prop.
//
// The icon is ALWAYS shown; only the count badge is conditional. On a landing screen like
// Remedies ("Services") a cart that appears and disappears is hard to find on purpose, and
// tapping an empty one is not a dead end — CartScreen has a real empty state with a
// "Start shopping" action.
//
// LAYOUT RULE — do not "simplify" this back to a bare icon with a negatively-offset badge,
// and do not rely on padding to make room for one. React Navigation's native-stack
// `headerRight` CLIPS anything its child draws outside its own box, while the app's own
// routes/CustomHeader.js does not. A badge placed at top/right: -Npx therefore looked
// correct on the Services header and was sliced down to a green wedge on the Gemstones
// header (both observed on device). What works is a FIXED box, deliberately larger than the
// icon, with the icon pinned bottom-left and the badge pinned top-right — the tuck-in
// overlap then happens INSIDE the box, leaving nothing out of bounds to clip.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale } from '../../utils/Scaling';
import { useCart } from '../../context/CartContext';
import { captureEvent } from '../../utils/Analytics';

const ICON_SIZE = moderateScale(24);
const BADGE = scale(16);

const CartButton = ({ color = COLORS.white, style }) => {
  const navigation = useNavigation();
  const cart = useCart();
  const count = cart.totalUnits;

  return (
    <TouchableOpacity
      style={[styles.box, style]}
      onPress={() => {
        captureEvent('cart_viewed', { from: 'header', lines: cart.count });
        navigation.navigate('Cart');
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Cart, ${count} item${count === 1 ? '' : 's'}`}
      // The box is only ~38x30; without this the tap target is under the 44px minimum.
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      {/* Ionicons' filled cart reads better than MaterialIcons' at header size — heavier
          strokes and a rounder basket, so it stays legible against the maroon. */}
      <View style={styles.iconSlot}>
        <Ionicons name="cart" color={color} size={ICON_SIZE} />
      </View>

      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1} allowFontScaling={false}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Fixed, and larger than the icon on purpose — see the LAYOUT RULE above.
  // Sized so the badge TUCKS INTO the cart's top-right corner rather than floating off
  // it: the box is only ~8px wider and ~4px taller than the icon, so pinning the icon
  // bottom-left and the badge top-right makes them overlap by roughly half the badge.
  // Any bigger and the two read as two separate elements.
  box: {
    width: scale(32),
    // Height is exactly the icon's height, NOT taller. The header row centres this box
    // vertically, so any extra height below the icon pushed the cart a couple of pixels
    // below the title's optical centre line and it read as misaligned with "Services" /
    // "Gemstones". At equal height the icon is centred, and the badge still fits inside
    // the box because it only occupies the top ~16px of it.
    height: ICON_SIZE,
    position: 'relative',
  },
  // Fills the box's height; the free width on the right is what the badge overlaps into.
  iconSlot: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(2),
    // A ring in the header colour keeps the badge visually separate from the icon it
    // overlaps, instead of the two merging into one smudge.
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: moderateScale(9),
    fontFamily: 'Lato-Bold',
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default CartButton;
