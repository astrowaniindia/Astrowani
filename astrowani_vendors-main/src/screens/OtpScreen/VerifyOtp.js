import React, {useEffect, useRef, useState} from 'react';
import {
  StyleSheet,
  Image,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {OtpInput} from 'react-native-otp-entry';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../api/SupabaseClient';

const RESEND_SECONDS = 60;

// Real Supabase UUIDs are the only ids that ever come back from verify — the fallback
// (no astrologer row yet, i.e. this phone number is signing up) is a synthetic `user_<ts>`.
const isRealId = (id) => typeof id === 'string' && id.includes('-');

const VerifyOtp = ({navigation, route}) => {
  const {phoneNumber, role = 'astrologer', registrationData} = route?.params || {};

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const otpRef = useRef(null);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = time => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Runs only for a brand-new number (no astrologer row found during verify) — creates
  // the account now that the phone number is actually proven, using the details collected
  // on the Registration screen.
  const finishRegistration = async () => {
    if (!registrationData) {
      Alert.alert('Error', 'Missing registration details. Please fill the form again.');
      navigation.navigate('Registration');
      return;
    }
    const {error} = await supabase.from('astrologers').insert([registrationData]);
    if (error) throw error;
    navigation.reset({index: 0, routes: [{name: 'Thankyou'}]});
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the complete 6-digit code.');
      return;
    }
    setVerifying(true);
    try {
      const res = await Instance.post('/api/users/mobile-otp-verify', {
        phoneNumber,
        otp: code,
        role,
      });
      if (res?.data?.success && res?.data?.token) {
        if (isRealId(res.data.user?.id)) {
          // Existing astrologer — real login.
          await AsyncStorage.setItem('token', res.data.token);
          await AsyncStorage.setItem('astroId', String(res.data.user.id));
          navigation.reset({index: 0, routes: [{name: 'DrawerNavigator'}]});
        } else {
          // New number — phone is now verified, create the actual account.
          await finishRegistration();
        }
      } else {
        Alert.alert('Verification Failed', res?.data?.message || 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      const message = error?.response?.data?.message || error.message || 'Failed to verify OTP. Please try again.';
      Alert.alert('Verification Failed', message);
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || resending) return;
    setResending(true);
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber,
        role,
      });
      if (res?.data?.success) {
        setCode('');
        otpRef.current?.clear?.();
        setTimer(RESEND_SECONDS);
        Alert.alert('OTP Sent', 'A new code has been sent to your number.');
      } else {
        Alert.alert('Error', res?.data?.message || 'Could not resend OTP.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.main}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Image
            source={require('../../assets/images/logo1.png')}
            style={styles.logo}
          />
          <Text style={styles.title}>Verify Your Number</Text>
          <Text style={styles.subTitle}>
            Enter the 6-digit code sent to{' '}
            {phoneNumber ? `+91 ${phoneNumber}` : 'your number'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>Almost There!</Text>
          </View>

          <View style={styles.otpWrapper}>
            <OtpInput
              ref={otpRef}
              numberOfDigits={6}
              onTextChange={setCode}
              focusColor={COLORS.AstroMaroon}
              theme={{
                containerStyle: styles.otpContainer,
                pinCodeContainerStyle: styles.otpBox,
                focusedPinCodeContainerStyle: styles.otpBoxFocused,
                pinCodeTextStyle: styles.otpText,
              }}
            />
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, verifying && styles.disabledBtn]}
            disabled={verifying}
            onPress={handleVerify}>
            {verifying ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnTxt}>Verify OTP</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendView}>
            <Text style={styles.resendText}>
              {timer > 0 ? `Resend OTP in ${formatTime(timer)}` : "Didn't receive the OTP?"}
            </Text>
            {timer === 0 && (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                <Text style={styles.resendLink}>
                  {resending ? 'Sending...' : 'Resend OTP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.changeNumberBtn}
            onPress={() => navigation.goBack()}>
            <Text style={styles.changeNumberText}>Change Phone Number</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default VerifyOtp;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: verticalScale(60),
    paddingBottom: verticalScale(20),
    paddingHorizontal: scale(20),
  },
  backBtn: {
    position: 'absolute',
    top: verticalScale(60),
    left: scale(20),
    padding: scale(4),
  },
  logo: {
    width: scale(80),
    height: verticalScale(80),
    borderRadius: moderateScale(40),
    marginBottom: verticalScale(15),
  },
  title: {
    textAlign: 'center',
    color: COLORS.white,
    fontWeight: '800',
    fontSize: moderateScale(22),
    marginBottom: verticalScale(8),
  },
  subTitle: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    fontSize: moderateScale(13),
    paddingHorizontal: scale(20),
  },
  card: {
    backgroundColor: COLORS.white,
    flex: 1,
    width: '100%',
    borderTopLeftRadius: moderateScale(30),
    borderTopRightRadius: moderateScale(30),
    paddingTop: verticalScale(30),
    paddingHorizontal: scale(20),
    alignItems: 'center',
  },
  taglineContainer: {
    alignSelf: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(25),
    marginTop: verticalScale(-45),
    marginBottom: verticalScale(30),
  },
  tagline: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  otpWrapper: {
    width: '100%',
    marginBottom: verticalScale(30),
  },
  otpContainer: {
    width: '100%',
  },
  otpBox: {
    width: scale(45),
    height: scale(50),
    borderRadius: moderateScale(12),
    borderWidth: moderateScale(1.5),
    borderColor: COLORS.AshGray,
    backgroundColor: COLORS.whiteSeasalt || '#FAFAFA',
  },
  otpBoxFocused: {
    borderColor: COLORS.AstroMaroon,
    backgroundColor: COLORS.white,
  },
  otpText: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: COLORS.black,
  },
  verifyBtn: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(55),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(28),
    marginBottom: verticalScale(20),
    shadowColor: COLORS.AstroMaroon,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  disabledBtn: {
    backgroundColor: COLORS.gray,
  },
  btnTxt: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: moderateScale(16),
  },
  resendView: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(15),
  },
  resendText: {
    fontSize: moderateScale(13),
    color: COLORS.gray,
    marginRight: scale(5),
  },
  resendLink: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  changeNumberBtn: {
    marginTop: 'auto',
    marginBottom: verticalScale(30),
  },
  changeNumberText: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
