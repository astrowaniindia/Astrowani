import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  InputAccessoryView,
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import { describeRazorpayError } from '../../../utils/razorpayError';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import { COLORS } from '../../../Theme/Colors';
import { LanguageContext } from '../../../context/LanguageContext';
import { SOCKET_URL } from '../../../config/api';
import { captureEvent } from '../../../utils/Analytics';
import { razorpayPrefill } from '../../../utils/customerIdentity';

const presetAmounts = [50, 100, 200, 500, 1000, 2000];

// iOS's number-pad has NO return key, so a numeric field there has no way to
// dismiss its own keyboard — the amount field would trap the user with Proceed
// hidden behind it. Android has the back button, which is why this only ever
// bit on iOS. Two escapes: a Done bar above the keypad, and tap-anywhere-else.
const AMOUNT_ACCESSORY_ID = 'walletAmountAccessory';

const Wallet = ({navigation}) => {
  const { t } = React.useContext(LanguageContext);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  // Server-verified flow: backend creates the Order (amount is server-trusted from
  // that point on) → checkout pays against it → backend verifies the signature before
  // crediting wallet_balance. Never credits anything based on a client-reported "success".
  const handleSubmit = async () => {
    const finalAmount = parseInt(amount, 10);
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      captureEvent('recharge_invalid_amount', { entered: amount });
      Alert.alert(t('wallet.invalidAmount'), t('wallet.enterValidAmount'));
      return;
    }
    // Fired on tap, before anything can fail — this is the denominator of the recharge
    // funnel. Without it a drop-off at the Razorpay sheet is indistinguishable from
    // nobody ever having tried.
    captureEvent('recharge_started', { amount: finalAmount });
    setProcessing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const authHeader = {headers: {Authorization: `Bearer ${token}`}};

      const orderRes = await axios.post(
        `${SOCKET_URL}/api/wallet/create-order`,
        {amount: finalAmount},
        authHeader,
      );
      if (!orderRes.data?.success) {
        throw new Error(orderRes.data?.message || 'Could not start payment');
      }
      const {orderId, amount: orderAmount, currency, keyId} = orderRes.data;

      // Same reason as the remedy-order sheet: with no prefill, Razorpay re-asks for the
      // mobile number and email on every single top-up. Blank fields are omitted rather
      // than sent empty, and the customer can still edit anything in the sheet.
      const prefill = await razorpayPrefill();

      const options = {
        description: 'Wallet Recharge',
        image: 'https://your-logo-url.com/logo.png',
        currency,
        key: keyId,
        amount: Math.round(orderAmount * 100),
        order_id: orderId,
        name: 'Astrowani',
        prefill,
        theme: {color: COLORS.AstroMaroon},
      };

      const data = await RazorpayCheckout.open(options);

      const verifyRes = await axios.post(
        `${SOCKET_URL}/api/wallet/verify-payment`,
        {
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
        },
        authHeader,
      );
      if (!verifyRes.data?.success) {
        throw new Error(verifyRes.data?.message || 'Payment verification failed');
      }

      captureEvent('wallet_recharged', { amount: finalAmount });
      setAmount('');
      Alert.alert(t('wallet.paymentSuccessful'), t('wallet.paymentId', { id: data.razorpay_payment_id }));
    } catch (error) {
      // Our own API failures carry a real message; Razorpay's need unwrapping, or
      // the customer is shown its raw JSON envelope. See utils/razorpayError.js —
      // both of those were live bugs on this screen.
      const apiMessage = error?.response?.data?.message;
      const rzp = describeRazorpayError(error);

      captureEvent('recharge_failed', {
        amount: finalAmount,
        cancelled: rzp.cancelled,
        reason: error?.response?.data?.code || rzp.code || (rzp.cancelled ? 'user_cancelled' : 'other'),
      });

      // Backing out of the checkout sheet is abandonment, not a failure. Saying
      // nothing is correct: nothing was charged, and the customer knows they
      // pressed back. A red "Payment Failed" there reads as though their money is
      // in limbo.
      if (!rzp.cancelled) {
        Alert.alert(
          t('wallet.paymentFailed'),
          apiMessage || rzp.message || (rzp.network ? t('wallet.networkError') : t('wallet.tryAgain')),
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  const renderPreset = ({item}) => (
    <TouchableOpacity
      style={styles.presetChip}
      onPress={() => {
        captureEvent('recharge_amount_selected', { amount: item, via: 'preset' });
        setAmount(item.toString());
      }}>
      <Text style={styles.presetText}>+ ₹{item}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Tap anywhere outside the field to dismiss. accessible={false} keeps this
          wrapper invisible to screen readers, and it does not swallow taps meant
          for the buttons inside it. */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.dismissArea}>
      <View style={styles.headerCard}>
        <View style={styles.walletIconContainer}>
          <MaterialIcons name="account-balance-wallet" size={40} color={COLORS.AstroGold} />
        </View>
        <Text style={styles.headerTitle}>{t('wallet.addMoney')}</Text>
        <Text style={styles.headerSubtitle}>{t('wallet.rechargeSubtitle')}</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>{t('wallet.enterAmount')}</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor="#ccc"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            inputAccessoryViewID={Platform.OS === 'ios' ? AMOUNT_ACCESSORY_ID : undefined}
          />
        </View>
      </View>

      <View style={styles.presetSection}>
        <Text style={styles.presetLabel}>{t('wallet.recommendedAmounts')}</Text>
        <FlatList
          data={presetAmounts}
          renderItem={renderPreset}
          keyExtractor={item => item.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetList}
        />
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.bottomSection}>
        <View style={styles.billDetails}>
          <Text style={styles.billText}>{t('wallet.totalPayable')}</Text>
          <Text style={styles.billAmount}>₹{amount || '0'}</Text>
        </View>
        {/* Slide, not tap — this opens Razorpay and takes real money. A drag is
            much harder to trigger by accident than a button under a thumb, and it
            matches the confirm gesture used on the paid astro reports. */}
        <View style={styles.swipeWrap}>
          <SwipeToConfirm
            label={t('wallet.slideToPay')}
            confirmingLabel={t('wallet.processing')}
            onConfirm={handleSubmit}
            busy={processing}
            disabled={!amount}
          />
        </View>
      </View>
      </View>
      </TouchableWithoutFeedback>

      {/* iOS only — renders nothing on Android. Gives the number-pad the Done
          key it does not otherwise have. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <TouchableOpacity onPress={Keyboard.dismiss} style={styles.accessoryDone}>
              <Text style={styles.accessoryDoneTxt}>{t('wallet.done')}</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
};

export default Wallet;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  // Fills the screen so a tap on empty space still reaches the dismiss handler.
  dismissArea: {
    flex: 1,
  },
  accessoryBar: {
    backgroundColor: '#F1F1F4',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CC',
    alignItems: 'flex-end',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
  },
  accessoryDone: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
  },
  accessoryDoneTxt: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: COLORS.AstroMaroon,
    padding: scale(25),
    paddingTop: scale(40),
    alignItems: 'center',
    borderBottomLeftRadius: moderateScale(30),
    borderBottomRightRadius: moderateScale(30),
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  walletIconContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: scale(15),
    borderRadius: scale(50),
    marginBottom: verticalScale(15),
  },
  headerTitle: {
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    color: COLORS.white,
    marginBottom: verticalScale(5),
  },
  headerSubtitle: {
    fontSize: moderateScale(14),
    color: '#E0E0E0',
    fontFamily: 'Lato-Regular',
  },
  inputSection: {
    backgroundColor: COLORS.white,
    marginHorizontal: scale(20),
    marginTop: verticalScale(-20),
    padding: scale(20),
    borderRadius: moderateScale(15),
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  inputLabel: {
    fontSize: moderateScale(14),
    color: '#666',
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(10),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.AstroMaroon,
    paddingBottom: verticalScale(5),
  },
  currencySymbol: {
    fontSize: moderateScale(30),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginRight: scale(10),
  },
  amountInput: {
    flex: 1,
    fontSize: moderateScale(35),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    padding: 0,
  },
  presetSection: {
    marginTop: verticalScale(25),
    paddingLeft: scale(20),
  },
  presetLabel: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: '#333',
    marginBottom: verticalScale(15),
  },
  presetList: {
    paddingRight: scale(20),
  },
  presetChip: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(20),
    marginRight: scale(12),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  presetText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  bottomSection: {
    backgroundColor: COLORS.white,
    padding: scale(20),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(30) : verticalScale(20),
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billDetails: {
    flex: 1,
  },
  billText: {
    fontSize: moderateScale(12),
    color: '#666',
    fontFamily: 'Lato-Regular',
  },
  billAmount: {
    fontSize: moderateScale(20),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginTop: verticalScale(2),
  },
  swipeWrap: {marginTop: verticalScale(4)},
});
