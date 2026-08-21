// A remedy product card, in the shape people already know from every delivery app: image,
// unit, name, price with the struck-through MRP beside it, and an ADD button that turns
// into a − qty + stepper in place once the item is in the cart.
//
// Replaces the old RemedyShop card, whose only action was a full-width "Buy Now" that
// opened a name/phone/address form for one item at a time.
//
// ONE card serves all four sections (puja / gemstone / specific_puja / life_report), so
// every field below is optional and the card composes down cleanly: no MRP means no
// discount badge and no savings line, no unit_label means that row disappears entirely.
// A life report with only a title and price still looks deliberate rather than broken.
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
  saveLabel = 'Save',
}) => {
  const price = Number(item.price) || 0;
  const mrp = Number(item.mrp) || 0;
  // Only a genuinely higher MRP is a discount. An admin who typed the same number in both
  // fields must not produce a "0% OFF" badge.
  const hasDiscount = mrp > price;
  const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const saved = hasDiscount ? mrp - price : 0;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.imageWrap}>
        <FastImage
          source={{ uri: item.image || FALLBACK_IMAGE }}
          style={styles.image}
          resizeMode={FastImage.resizeMode.cover}
        />

        {hasDiscount ? (
          <View style={styles.discountRibbon}>
            <Text style={styles.discountPct}>{discountPct}%</Text>
            <Text style={styles.discountOff}>OFF</Text>
          </View>
        ) : null}

        {soldOut ? (
          <View style={styles.soldOutOverlay}>
            <View style={styles.soldOutPill}>
              <Text style={styles.soldOutText}>{soldOutLabel}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {item.unitLabel ? <Text style={styles.unit}>{item.unitLabel}</Text> : null}

        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{price}</Text>
          {hasDiscount ? <Text style={styles.mrp}>₹{mrp}</Text> : null}
        </View>

        {/* Reserved whether or not there's a discount, so cards in the same row keep their
            action buttons on one line instead of stepping up and down. */}
        <View style={styles.saveSlot}>
          {saved > 0 ? (
            <Text style={styles.saveText}>{saveLabel} ₹{saved}</Text>
          ) : null}
        </View>

        <View style={styles.action}>
          {soldOut ? (
            <View style={[styles.addBtn, styles.addBtnDisabled]}>
              <Text style={[styles.addBtnText, styles.addBtnTextDisabled]}>{soldOutLabel}</Text>
            </View>
          ) : qty > 0 && !blocked ? (
            <QtyStepper qty={qty} onIncrement={onIncrement} onDecrement={onDecrement} size="sm" />
          ) : (
            // A blocked category still shows a normal ADD: tapping it is how the customer
            // gets told we aren't delivering this yet. Greying it out would leave them with
            // no way to find out why.
            <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.7}>
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
    borderRadius: moderateScale(14),
    marginBottom: verticalScale(14),
    // The old card was a flat 1px-bordered box. A soft shadow lifts it off the
    // AstroSoftOrange background instead of blending into it.
    borderWidth: 1,
    borderColor: '#F0E6DC',
    elevation: 3,
    shadowColor: '#4a2412',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    overflow: 'hidden',
  },

  imageWrap: { position: 'relative', backgroundColor: '#FAF6F2' },
  // Square rather than a fixed pixel height: gemstone and puja photos have wildly
  // different aspect ratios, and a fixed height cropped the tall ones to a strip.
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#FAF6F2' },

  // Corner ribbon rather than the old flat tag — two lines so a "20%" stays legible at
  // this size instead of shrinking to fit "20% OFF" on one.
  discountRibbon: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#2E7D32',
    borderBottomRightRadius: moderateScale(10),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    alignItems: 'center',
  },
  discountPct: {
    color: COLORS.white,
    fontSize: moderateScale(11),
    fontFamily: 'Lato-Bold',
    includeFontPadding: false,
  },
  discountOff: {
    color: COLORS.white,
    fontSize: moderateScale(7.5),
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.6,
    includeFontPadding: false,
  },

  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutPill: {
    backgroundColor: 'rgba(89,42,25,0.9)',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(20),
  },
  soldOutText: {
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(11),
  },

  body: { paddingHorizontal: scale(9), paddingTop: verticalScale(8), paddingBottom: verticalScale(10) },

  unit: {
    color: '#9A8B80',
    fontSize: moderateScale(10.5),
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.3,
    marginBottom: verticalScale(2),
  },
  title: {
    color: '#2B1A11',
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    lineHeight: verticalScale(17),
    // Reserve two lines so the price/ADD rows line up across a row of cards whether the
    // name wraps or not.
    minHeight: verticalScale(34),
  },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: verticalScale(4) },
  price: {
    color: '#2B1A11',
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
  },
  mrp: {
    color: '#A99A90',
    fontSize: moderateScale(11.5),
    textDecorationLine: 'line-through',
    marginLeft: scale(5),
  },

  saveSlot: { minHeight: verticalScale(14), justifyContent: 'center' },
  saveText: {
    color: '#2E7D32',
    fontSize: moderateScale(10),
    fontFamily: 'Lato-Bold',
  },

  action: { marginTop: verticalScale(7) },
  addBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(9),
    paddingVertical: verticalScale(7),
    alignItems: 'center',
    backgroundColor: '#FFF9F4',
  },
  addBtnDisabled: { borderColor: '#E4DCD5', backgroundColor: '#F7F4F2' },
  addBtnText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12.5),
    letterSpacing: 0.8,
  },
  addBtnTextDisabled: { color: '#B5AAA2' },
});

export default ProductCard;
