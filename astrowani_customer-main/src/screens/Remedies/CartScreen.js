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
      <View style={styles.emptyWrap}>
        <Icon name="shopping-cart" size={moderateScale(56)} color="#ddd" />
        <Text style={styles.emptyTitle}>{t('cart.empty')}</Text>
        <Text style={styles.emptySub}>{t('cart.emptyHint')}</Text>
        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.shopBtnText}>{t('cart.startShopping')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Line items */}
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
                <Text style={styles.linePrice}>₹{line.price}</Text>
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
          <View style={styles.warnCard}>
            <Icon name="local-shipping" size={moderateScale(18)} color="#B26A00" />
            <Text style={styles.warnText}>{t('cart.categoryBlocked')}</Text>
          </View>
        ) : null}

        {outOfStock ? (
          <View style={styles.warnCard}>
            <Icon name="error-outline" size={moderateScale(18)} color="#B26A00" />
            <Text style={styles.warnText}>
              {outOfStock.map((o) => o.title).join(', ')} — {t('cart.soldOut')}
            </Text>
          </View>
        ) : null}

        {quoteError ? (
          <View style={styles.warnCard}>
            <Icon name="error-outline" size={moderateScale(18)} color="#B26A00" />
            <Text style={styles.warnText}>{quoteError}</Text>
          </View>
        ) : null}

        {/* Deliver to */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Addresses', { selectMode: true })}>
          <View style={styles.addressHeader}>
            <Icon name="place" size={moderateScale(18)} color={COLORS.AstroMaroon} />
            <Text style={styles.addressLabel}>{t('cart.deliverTo')}</Text>
            <Text style={styles.addressChange}>
              {address ? t('cart.change') : t('address.addNew')}
            </Text>
          </View>
          {loadingAddress ? (
            <ActivityIndicator size="small" color={COLORS.AstroMaroon} style={{ alignSelf: 'flex-start' }} />
          ) : address ? (
            <>
              <Text style={styles.addressName}>
                {address.full_name} · {address.phone}
              </Text>
              <Text style={styles.addressLine}>
                {[address.house_flat, address.street_area, address.landmark, address.city, address.state, address.pincode]
                  .filter(Boolean).join(', ')}
              </Text>
            </>
          ) : (
            <Text style={styles.addressMissing}>{t('cart.noAddress')}</Text>
          )}
        </TouchableOpacity>

        {/* Bill — server-computed */}
        {quoting && !quote ? (
          <View style={styles.quoteLoading}>
            <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
            <Text style={styles.quoteLoadingText}>{t('cart.calculating')}</Text>
          </View>
        ) : (
          <BillSummary
            quote={quote}
            labels={{
              itemTotal: t('cart.itemTotal'),
              delivery: t('cart.deliveryCharge'),
              handling: t('cart.handlingCharge'),
              toPay: t('cart.toPay'),
              savings: t('cart.youSave'),
            }}
          />
        )}
      </ScrollView>

      {/* Pay bar */}
      <View style={styles.payBar}>
        <View>
          <Text style={styles.payBarLabel}>{t('cart.toPay')}</Text>
          <Text style={styles.payBarAmount}>₹{quote ? quote.grandTotal : cart.subtotalEstimate}</Text>
        </View>
        <TouchableOpacity
          style={[styles.payBtn, !ctaEnabled && styles.payBtnDisabled]}
          disabled={!ctaEnabled}
          onPress={onCtaPress}>
          <Text style={styles.payBtnText}>
            {needsAddress ? t('cart.addAddress') : t('cart.proceedToPay')}
          </Text>
          <Icon name="chevron-right" size={moderateScale(20)} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scroll: { padding: scale(12), paddingBottom: verticalScale(24) },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: scale(24) },
  emptyTitle: { fontSize: moderateScale(17), fontFamily: 'Lato-Bold', color: COLORS.black, marginTop: verticalScale(14) },
  emptySub: { fontSize: moderateScale(13), color: '#888', marginTop: verticalScale(6), textAlign: 'center' },
  shopBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(28),
    marginTop: verticalScale(20),
  },
  shopBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#eee',
  },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(8) },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  lineThumb: { width: scale(54), height: scale(54), borderRadius: moderateScale(8), backgroundColor: '#f0f0f0' },
  lineInfo: { flex: 1, marginLeft: scale(10) },
  lineTitle: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black },
  lineUnit: { fontSize: moderateScale(11), color: '#999', marginTop: verticalScale(1) },
  linePrice: { fontSize: moderateScale(12), color: '#666', marginTop: verticalScale(2) },
  lineActions: { alignItems: 'flex-end', width: scale(80) },
  lineTotal: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black, marginTop: verticalScale(6) },

  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: moderateScale(10),
    padding: scale(11),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  warnText: { flex: 1, marginLeft: scale(8), fontSize: moderateScale(12), color: '#7A4F00', lineHeight: verticalScale(17) },

  addressHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(6) },
  addressLabel: { flex: 1, marginLeft: scale(6), fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black },
  addressChange: { fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  addressName: { fontSize: moderateScale(13), color: COLORS.black, fontFamily: 'Lato-Bold' },
  addressLine: { fontSize: moderateScale(12), color: '#666', marginTop: verticalScale(2), lineHeight: verticalScale(17) },
  addressMissing: { fontSize: moderateScale(12), color: '#B26A00' },

  quoteLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: verticalScale(18) },
  quoteLoadingText: { marginLeft: scale(8), fontSize: moderateScale(12), color: '#888' },

  payBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: '#eee',
    elevation: 8,
  },
  payBarLabel: { fontSize: moderateScale(11), color: '#888' },
  payBarAmount: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: COLORS.black },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(12),
    paddingLeft: scale(20),
    paddingRight: scale(12),
  },
  payBtnDisabled: { backgroundColor: '#bdbdbd' },
  payBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },
});

export default CartScreen;
