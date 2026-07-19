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
  TextInput,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {OtpInput} from 'react-native-otp-entry';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {showAlert} from '../../Component/CustomAlert';
import messaging from '@react-native-firebase/messaging';
import {LanguageContext} from '../../context/LanguageContext';

const RESEND_SECONDS = 60;

const VerifyOtp = ({navigation, route}) => {
  const {t} = React.useContext(LanguageContext);
  const {phoneNumber, role = 'customer', profileData} = route?.params || {};

  const [code, setCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
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

  const getFcmToken = async () => {
    try {
      return (await messaging().getToken()) || '';
    } catch (e) {
      return '';
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      showAlert(t('otp.invalidOtpTitle'), t('otp.enterComplete'), 'error');
      return;
    }
    setVerifying(true);
    try {
      const fcmToken = await getFcmToken();
      const res = await Instance.post('/api/users/mobile-otp-verify', {
        phoneNumber,
        otp: code,
        fcmToken,
        role,
        referralCode: referralCode.trim() || undefined,
      });
      if (res?.data?.success && res?.data?.token) {
        await AsyncStorage.setItem('token', res.data.token);

        // Signup flow (Register screen) — apply the details collected before OTP verify
        // now that we have a real auth token to call the profile endpoint with.
        if (profileData) {
          try {
            let profilePic = profileData.profilePic;
            if (profilePic && profilePic.startsWith('data:')) {
              const uploadRes = await Instance.post(
                '/api/upload-image',
                {base64: profilePic, folder: 'customer-profiles'},
                {headers: {Authorization: `Bearer ${res.data.token}`}}
              );
              profilePic = uploadRes.data.url;
            }
            await Instance.put(
              '/api/users/profile',
              {...profileData, profilePic},
              {headers: {Authorization: `Bearer ${res.data.token}`}}
            );
          } catch (profileErr) {
            // Account is created and verified either way — a profile-save hiccup
            // shouldn't strand the user on the OTP screen; they can fill it in later.
            console.log('Failed to save registration details:', profileErr.message);
          }
        }

        navigation.reset({index: 0, routes: [{name: 'DrawerNavigator'}]});
      } else {
        showAlert(t('otp.verificationFailed'), res?.data?.message || t('otp.invalidTryAgain'), 'error');
      }
    } catch (error) {
      const message = error?.response?.data?.message || t('otp.failedVerify');
      showAlert(t('otp.verificationFailed'), message, 'error');
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
        showAlert(t('otp.otpSentTitle'), t('otp.newCodeSent'), 'success');
      } else {
        showAlert(t('common.error'), res?.data?.message || t('otp.couldNotResend'), 'error');
      }
    } catch (error) {
      showAlert(t('common.error'), t('otp.couldNotResendRetry'), 'error');
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
            source={require('../../assets/images/logo2.jpeg')}
            style={styles.logo}
          />
          <Text style={styles.title}>{t('otp.verifyTitle')}</Text>
          <Text style={styles.subTitle}>
            {t('otp.enterCodeSentTo')}
            {phoneNumber ? `+91 ${phoneNumber}` : t('otp.yourNumber')}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>{t('otp.almostThere')}</Text>
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

          {!!profileData && (
            <TextInput
              style={styles.referralInput}
              placeholder="Referral code (optional)"
              placeholderTextColor="#999"
              value={referralCode}
              onChangeText={(t) => setReferralCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={10}
            />
          )}

          <TouchableOpacity
            style={[styles.verifyBtn, verifying && styles.disabledBtn]}
            disabled={verifying}
            onPress={handleVerify}>
            {verifying ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnTxt}>{t('otp.verifyBtn')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendView}>
            <Text style={styles.resendText}>
              {timer > 0 ? t('otp.resendIn', {time: formatTime(timer)}) : t('otp.notReceived')}
            </Text>
            {timer === 0 && (
              <TouchableOpacity onPress={handleResend} disabled={resending}>
                <Text style={styles.resendLink}>
                  {resending ? t('otp.sending') : t('otp.resend')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.changeNumberBtn}
            onPress={() => navigation.goBack()}>
            <Text style={styles.changeNumberText}>{t('otp.changeNumber')}</Text>
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
    fontSize: moderateScale(24),
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
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.whiteSeasalt,
  },
  otpBoxFocused: {
    borderColor: COLORS.AstroMaroon,
    backgroundColor: COLORS.white,
  },
  otpText: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: COLORS.textDark,
  },
  referralInput: {
    width: '100%',
    height: verticalScale(48),
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(16),
    fontSize: moderateScale(14),
    color: COLORS.textDark,
    backgroundColor: '#FAFAFA',
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
    color: COLORS.textLight,
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
