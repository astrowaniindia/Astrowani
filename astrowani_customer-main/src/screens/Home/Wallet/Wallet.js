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
} from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import { COLORS } from '../../../Theme/Colors';
import { LanguageContext } from '../../../context/LanguageContext';

const presetAmounts = [50, 100, 200, 500, 1000, 2000];

const Wallet = ({navigation}) => {
  const { t } = React.useContext(LanguageContext);
  const [amount, setAmount] = useState('');

  const handleSubmit = () => {
    const finalAmount = parseInt(amount);
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      Alert.alert(t('wallet.invalidAmount'), t('wallet.enterValidAmount'));
      return;
    }
    const options = {
      description: 'Wallet Recharge',
      image: 'https://your-logo-url.com/logo.png',
      currency: 'INR',
      key: 'rzp_live_3PXDqZGmI6Zz4o', 
      amount: finalAmount * 100,
      name: 'Astrowani',
      prefill: {
        email: 'test@example.com',
        contact: '+919829304067',
        name: 'User',
      },
      theme: {color: COLORS.AstroMaroon},
    };
    RazorpayCheckout.open(options)
      .then(data => {
        Alert.alert(t('wallet.paymentSuccessful'), t('wallet.paymentId', { id: data.razorpay_payment_id }));
      })
      .catch(error => {
        Alert.alert(t('wallet.paymentFailed'), error.description);
      });
  };

  const renderPreset = ({item}) => (
    <TouchableOpacity
      style={styles.presetChip}
      onPress={() => setAmount(item.toString())}>
      <Text style={styles.presetText}>+ ₹{item}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
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
        <TouchableOpacity
          style={[styles.submitBtn, !amount && styles.disabledBtn]}
          onPress={handleSubmit}
          disabled={!amount}
        >
          <Text style={styles.submitTxt}>{t('wallet.proceedToPay')}</Text>
          <MaterialIcons name="arrow-forward" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default Wallet;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
  submitBtn: {
    backgroundColor: COLORS.AstroMaroon,
    flexDirection: 'row',
    paddingHorizontal: scale(25),
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    backgroundColor: '#ccc',
  },
  submitTxt: {
    color: COLORS.white,
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    marginRight: scale(8),
  },
});
