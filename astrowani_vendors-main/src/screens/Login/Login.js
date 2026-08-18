import React, {useContext, useState} from 'react';
import {
  StyleSheet,
  Image,
  Text,
  View,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import {LanguageContext} from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';
import {sanitizePhoneInput} from '../../utils/phoneInput';

const Login = ({navigation}) => {
  const {t} = useContext(LanguageContext);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, SetLoading] = useState(false);

  const validateFields = () => {
    if (!phoneNumber) {
      Alert.alert(t('login.validationError'), t('login.phoneEmpty'));
      return false;
    }
    if (phoneNumber.length < 10) {
      Alert.alert(
        t('login.validationError'),
        t('login.phoneTooShort'),
      );
      return false;
    }
    return true;
  };

  const loginByPhone = async () => {
    if (!validateFields()) return;
    SetLoading(true);
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber,
        role: 'astrologer',
        intent: 'login',
      });
      if (res?.data?.success) {
        navigation.navigate('VerifyOtp', { phoneNumber, role: 'astrologer' });
      } else {
        Alert.alert(t('login.error'), res?.data?.message || t('login.otpSendFailed'));
      }
    } catch (error) {
      if (error?.response?.data?.code === 'NO_ACCOUNT') {
        Alert.alert(t('login.notFound'), t('login.noAccountFound'));
      } else {
        // Surface the backend's own reason when it sent one (e.g. the OTP SMS
        // could not be sent) — the generic fallback hid actionable failures
        // behind "something went wrong". See Registration.js for the same fix.
        console.log('Login error:', error?.response?.status, error?.response?.data || error.message);
        Alert.alert(
          t('login.loginError'),
          error?.response?.data?.message || t('login.somethingWrong'),
        );
      }
    } finally {
      SetLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <LanguageToggle dark />
      <Image
        source={require('../../assets/images/logo1.png')}
        style={styles.logo}
      />
      <Text style={styles.title}>Astrowani</Text>

      <Text style={styles.subTitle}>{t('login.forAstrologers')}</Text>
      <View style={styles.loginContainer}>
        <View style={styles.numberInput}>
          {/* Fixed +91, not a picker (audit 2026-08-18 finding 4).
              There WAS a working country selector here, but its `callingCode`
              was never sent to the backend — /api/users/mobile-otp-request
              hardcodes +91, and the EnableX DLT template and ASTRWI sender ID
              are India-only. So picking any other country showed the user a
              different dial code while their number was still dispatched to a
              +91 number: either bouncing at the carrier, or reaching an
              unrelated real person. Showing a fixed +91 is the honest state of
              what the backend can actually do. If international numbers are
              ever supported, send callingCode and validate per-country
              server-side rather than reinstating a decorative picker. */}
          <View style={styles.countryPicker}>
            <Text style={styles.flag}>🇮🇳</Text>
            <Text style={styles.callingCode}>+91</Text>
          </View>
          <TextInput
            style={styles.input}
            maxLength={12}
            placeholder={t('login.phoneNumber')}
            keyboardType="phone-pad"
            value={phoneNumber}
            // Was maxLength={10} with no filtering — pasting a number with the
            // country code truncated it to the first 10 CHARACTERS, silently
            // dropping real digits. See utils/phoneInput.js.
            onChangeText={(text) => setPhoneNumber(sanitizePhoneInput(text))}
          />
        </View>

        <TouchableOpacity
          style={[styles.otpBtn, loading && styles.disabledBtn]}
          disabled={loading}
          onPress={loginByPhone}>
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.btnTxt}>{t('login.continue')}</Text>
          )}
        </TouchableOpacity>

        <View style={styles.termsView}>
          <Text style={styles.termsText}>{t('login.termsPrefix')}</Text>
          <TouchableOpacity style={styles.termsLink}>
            <Text style={styles.linktext}>{t('login.termsOfUse')}</Text>
          </TouchableOpacity>
          <Text style={styles.termsText}>{t('login.and')}</Text>
          <TouchableOpacity style={styles.termsLink}>
            <Text style={styles.linktext}>{t('login.privacyPolicy')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Registration')}>
          <Text style={styles.register}>{t('login.noAccount')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default Login;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  logo: {
    alignSelf: 'center',
    marginTop: verticalScale(60),
    marginBottom: verticalScale(10),
    width: scale(100),
    height: verticalScale(100),
  },
  title: {
    textAlign: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(24),
    letterSpacing: scale(1),
  },
  subTitle: {
    textAlign: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
  loginContainer: {
    backgroundColor: 'white',
    flex: 1,
    width: '100%',
    borderTopLeftRadius: moderateScale(25),
    borderTopRightRadius: moderateScale(25),
    marginTop: verticalScale(35),
  },
  tagline: {
    alignSelf: 'center',
    color: 'black',
    fontWeight: 'bold',
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(7),
    borderRadius: moderateScale(5),
    borderWidth: moderateScale(1),
    borderColor: COLORS.AstroMaroon,
    marginTop: verticalScale(-20),
    backgroundColor: 'white',
    fontSize: moderateScale(12),
  },
  numberInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: scale(15),
    borderWidth: moderateScale(1),
    height: verticalScale(42),
    borderColor: COLORS.AshGray,
    marginVertical: verticalScale(30),
    borderRadius: moderateScale(25),
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryPickerButton: {
    marginLeft: scale(10),
  },
  callingCode: {
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
  },
  input: {
    flex: 1,
    paddingVertical: verticalScale(1),
    marginLeft: scale(10),
    color: COLORS.black,
    fontSize: moderateScale(14),
  },
  otpBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(45),
    marginHorizontal: scale(15),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
  },
  disabledBtn: {
    backgroundColor: COLORS.gray,
  },
  btnTxt: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  termsView: {
    marginVertical: verticalScale(10),
    marginHorizontal: scale(15),
    alignItems: 'center',
    flexDirection: 'row',
    alignSelf: 'center',
  },
  termsText: {
    fontSize: moderateScale(11),
  },
  termsLink: {
    marginHorizontal: scale(2),
    padding: scale(1),
  },
  linktext: {fontSize: moderateScale(10), color: COLORS.AstroMaroon},
  register: {
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  flag: {
    fontSize: moderateScale(20),
    marginHorizontal: scale(8),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: 'white',
    padding: scale(20),
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  countryName: {
    fontSize: moderateScale(16),
    marginLeft: scale(10),
  },
  closeText: {
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    marginTop: verticalScale(20),
    fontSize: moderateScale(16),
  },
});
