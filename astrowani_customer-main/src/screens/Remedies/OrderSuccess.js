import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';

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

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name="check" size={moderateScale(44)} color={COLORS.white} />
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
        onPress={() => navigation.replace('MyOrders')}>
        <Icon name="local-shipping" size={moderateScale(18)} color={COLORS.white} />
        <Text style={styles.primaryBtnText}>{t('checkout.trackOrder')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        // Straight to the tabbed app rather than goBack(): everything behind this screen
        // is cart → payment, and neither is somewhere to return to after paying. Named
        // explicitly instead of popToTop() because the root stack's first screen is
        // Splash, not the app home.
        onPress={() => navigation.navigate('DrawerNavigator')}>
        <Text style={styles.secondaryBtnText}>{t('checkout.continueShopping')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: scale(24),
  },
  iconCircle: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: moderateScale(21),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginTop: verticalScale(20),
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: '#777',
    textAlign: 'center',
    marginTop: verticalScale(8),
    lineHeight: verticalScale(19),
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FAFAFA',
    borderRadius: moderateScale(12),
    padding: scale(14),
    marginTop: verticalScale(24),
    borderWidth: 1,
    borderColor: '#eee',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(4),
  },
  rowLabel: { fontSize: moderateScale(13), color: '#777' },
  rowValue: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(26),
  },
  primaryBtnText: {
    color: COLORS.white,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(15),
    marginLeft: scale(8),
  },
  secondaryBtn: { paddingVertical: verticalScale(14) },
  secondaryBtnText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
});

export default OrderSuccess;
