// The bill summary — item total, delivery, handling, and what's actually payable.
//
// Every number here is rendered straight from the /api/orders/quote response and nothing is
// computed locally. That is the point: the server owns the arithmetic, so the amount the
// customer reads is provably the amount the checkout endpoint will charge. If a fee is
// zero the server still returns it, and it's shown as "FREE" rather than hidden — a
// summary that silently omits lines is how customers end up surprised at the total.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import SHOP, { cardShadow, shopStyles } from './shopTheme';

const Row = ({ label, value, free, strong }) => (
  <View style={styles.row}>
    <Text style={[styles.label, strong && styles.labelStrong]}>{label}</Text>
    {free ? (
      <Text style={styles.freeValue}>FREE</Text>
    ) : (
      <Text style={[styles.value, strong && styles.valueStrong]}>₹{value}</Text>
    )}
  </View>
);

const BillSummary = ({ quote, labels = {} }) => {
  if (!quote) return null;

  const {
    itemTotal = 'Item total',
    delivery = 'Delivery charge',
    handling = 'Handling charge',
    toPay = 'To pay',
    savings = 'You save',
  } = labels;

  // MRP savings across the cart, shown only when there is something to show.
  const saved = (quote.items || []).reduce((sum, line) => {
    const mrp = Number(line.mrp) || 0;
    const unit = Number(line.unitPrice) || 0;
    return mrp > unit ? sum + (mrp - unit) * line.quantity : sum;
  }, 0);

  return (
    <View style={styles.card}>
      {labels.heading ? (
        <Text style={shopStyles.sectionLabel}>{labels.heading}</Text>
      ) : null}

      <Row label={itemTotal} value={quote.subtotal} />
      <Row label={delivery} value={quote.deliveryFee} free={Number(quote.deliveryFee) === 0} />
      {Number(quote.handlingFee) > 0 ? <Row label={handling} value={quote.handlingFee} /> : null}

      <View style={styles.divider} />
      <Row label={toPay} value={quote.grandTotal} strong />

      {saved > 0 ? (
        <View style={styles.savingsBanner}>
          <Icon name="savings" size={moderateScale(15)} color={SHOP.success} />
          <Text style={styles.savingsText}>{savings} ₹{Math.round(saved)}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { ...cardShadow, padding: scale(14), marginTop: verticalScale(12) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(5),
  },
  label: { fontSize: moderateScale(13), color: SHOP.textSoft },
  labelStrong: { fontSize: moderateScale(15), color: SHOP.text, fontFamily: 'Lato-Bold' },
  value: { fontSize: moderateScale(13), color: SHOP.text },
  valueStrong: { fontSize: moderateScale(18), color: SHOP.brand, fontFamily: 'Lato-Bold' },
  freeValue: { fontSize: moderateScale(13), color: SHOP.success, fontFamily: 'Lato-Bold' },
  divider: { height: 1, backgroundColor: SHOP.border, marginVertical: verticalScale(7) },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SHOP.successBg,
    borderRadius: moderateScale(9),
    paddingVertical: verticalScale(7),
    marginTop: verticalScale(11),
  },
  savingsText: {
    color: SHOP.success,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12.5),
    marginLeft: scale(6),
  },
});

export default BillSummary;
