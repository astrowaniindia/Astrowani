import React, { useContext, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { useCart } from '../../context/CartContext';
import { checkout, verifyOrderPayment } from '../../api/OrdersApi';
import useWalletBalance, { refreshWalletBalance } from '../../hooks/useWalletBalance';
import BillSummary from '../../components/shop/BillSummary';
import { showStatusPopup } from '../../components/StatusPopup';
import { captureEvent } from '../../utils/Analytics';

// Module scope on purpose: defined inside PaymentScreen, React would see a brand-new
// component type on every render and tear down all three rows each time `method` changed.
const PaymentOption = ({ active, icon, title, subtitle, disabled, badge, onPress }) => (
  <TouchableOpacity
    style={[styles.option, active && styles.optionActive, disabled && styles.optionDisabled]}
    activeOpacity={disabled ? 1 : 0.8}
    onPress={disabled ? undefined : onPress}>
    <Icon
      name={active && !disabled ? 'radio-button-checked' : 'radio-button-unchecked'}
      size={moderateScale(20)}
      color={disabled ? '#ccc' : active ? COLORS.AstroMaroon : '#bbb'}
    />
    <Icon
      name={icon}
      size={moderateScale(20)}
      color={disabled ? '#ccc' : COLORS.AstroMaroon}
      style={styles.optionIcon}
    />
    <View style={styles.optionBody}>
      <View style={styles.optionTitleRow}>
        <Text style={[styles.optionTitle, disabled && styles.textDisabled]}>{title}</Text>
        {badge ? (
          <View style={styles.soonPill}>
            <Text style={styles.soonPillText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={[styles.optionSub, disabled && styles.textDisabled]}>{subtitle}</Text>
      ) : null}
    </View>
  </TouchableOpacity>
);

// How the customer pays. Two live methods plus one that is honestly labelled as not ready.
//
// The Razorpay leg is the same server-verified shape as the wallet-recharge screen
// (screens/Home/Wallet/Wallet.js): the backend creates the order so the amount is
// server-trusted from that point on, the app pays against that order id, and the backend
// verifies the HMAC signature before the order is ever marked paid. Nothing is ever
// confirmed from a client-reported "success" — and the Razorpay key comes from the server
// response, never hardcoded in the app.
const PaymentScreen = ({ navigation, route }) => {
  const { t } = useContext(LanguageContext);
  const cart = useCart();
  const walletBalance = useWalletBalance();

  const addressId = route?.params?.addressId;
  const quote = route?.params?.quote;

  const [method, setMethod] = useState('wallet');
  const [processing, setProcessing] = useState(false);

  // One de-duplication token per checkout ATTEMPT, i.e. per mount of this screen. The
  // backend keys its wallet debit on the order id, which stops one order being charged
  // twice — but every checkout call mints a new order id, so without this token a retried
  // or raced call is a second order and a second charge (confirmed against the real DB).
  //
  // Held in a ref so it survives re-renders and is reused across retries of this same
  // attempt; navigating away and starting a genuinely new purchase remounts the screen and
  // mints a new one, so buying the same gemstone twice on purpose still works.
  //
  // Not a real UUID on purpose: no uuid/crypto-polyfill dependency exists in this app, and
  // the token only has to be unique per customer per attempt — the backend's unique index
  // is scoped (customer_id, client_request_id).
  const clientRequestId = useRef(`co_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`).current;

  const amount = Number(quote?.grandTotal) || 0;
  const balance = Number(walletBalance) || 0;
  const walletShort = balance < amount;

  const finish = (order) => {
    // Only cleared once the server has confirmed payment — a failed or abandoned payment
    // must leave the cart intact so the customer can retry without rebuilding it.
    cart.clear();
    refreshWalletBalance();
    captureEvent('order_placed', {
      order_id: order?.id || order?.orderId,
      payment_method: method,
      grand_total: amount,
      lines: quote?.items?.length || 0,
    });
    navigation.replace('OrderSuccess', { order, amount, method });
  };

  const payWithWallet = async () => {
    const res = await checkout({ items: cart.quoteItems, addressId, paymentMethod: 'wallet', clientRequestId });
    if (!res?.success) throw new Error(res?.message || t('checkout.failed'));
    finish(res.order || { id: res.orderId });
  };

  const payWithRazorpay = async () => {
    const created = await checkout({ items: cart.quoteItems, addressId, paymentMethod: 'razorpay', clientRequestId });
    if (!created?.success) throw new Error(created?.message || t('checkout.failed'));

    // A deduped retry can come back for an order that was already paid — reopening the
    // Razorpay sheet for it would ask the customer to pay a second time.
    if (created.alreadyProcessed && created.order?.payment_status === 'paid') {
      finish(created.order);
      return;
    }

    const payment = await RazorpayCheckout.open({
      description: t('checkout.remedyOrder'),
      currency: created.currency || 'INR',
      key: created.keyId,
      amount: Math.round(Number(created.amount) * 100),
      order_id: created.razorpayOrderId,
      name: 'Astrowani',
      theme: { color: COLORS.AstroMaroon },
    });

    const verified = await verifyOrderPayment({
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
    });
    if (!verified?.success) throw new Error(verified?.message || t('checkout.verifyFailed'));
    finish(verified.order || { id: created.orderId });
  };

  const pay = async () => {
    if (method === 'cod') return; // the option is inert by design — see the card below

    // Short balance is knowable before we ask the server, so go straight to the top-up
    // rather than creating an order row the 402 would only have to void again.
    if (method === 'wallet' && walletShort) {
      navigation.navigate('Wallet');
      return;
    }

    setProcessing(true);
    captureEvent('payment_method_selected', { payment_method: method, grand_total: amount });
    try {
      if (method === 'wallet') await payWithWallet();
      else await payWithRazorpay();
    } catch (err) {
      captureEvent('order_payment_failed', { payment_method: method, code: err.code || null });

      // The backend answers a short wallet with 402 and the exact shortfall, so this can
      // offer the top-up straight rather than making the customer work out the difference.
      if (err.code === 'INSUFFICIENT_BALANCE') {
        showStatusPopup({
          variant: 'insufficient',
          title: t('checkout.lowBalanceTitle'),
          message: t('checkout.lowBalanceMessage', {
            amount: err.data?.shortfall ?? Math.max(0, amount - balance),
          }),
          confirmText: t('checkout.addMoney'),
          onConfirm: () => navigation.navigate('Wallet'),
          cancelText: t('common.cancel'),
        });
      } else if (err.code === 'CATEGORY_NOT_SERVICEABLE' || err.code === 'OUT_OF_STOCK') {
        // Both mean the cart changed under us between quote and pay. Send them back so
        // the cart can re-quote and show which line is the problem.
        showStatusPopup({
          variant: 'missed',
          title: t('checkout.cannotComplete'),
          message: err.message,
          confirmText: t('cart.backToCart'),
          onConfirm: () => navigation.goBack(),
        });
      } else if (err.code === 'COD_COMING_SOON') {
        showStatusPopup({ variant: 'missed', title: t('checkout.comingSoon'), message: err.message });
      } else if (err?.code === 'Razorpay' || /cancel/i.test(err?.message || '')) {
        // RazorpayCheckout.open rejects when the customer closes the sheet. That's not an
        // error worth a scary popup — the order stays 'pending_payment' and is never shown
        // in their history.
      } else {
        showStatusPopup({
          variant: 'missed',
          title: t('checkout.paymentFailed'),
          message: err.message || t('checkout.failed'),
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>{t('checkout.choosePayment')}</Text>

        <PaymentOption
          active={method === 'wallet'}
          onPress={() => setMethod('wallet')}
          icon="account-balance-wallet"
          title={t('checkout.payFromWallet')}
          subtitle={
            walletShort
              ? t('checkout.walletShort', { balance, shortfall: Math.max(0, amount - balance) })
              : t('checkout.walletBalance', { balance })
          }
        />

        <PaymentOption
          active={method === 'razorpay'}
          onPress={() => setMethod('razorpay')}
          icon="credit-card"
          title={t('checkout.payOnline')}
          subtitle={t('checkout.payOnlineSub')}
        />

        {/* Deliberately visible and deliberately inert. The backend 400s 'cod' with
            COD_COMING_SOON, so showing it as a locked option is the honest thing — it tells
            customers it's planned without pretending it works. */}
        <PaymentOption
          active={false}
          icon="payments"
          title={t('checkout.cod')}
          subtitle={t('checkout.codSub')}
          badge={t('checkout.comingSoon')}
          disabled
        />

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
      </ScrollView>

      <View style={styles.payBar}>
        <View>
          <Text style={styles.payBarLabel}>{t('cart.toPay')}</Text>
          <Text style={styles.payBarAmount}>₹{amount}</Text>
        </View>
        <TouchableOpacity
          style={[styles.payBtn, processing && styles.payBtnDisabled]}
          disabled={processing}
          onPress={pay}>
          {processing ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.payBtnText}>
              {method === 'wallet' && walletShort ? t('checkout.addMoney') : t('checkout.payNow')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scroll: { padding: scale(12), paddingBottom: verticalScale(24) },
  heading: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: verticalScale(10),
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    padding: scale(13),
    marginBottom: verticalScale(10),
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  optionActive: { borderColor: COLORS.AstroMaroon },
  optionDisabled: { backgroundColor: '#fafafa' },
  optionIcon: { marginHorizontal: scale(10) },
  optionBody: { flex: 1 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  optionTitle: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: COLORS.black },
  optionSub: { fontSize: moderateScale(11), color: '#777', marginTop: verticalScale(2) },
  textDisabled: { color: '#bbb' },
  soonPill: {
    backgroundColor: '#EEE',
    borderRadius: moderateScale(5),
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(1),
    marginLeft: scale(8),
  },
  soonPillText: { fontSize: moderateScale(9), color: '#888', fontFamily: 'Lato-Bold' },
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
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(13),
    paddingHorizontal: scale(34),
    minWidth: scale(120),
    alignItems: 'center',
  },
  payBtnDisabled: { backgroundColor: '#bdbdbd' },
  payBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
});

export default PaymentScreen;
