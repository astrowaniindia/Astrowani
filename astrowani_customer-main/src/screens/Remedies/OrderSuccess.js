import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import SHOP, { cardShadow } from '../../components/shop/shopTheme';
import { captureEvent } from '../../utils/Analytics';

// Order confirmed. Reached with navigation.replace, so the hardware back button can't walk
// the customer back into the payment screen and re-trigger a paid checkout.
//
// Only ever rendered after the server has confirmed payment — for Razorpay that means the
// HMAC signature was verified backend-side, not that the Razorpay sheet said "success".
const OrderSuccess = ({ navigation, route }) => {
  const { t } = useContext(LanguageContext);
  const order = route?.params?.order || {};
  const amount = route?.params?.amount;
  const method = route?.params?.method;

  // Short, readable reference. The full UUID is meaningless to a customer reading it out
  // over the phone, and the admin Orders page can find an order from the last segment.
  const reference = order.id ? String(order.id).split('-').pop().toUpperCase() : null;

  // Reached only after the server confirmed payment, so this is the true bottom of the
  // remedies funnel — `order_placed` fires before the money is confirmed and can therefore
  // overcount. Use this one as the purchase count.
  React.useEffect(() => {
    captureEvent('order_confirmed', { order_id: order.id || null, amount: amount ?? null, payment_method: method || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <View style={styles.iconCircle}>
          <Icon name="check" size={moderateScale(42)} color={COLORS.white} />
        </View>
      </View>

      <Text style={styles.title}>{t('checkout.orderPlaced')}</Text>
      <Text style={styles.subtitle}>{t('checkout.orderPlacedSub')}</Text>

      <View style={styles.card}>
        {reference ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('checkout.orderId')}</Text>
            <Text style={styles.rowValue}>#{reference}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('checkout.amountPaid')}</Text>
          <Text style={styles.rowValue}>₹{amount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('checkout.paidVia')}</Text>
          <Text style={styles.rowValue}>
            {method === 'wallet' ? t('checkout.wallet') : t('checkout.online')}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => {
          captureEvent('order_success_cta', { cta: 'track_order', order_id: order.id || null });
          navigation.replace('MyOrders');
        }}>
        <Icon name="local-shipping" size={moderateScale(18)} color={COLORS.white} />
        <Text style={styles.primaryBtnText}>{t('checkout.trackOrder')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        // Straight to the tabbed app rather than goBack(): everything behind this screen
        // is cart → payment, and neither is somewhere to return to after paying. Named
        // explicitly instead of popToTop() because the root stack's first screen is
        // Splash, not the app home.
        onPress={() => {
          captureEvent('order_success_cta', { cta: 'continue_shopping', order_id: order.id || null });
          navigation.navigate('DrawerNavigator');
        }}>
        <Text style={styles.secondaryBtnText}>{t('checkout.continueShopping')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SHOP.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(24),
  },
  // Concentric ring in the success tint, so the tick reads as a stamp of confirmation
  // instead of a bare coloured disc.
  iconRing: {
    width: scale(112),
    height: scale(112),
    borderRadius: scale(56),
    backgroundColor: SHOP.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: SHOP.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: moderateScale(21),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    marginTop: verticalScale(20),
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: SHOP.textMuted,
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: verticalScale(20),
  },
  card: { ...cardShadow, alignSelf: 'stretch', padding: scale(15), marginTop: verticalScale(24) },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(5),
  },
  rowLabel: { fontSize: moderateScale(13), color: SHOP.textMuted },
  rowValue: { fontSize: moderateScale(13.5), fontFamily: 'Lato-Bold', color: SHOP.text },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: SHOP.brand,
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(26),
  },
  primaryBtnText: {
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(15),
    marginLeft: scale(8),
  },
  secondaryBtn: { paddingVertical: verticalScale(15) },
  secondaryBtnText: {
    color: SHOP.brand,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
});

export default OrderSuccess;
