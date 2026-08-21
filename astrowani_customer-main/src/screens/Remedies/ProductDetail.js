import React, { useCallback, useContext, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import useRemedyOrderingGate from '../../hooks/useRemedyOrderingGate';
import { useCart } from '../../context/CartContext';
import { showStatusPopup } from '../../components/StatusPopup';
import { captureEvent } from '../../utils/Analytics';
import QtyStepper from '../../components/shop/QtyStepper';

const FALLBACK_IMAGE = 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg';

// Full product page. The shop grid truncates the description to two lines, which for a
// gemstone (where the whole pitch is which planet it serves and what it's meant to do) was
// the only place that text existed.
//
// ONE sticky action bar at the bottom, not two. This screen previously rendered the
// floating CartBar on top of its own inline "Add to cart" button, and the bar covered the
// last lines of the description — the text just ran underneath it. The bar below now does
// both jobs: it adds to the cart when the item isn't in it, and turns into a stepper plus
// "View Cart" once it is.
//
// The item arrives via route.params rather than being re-fetched: it came from
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
  const description = localized('description');
  const qty = cart.qtyOf(item._id);
  const price = Number(item.price) || 0;
  const mrp = Number(item.mrp) || 0;
  const hasDiscount = mrp > price;
  const discountPct = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
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

  const inCart = qty > 0 && !!gate.enabled;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <FastImage
            source={{ uri: item.image || FALLBACK_IMAGE }}
            style={styles.hero}
            resizeMode={FastImage.resizeMode.cover}
          />
          {hasDiscount ? (
            <View style={styles.ribbon}>
              <Text style={styles.ribbonPct}>{discountPct}%</Text>
              <Text style={styles.ribbonOff}>{t('cart.off')}</Text>
            </View>
          ) : null}
          {soldOut ? (
            <View style={styles.soldOutOverlay}>
              <View style={styles.soldOutPill}>
                <Text style={styles.soldOutPillText}>{t('cart.soldOut')}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Overlaps the image by a few pixels so the content reads as a sheet lifted over
            the photo rather than two stacked blocks with a hard seam between them. */}
        <View style={styles.sheet}>
          {item.unitLabel ? (
            <View style={styles.unitChip}>
              <Text style={styles.unitChipText}>{item.unitLabel}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{price}</Text>
            {hasDiscount ? (
              <>
                <Text style={styles.mrp}>₹{mrp}</Text>
                <View style={styles.offPill}>
                  <Text style={styles.offPillText}>{discountPct}% {t('cart.off')}</Text>
                </View>
              </>
            ) : null}
          </View>

          {hasDiscount ? (
            <Text style={styles.saveText}>{t('cart.save')} ₹{mrp - price}</Text>
          ) : null}

          {description ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionHeading}>{t('cart.aboutThisItem')}</Text>
              <Text style={styles.description}>{description}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* The single bottom bar. Its height is accounted for by scroll.paddingBottom above,
          which is what stops it sitting on top of the last line of the description. */}
      <View style={styles.bar}>
        <View style={styles.barPrice}>
          <Text style={styles.barPriceValue}>₹{price}</Text>
          {hasDiscount ? <Text style={styles.barPriceMrp}>₹{mrp}</Text> : null}
        </View>

        {soldOut ? (
          <View style={[styles.cta, styles.ctaDisabled]}>
            <Text style={styles.ctaTextDisabled}>{t('cart.soldOut')}</Text>
          </View>
        ) : inCart ? (
          <View style={styles.inCartRow}>
            <View style={styles.stepperWrap}>
              <QtyStepper
                qty={qty}
                onIncrement={() => cart.increment(item._id)}
                onDecrement={() => cart.decrement(item._id)}
              />
            </View>
            <TouchableOpacity
              style={styles.viewCartBtn}
              onPress={() => {
                captureEvent('cart_viewed', { from: 'detail', lines: cart.count });
                navigation.navigate('Cart');
              }}>
              <Text style={styles.viewCartText}>{t('cart.viewCart')}</Text>
              <Icon name="chevron-right" size={moderateScale(18)} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.cta} onPress={handleAdd} activeOpacity={0.85}>
            <Icon name="add-shopping-cart" size={moderateScale(17)} color={COLORS.white} />
            <Text style={styles.ctaText}>{t('cart.addToCart')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  // Clears the sticky bar so the description can always be scrolled fully into view.
  scroll: { paddingBottom: verticalScale(90) },

  heroWrap: { position: 'relative', backgroundColor: '#FAF6F2' },
  // Square rather than a magic pixel height, so a portrait stone isn't letterboxed.
  hero: { width: '100%', aspectRatio: 1, backgroundColor: '#FAF6F2' },

  ribbon: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#2E7D32',
    borderBottomRightRadius: moderateScale(14),
    paddingHorizontal: scale(11),
    paddingVertical: verticalScale(5),
    alignItems: 'center',
  },
  ribbonPct: { color: COLORS.white, fontSize: moderateScale(15), fontFamily: 'Lato-Bold', includeFontPadding: false },
  ribbonOff: { color: COLORS.white, fontSize: moderateScale(9), fontFamily: 'Lato-Bold', letterSpacing: 0.8, includeFontPadding: false },

  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutPill: {
    backgroundColor: 'rgba(89,42,25,0.92)',
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(24),
  },
  soldOutPillText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },

  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: moderateScale(22),
    borderTopRightRadius: moderateScale(22),
    marginTop: -verticalScale(16),
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(16),
  },

  unitChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    marginBottom: verticalScale(7),
  },
  unitChipText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(10.5),
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.4,
  },

  title: {
    color: '#2B1A11',
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    lineHeight: verticalScale(25),
  },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: verticalScale(10), flexWrap: 'wrap' },
  price: { color: '#2B1A11', fontSize: moderateScale(24), fontFamily: 'Lato-Bold' },
  mrp: {
    color: '#A99A90',
    fontSize: moderateScale(14),
    textDecorationLine: 'line-through',
    marginLeft: scale(9),
  },
  offPill: {
    backgroundColor: '#E8F5E9',
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    marginLeft: scale(9),
  },
  offPillText: { color: '#2E7D32', fontFamily: 'Lato-Bold', fontSize: moderateScale(11) },
  saveText: {
    color: '#2E7D32',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    marginTop: verticalScale(4),
  },

  divider: { height: 1, backgroundColor: '#F0E6DC', marginVertical: verticalScale(16) },
  sectionHeading: {
    color: '#2B1A11',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(6),
  },
  description: {
    color: '#6B5A50',
    fontSize: moderateScale(13.5),
    lineHeight: verticalScale(21),
  },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: '#F0E6DC',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  barPrice: { flex: 1 },
  barPriceValue: { color: '#2B1A11', fontSize: moderateScale(18), fontFamily: 'Lato-Bold' },
  barPriceMrp: {
    color: '#A99A90',
    fontSize: moderateScale(11),
    textDecorationLine: 'line-through',
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(13),
    paddingHorizontal: scale(26),
  },
  ctaDisabled: { backgroundColor: '#EDE7E3' },
  ctaText: {
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
    marginLeft: scale(7),
  },
  ctaTextDisabled: { color: '#A99A90', fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },

  inCartRow: { flexDirection: 'row', alignItems: 'center' },
  stepperWrap: { width: scale(104), marginRight: scale(9) },
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(13),
    paddingLeft: scale(14),
    paddingRight: scale(8),
  },
  viewCartText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(13) },
});

export default ProductDetail;
