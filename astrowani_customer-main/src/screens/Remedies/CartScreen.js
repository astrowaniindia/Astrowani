import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { getQuote, listAddresses } from '../../api/OrdersApi';
import BillSummary from '../../components/shop/BillSummary';
import QtyStepper from '../../components/shop/QtyStepper';
import SHOP, { shopStyles, cardShadow } from '../../components/shop/shopTheme';
import { captureEvent } from '../../utils/Analytics';

const FALLBACK_IMAGE = 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg';

// The cart. Line items with steppers, the delivery address, and the bill.
//
// Every figure shown here comes from POST /api/orders/quote — the screen never multiplies a
// price by a quantity itself. That's what makes the "To pay" line trustworthy: it is
// literally the number POST /api/orders/checkout will charge, derived by the same server
// code from the same rows. The cart's own cached prices are used only for the instant
// first paint before the quote lands.
const CartScreen = ({ navigation }) => {
  const { t, language } = useContext(LanguageContext);
  const cart = useCart();

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(true);
  const [quoteError, setQuoteError] = useState(null);
  const [address, setAddress] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(true);

  const refreshQuote = useCallback(async () => {
    if (!cart.quoteItems.length) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    setQuoting(true);
    try {
      const res = await getQuote(cart.quoteItems);
      if (res?.success) {
        setQuote(res);
        setQuoteError(null);
      } else {
        // An expected 400 — empty cart, or an item an admin deactivated while it sat in
        // the cart. The message is the server's own, which is more specific than anything
        // generic we'd write here.
        setQuote(null);
        setQuoteError(res?.message || t('cart.couldNotPrice'));
      }
    } catch (err) {
      setQuote(null);
      setQuoteError(err.message);
    } finally {
      setQuoting(false);
    }
  }, [cart.quoteItems, t]);

  // Re-quote on every quantity change: the total, the delivery fee (which can cross a
  // free-delivery threshold) and the blocked/out-of-stock flags all depend on the cart.
  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  // Addresses are re-read on focus so returning from "Add address" shows the new one
  // immediately without a manual refresh.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoadingAddress(true);
      try {
        const list = await listAddresses();
        if (cancelled) return;
        setAddress(list.find((a) => a.is_default) || list[0] || null);
      } catch (_) {
        if (!cancelled) setAddress(null);
      } finally {
        if (!cancelled) setLoadingAddress(false);
      }
    })();
    return () => { cancelled = true; };
  }, []));

  const titleOf = (line) => {
    if (language !== 'Hindi') return line.title;
    return line.titleHi && line.titleHi !== line.title ? line.titleHi : line.title;
  };

  const blocked = quote?.blockedTypes?.length ? quote.blockedTypes : null;
  const outOfStock = quote?.outOfStock?.length ? quote.outOfStock : null;

  // With no address saved the button is still LIVE — it just goes to the address book
  // instead of to payment. Disabling it and labelling it "Add address" would leave the
  // customer reading an instruction they can't act on.
  const needsAddress = !loadingAddress && !address;
  const ctaEnabled = needsAddress || (!!quote?.canCheckout && !!address && !quoting);

  const onCtaPress = () => {
    if (needsAddress) {
      navigation.navigate('Addresses', { selectMode: true });
      return;
    }
    captureEvent('checkout_started', {
      lines: cart.count, units: cart.totalUnits, grand_total: quote.grandTotal,
    });
    navigation.navigate('Payment', { addressId: address.id, quote });
  };

  if (!cart.count) {
    return (
      <View style={[shopStyles.screen, styles.emptyScreen]}>
        <View style={styles.emptyIconCircle}>
          <Icon name="shopping-cart" size={moderateScale(40)} color={SHOP.textMuted} />
        </View>
        <Text style={shopStyles.emptyTitle}>{t('cart.empty')}</Text>
        <Text style={shopStyles.emptySub}>{t('cart.emptyHint')}</Text>
        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.goBack()}>
          <Text style={shopStyles.primaryBtnText}>{t('cart.startShopping')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={shopStyles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Line items */}
        <Text style={shopStyles.sectionLabel}>
          {cart.totalUnits} {cart.totalUnits === 1 ? t('cart.item') : t('cart.items')}
        </Text>
        <View style={styles.card}>
          {cart.items.map((line, index) => (
            <View
              key={line.itemId}
              style={[styles.lineRow, index < cart.items.length - 1 && styles.lineDivider]}>
              <FastImage
                source={{ uri: line.image || FALLBACK_IMAGE }}
                style={styles.lineThumb}
                resizeMode={FastImage.resizeMode.cover}
              />
              <View style={styles.lineInfo}>
                <Text style={styles.lineTitle} numberOfLines={2}>{titleOf(line)}</Text>
                {line.unitLabel ? <Text style={styles.lineUnit}>{line.unitLabel}</Text> : null}
                <View style={styles.linePriceRow}>
                  <Text style={styles.linePrice}>₹{line.price}</Text>
                  {Number(line.mrp) > Number(line.price) ? (
                    <Text style={styles.lineMrp}>₹{line.mrp}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.lineActions}>
                <QtyStepper
                  qty={line.quantity}
                  onIncrement={() => cart.increment(line.itemId)}
                  onDecrement={() => cart.decrement(line.itemId)}
                  size="sm"
                />
                <Text style={styles.lineTotal}>₹{line.price * line.quantity}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Anything that would make checkout fail, said before they tap the button rather
            than as an error after it. */}
        {blocked ? (
          <View style={[shopStyles.notice, styles.noticeSpacing]}>
            <Icon name="local-shipping" size={moderateScale(18)} color={SHOP.warn} />
            <Text style={shopStyles.noticeText}>{t('cart.categoryBlocked')}</Text>
          </View>
        ) : null}

        {outOfStock ? (
          <View style={[shopStyles.notice, styles.noticeSpacing]}>
            <Icon name="error-outline" size={moderateScale(18)} color={SHOP.warn} />
            <Text style={shopStyles.noticeText}>
              {outOfStock.map((o) => o.title).join(', ')} — {t('cart.soldOut')}
            </Text>
          </View>
        ) : null}

        {quoteError ? (
          <View style={[shopStyles.notice, styles.noticeSpacing]}>
            <Icon name="error-outline" size={moderateScale(18)} color={SHOP.warn} />
            <Text style={shopStyles.noticeText}>{quoteError}</Text>
          </View>
        ) : null}

        {/* Deliver to */}
        <Text style={[shopStyles.sectionLabel, styles.labelSpacing]}>{t('cart.deliverTo')}</Text>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Addresses', { selectMode: true })}>
          {loadingAddress ? (
            <ActivityIndicator size="small" color={SHOP.brand} style={styles.addrLoader} />
          ) : address ? (
            <View style={styles.addrRow}>
              <View style={styles.addrPin}>
                <Icon name="place" size={moderateScale(18)} color={SHOP.brand} />
              </View>
              <View style={styles.addrBody}>
                <View style={styles.addrTop}>
                  <View style={styles.addrLabelPill}>
                    <Text style={styles.addrLabelText}>{t(`address.label_${address.label}`)}</Text>
                  </View>
                  <Text style={styles.addrChange}>{t('cart.change')}</Text>
                </View>
                <Text style={styles.addrName}>{address.full_name} · {address.phone}</Text>
                <Text style={styles.addrLine}>
                  {[address.house_flat, address.street_area, address.landmark, address.city, address.state, address.pincode]
                    .filter(Boolean).join(', ')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.addrRow}>
              <View style={styles.addrPin}>
                <Icon name="add-location-alt" size={moderateScale(18)} color={SHOP.warn} />
              </View>
              <View style={styles.addrBody}>
                <Text style={styles.addrMissing}>{t('cart.noAddress')}</Text>
              </View>
              <Icon name="chevron-right" size={moderateScale(20)} color={SHOP.textMuted} />
            </View>
          )}
        </TouchableOpacity>

        {/* Bill — server-computed */}
        {quoting && !quote ? (
          <View style={styles.quoteLoading}>
            <ActivityIndicator size="small" color={SHOP.brand} />
            <Text style={styles.quoteLoadingText}>{t('cart.calculating')}</Text>
          </View>
        ) : (
          <BillSummary
            quote={quote}
            labels={{
              heading: t('cart.billDetails'),
              itemTotal: t('cart.itemTotal'),
              delivery: t('cart.deliveryCharge'),
              handling: t('cart.handlingCharge'),
              toPay: t('cart.toPay'),
              savings: t('cart.youSave'),
            }}
          />
        )}
      </ScrollView>

      <View style={shopStyles.stickyBar}>
        <View>
          <Text style={styles.barLabel}>{t('cart.toPay')}</Text>
          <Text style={styles.barAmount}>₹{quote ? quote.grandTotal : cart.subtotalEstimate}</Text>
        </View>
        <TouchableOpacity
          style={[styles.payBtn, !ctaEnabled && shopStyles.primaryBtnDisabled]}
          disabled={!ctaEnabled}
          onPress={onCtaPress}>
          <Text style={shopStyles.primaryBtnText}>
            {needsAddress ? t('cart.addAddress') : t('cart.proceedToPay')}
          </Text>
          <Icon name="chevron-right" size={moderateScale(19)} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: scale(14), paddingBottom: verticalScale(24) },
  card: { ...cardShadow, padding: scale(12), marginBottom: verticalScale(6) },

  emptyScreen: { alignItems: 'center', justifyContent: 'center', backgroundColor: SHOP.surface },
  emptyIconCircle: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    backgroundColor: SHOP.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopBtn: {
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(30),
    marginTop: verticalScale(22),
  },

  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(9) },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: SHOP.border },
  lineThumb: {
    width: scale(58),
    height: scale(58),
    borderRadius: moderateScale(10),
    backgroundColor: SHOP.surfaceAlt,
  },
  lineInfo: { flex: 1, marginLeft: scale(11) },
  lineTitle: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: SHOP.text, lineHeight: verticalScale(17) },
  lineUnit: { fontSize: moderateScale(10.5), color: SHOP.textMuted, marginTop: verticalScale(1) },
  linePriceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: verticalScale(3) },
  linePrice: { fontSize: moderateScale(13), color: SHOP.text, fontFamily: 'Lato-Bold' },
  lineMrp: {
    fontSize: moderateScale(11),
    color: SHOP.strike,
    textDecorationLine: 'line-through',
    marginLeft: scale(5),
  },
  lineActions: { alignItems: 'flex-end', width: scale(84) },
  lineTotal: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    marginTop: verticalScale(7),
  },

  noticeSpacing: { marginBottom: verticalScale(10) },
  labelSpacing: { marginTop: verticalScale(10) },

  addrLoader: { alignSelf: 'flex-start' },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start' },
  addrPin: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: SHOP.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(10),
  },
  addrBody: { flex: 1 },
  // space-between, and the pill must NOT flex — with flex:1 it grew across the row and the
  // "Change" link ended up butted straight against it, rendering as "HomeChange".
  addrTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(4),
  },
  addrLabelPill: {
    backgroundColor: SHOP.brandTint,
    borderRadius: moderateScale(5),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    alignSelf: 'flex-start',
  },
  addrLabelText: {
    color: SHOP.brand,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(9.5),
    letterSpacing: 0.3,
  },
  addrChange: { color: SHOP.brand, fontFamily: 'Lato-Bold', fontSize: moderateScale(12) },
  addrName: { fontSize: moderateScale(13), color: SHOP.text, fontFamily: 'Lato-Bold' },
  addrLine: {
    fontSize: moderateScale(12),
    color: SHOP.textSoft,
    marginTop: verticalScale(2),
    lineHeight: verticalScale(17),
  },
  addrMissing: { fontSize: moderateScale(12.5), color: SHOP.warn, fontFamily: 'Lato-Bold' },

  quoteLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: verticalScale(20) },
  quoteLoadingText: { marginLeft: scale(8), fontSize: moderateScale(12), color: SHOP.textMuted },

  barLabel: { fontSize: moderateScale(11), color: SHOP.textMuted },
  barAmount: { fontSize: moderateScale(19), fontFamily: 'Lato-Bold', color: SHOP.text },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(13),
    paddingLeft: scale(20),
    paddingRight: scale(12),
  },
});

export default CartScreen;
