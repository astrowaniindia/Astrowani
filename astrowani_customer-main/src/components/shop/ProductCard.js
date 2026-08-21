// A remedy product card, in the shape people already know from every delivery app: image,
// unit, name, price with the struck-through MRP beside it, and an ADD button that turns
// into a − qty + stepper in place once the item is in the cart.
//
// Replaces the old RemedyShop card, whose only action was a full-width "Buy Now" that
// opened a name/phone/address form for one item at a time.
//
// The card is deliberately dumb: it owns no cart state and no gate logic. `qty` comes from
// CartContext and `blocked` from the screen's ordering-gate check, so the same card renders
// correctly on the shop grid and anywhere else it gets reused.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import QtyStepper from './QtyStepper';

const FALLBACK_IMAGE = 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg';

const ProductCard = ({
  item,
  title,
  qty = 0,
  soldOut = false,
  blocked = false,
  onPress,
  onAdd,
  onIncrement,
  onDecrement,
  addLabel = 'ADD',
  soldOutLabel = 'Sold out',
}) => {
  const price = Number(item.price) || 0;
  const mrp = Number(item.mrp) || 0;
  // Only a genuinely higher MRP is a discount. An admin who typed the same number in both
  // fields must not produce a "0% OFF" badge.
  const hasDiscount = mrp > price;
  const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.imageWrap}>
        <FastImage
          source={{ uri: item.image || FALLBACK_IMAGE }}
          style={styles.image}
          resizeMode={FastImage.resizeMode.cover}
        />
        {hasDiscount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discountPct}%{'\n'}OFF</Text>
          </View>
        ) : null}
        {soldOut ? (
          <View style={styles.soldOutOverlay}>
            <Text style={styles.soldOutText}>{soldOutLabel}</Text>
          </View>
        ) : null}
      </View>

      {item.unitLabel ? <Text style={styles.unit}>{item.unitLabel}</Text> : null}

      <Text style={styles.title} numberOfLines={2}>{title}</Text>

      <View style={styles.bottomRow}>
        <View style={styles.priceCol}>
          <Text style={styles.price}>₹{price}</Text>
          {hasDiscount ? <Text style={styles.mrp}>₹{mrp}</Text> : null}
        </View>

        <View style={styles.actionCol}>
          {soldOut ? (
            <View style={[styles.addBtn, styles.addBtnDisabled]}>
              <Text style={[styles.addBtnText, styles.addBtnTextDisabled]}>—</Text>
            </View>
          ) : qty > 0 && !blocked ? (
            <QtyStepper qty={qty} onIncrement={onIncrement} onDecrement={onDecrement} size="sm" />
          ) : (
            // A blocked category still shows a normal ADD: tapping it is how the customer
            // gets told we aren't delivering this yet. Greying it out would leave them with
            // no way to find out why.
            <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
              <Text style={styles.addBtnText}>{addLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(12),
    padding: scale(8),
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
  },
  imageWrap: { position: 'relative' },
  image: {
    width: '100%',
    height: verticalScale(120),
    borderRadius: moderateScale(8),
    backgroundColor: '#f0f0f0',
  },
  discountBadge: {
    position: 'absolute',
    top: 0,
    left: scale(4),
    backgroundColor: '#2E7D32',
    borderBottomLeftRadius: moderateScale(6),
    borderBottomRightRadius: moderateScale(6),
    paddingHorizontal: scale(5),
    paddingVertical: verticalScale(2),
  },
  discountText: {
    color: COLORS.white,
    fontSize: moderateScale(9),
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
    lineHeight: moderateScale(11),
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
  },
  unit: { color: '#888', fontSize: moderateScale(11), marginTop: verticalScale(6) },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(3),
    // Reserve two lines so the price/ADD row sits at the same height on every card in a
    // row, whether the name wraps or not.
    minHeight: verticalScale(34),
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: verticalScale(6),
  },
  priceCol: { flexShrink: 1 },
  price: { color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold' },
  mrp: {
    color: '#999',
    fontSize: moderateScale(11),
    textDecorationLine: 'line-through',
  },
  // Fixed width so the ADD button and the stepper that replaces it occupy exactly the same
  // space — otherwise the price column jumps sideways the moment you tap ADD.
  actionCol: { width: scale(78), alignItems: 'flex-end' },
  addBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(5),
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  addBtnDisabled: { borderColor: '#ddd' },
  addBtnText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    letterSpacing: 0.5,
  },
  addBtnTextDisabled: { color: '#bbb' },
});

export default ProductCard;
