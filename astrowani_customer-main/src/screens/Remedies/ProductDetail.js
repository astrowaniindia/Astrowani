import React, { useCallback, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import FastImage from 'react-native-fast-image';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import useRemedyOrderingGate from '../../hooks/useRemedyOrderingGate';
import { useCart } from '../../context/CartContext';
import { showStatusPopup } from '../../components/StatusPopup';
import { captureEvent } from '../../utils/Analytics';
import QtyStepper from '../../components/shop/QtyStepper';
import CartBar from '../../components/shop/CartBar';

const FALLBACK_IMAGE = 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg';

// Full product page. The shop grid truncates the description to two lines, which for a
// gemstone (where the whole pitch is which planet it serves and what it's meant to do) was
// the only place that text existed. Reached by tapping a card.
//
// The item is passed through route.params rather than re-fetched: it came from
// /api/remedies moments ago on the previous screen, and a second round trip would only add
// a spinner. Prices are re-derived server-side at checkout regardless.
const ProductDetail = ({ route, navigation }) => {
  const { t, language } = useContext(LanguageContext);
  // Memoised because `|| {}` would otherwise mint a new object on every render, making
  // the localized() callback below (and anything depending on it) change every time.
  const item = useMemo(() => route?.params?.item || {}, [route?.params?.item]);
  const type = route?.params?.type || item.type;

  const cart = useCart();
  const gate = useRemedyOrderingGate(type);

  const localized = useCallback((field) => {
    const en = item[field];
    if (language !== 'Hindi') return en;
    const hi = item.hindi?.[field];
    return hi && hi !== en ? hi : en;
  }, [item, language]);

  const title = localized('title');
  const qty = cart.qtyOf(item._id);
  const price = Number(item.price) || 0;
  const mrp = Number(item.mrp) || 0;
  const hasDiscount = mrp > price;
  const soldOut = item.inStock === false;

  const handleAdd = () => {
    if (gate.enabled === null) return;
    if (!gate.enabled) {
      captureEvent('remedy_blocked_category_tapped', { item_id: item._id, remedy_type: type });
      showStatusPopup({
        variant: 'missed',
        title: gate.popupTitle,
        message: gate.messageFor(title || item.title),
      });
      return;
    }
    cart.add(item);
    captureEvent('add_to_cart', {
      item_id: item._id, item_title: item.title, remedy_type: type, price: item.price, from: 'detail',
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, cart.count > 0 && { paddingBottom: verticalScale(100) }]}
        showsVerticalScrollIndicator={false}>
        <FastImage
          source={{ uri: item.image || FALLBACK_IMAGE }}
          style={styles.hero}
          resizeMode={FastImage.resizeMode.cover}
        />

        <View style={styles.body}>
          {item.unitLabel ? <Text style={styles.unit}>{item.unitLabel}</Text> : null}
          <Text style={styles.title}>{title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{price}</Text>
            {hasDiscount ? (
              <>
                <Text style={styles.mrp}>₹{mrp}</Text>
                <View style={styles.offPill}>
                  <Text style={styles.offText}>
                    {Math.round(((mrp - price) / mrp) * 100)}% {t('cart.off')}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {soldOut ? <Text style={styles.soldOut}>{t('cart.soldOut')}</Text> : null}

          <View style={styles.actionRow}>
            {soldOut ? (
              <View style={[styles.addBtn, styles.addBtnDisabled]}>
                <Text style={[styles.addBtnText, { color: '#bbb' }]}>{t('cart.soldOut')}</Text>
              </View>
            ) : qty > 0 && gate.enabled ? (
              <View style={styles.stepperWrap}>
                <QtyStepper
                  qty={qty}
                  onIncrement={() => cart.increment(item._id)}
                  onDecrement={() => cart.decrement(item._id)}
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
                <Text style={styles.addBtnText}>{t('cart.addToCart')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {localized('description') ? (
            <>
              <Text style={styles.sectionHeading}>{t('cart.aboutThisItem')}</Text>
              <Text style={styles.description}>{localized('description')}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      <CartBar
        count={cart.count}
        totalUnits={cart.totalUnits}
        subtotal={cart.subtotalEstimate}
        label={t('cart.viewCart')}
        itemWord={t('cart.item')}
        itemsWord={t('cart.items')}
        onPress={() => {
          captureEvent('cart_viewed', { from: 'detail', lines: cart.count });
          navigation.navigate('Cart');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll: { paddingBottom: verticalScale(30) },
  // Square, so a portrait gemstone photo isn't cropped to a letterbox strip.
  hero: { width: '100%', aspectRatio: 1, backgroundColor: '#f0f0f0' },
  body: { padding: scale(16) },
  unit: { color: '#888', fontSize: moderateScale(12) },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(4),
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(10) },
  price: { color: COLORS.black, fontSize: moderateScale(22), fontFamily: 'Lato-Bold' },
  mrp: {
    color: '#999',
    fontSize: moderateScale(15),
    textDecorationLine: 'line-through',
    marginLeft: scale(10),
  },
  offPill: {
    backgroundColor: '#E8F5E9',
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    marginLeft: scale(10),
  },
  offText: { color: '#2E7D32', fontFamily: 'Lato-Bold', fontSize: moderateScale(11) },
  soldOut: { color: COLORS.red, fontSize: moderateScale(13), marginTop: verticalScale(8) },
  actionRow: { marginTop: verticalScale(18) },
  stepperWrap: { alignSelf: 'flex-start', width: scale(130) },
  addBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(13),
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#f0f0f0' },
  addBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
  sectionHeading: {
    color: COLORS.black,
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(24),
    marginBottom: verticalScale(6),
  },
  description: { color: '#555', fontSize: moderateScale(14), lineHeight: verticalScale(21) },
});

export default ProductDetail;
