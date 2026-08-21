// The sticky "N items · ₹X — View Cart" bar that appears over the bottom of the shop grid
// as soon as anything is in the cart, and disappears when the cart empties.
//
// Shows the CACHED subtotal from CartContext, not a payable amount: it's a running tally so
// the customer knows the cart isn't empty. Every real figure comes from
// /api/orders/quote on the cart screen, which is also where delivery/handling are added —
// so this bar deliberately says "subtotal", never "total" or "to pay".

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const CartBar = ({ count, totalUnits, subtotal, onPress, label = 'View Cart', itemWord = 'item', itemsWord = 'items' }) => {
  if (!count) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <TouchableOpacity style={styles.bar} activeOpacity={0.9} onPress={onPress}>
        <View style={styles.left}>
          <Icon name="shopping-cart" size={moderateScale(20)} color={COLORS.white} />
          <View style={styles.textCol}>
            <Text style={styles.count}>
              {totalUnits} {totalUnits === 1 ? itemWord : itemsWord}
            </Text>
            <Text style={styles.subtotal}>₹{subtotal}</Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.cta}>{label}</Text>
          <Icon name="chevron-right" size={moderateScale(22)} color={COLORS.white} />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  left: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  textCol: { marginLeft: scale(10) },
  count: { color: '#f0dcc9', fontSize: moderateScale(11), fontFamily: 'Lato-Regular' },
  subtotal: { color: COLORS.white, fontSize: moderateScale(15), fontFamily: 'Lato-Bold' },
  right: { flexDirection: 'row', alignItems: 'center' },
  cta: { color: COLORS.white, fontSize: moderateScale(14), fontFamily: 'Lato-Bold' },
});

export default CartBar;
