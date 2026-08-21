// The − qty + control. Shared by the product card (where it replaces the ADD button once
// something is in the cart) and by the cart screen's line items, so the two can never
// drift apart visually or behaviourally.
//
// Decrementing at qty 1 removes the line — that is what makes a card's stepper collapse
// back to ADD, so the caller must not special-case it.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { MAX_QTY_PER_ITEM } from '../../context/CartContext';

const QtyStepper = ({ qty, onIncrement, onDecrement, size = 'md' }) => {
  const s = size === 'sm' ? small : medium;
  const atMax = qty >= MAX_QTY_PER_ITEM;

  return (
    <View style={[styles.wrap, s.wrap]}>
      <TouchableOpacity
        style={[styles.btn, s.btn]}
        onPress={onDecrement}
        // A 36px control is below the 44px comfortable touch target, so the tappable area
        // is expanded outward rather than the button being drawn bigger.
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        accessibilityLabel="Decrease quantity">
        <Text style={[styles.sign, s.sign]}>−</Text>
      </TouchableOpacity>

      <Text style={[styles.qty, s.qty]}>{qty}</Text>

      <TouchableOpacity
        style={[styles.btn, s.btn, atMax && styles.btnDisabled]}
        onPress={atMax ? undefined : onIncrement}
        disabled={atMax}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        accessibilityLabel="Increase quantity">
        <Text style={[styles.sign, s.sign, atMax && styles.signDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(8),
    overflow: 'hidden',
  },
  btn: { alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.4 },
  sign: { color: COLORS.white, fontFamily: 'Lato-Bold', includeFontPadding: false },
  signDisabled: { color: '#e8d5cc' },
  qty: { color: COLORS.white, fontFamily: 'Lato-Bold', includeFontPadding: false },
});

const medium = StyleSheet.create({
  wrap: { height: verticalScale(32), paddingHorizontal: scale(4) },
  btn: { width: scale(30), height: '100%' },
  sign: { fontSize: moderateScale(18) },
  qty: { fontSize: moderateScale(14), minWidth: scale(18), textAlign: 'center' },
});

const small = StyleSheet.create({
  wrap: { height: verticalScale(28), paddingHorizontal: scale(2) },
  btn: { width: scale(26), height: '100%' },
  sign: { fontSize: moderateScale(16) },
  qty: { fontSize: moderateScale(13), minWidth: scale(16), textAlign: 'center' },
});

export default QtyStepper;
