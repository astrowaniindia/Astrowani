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
  BackHandler,
  NativeModules,
  PermissionsAndroid,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {OtpInput} from 'react-native-otp-entry';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {showAlert} from '../../Component/CustomAlert';
import messaging from '@react-native-firebase/messaging';
import {identifyCustomer, captureEvent} from '../../utils/Analytics';
import {apiFailureReason} from '../../utils/apiFailureReason';
import {getAcquisition} from '../../utils/acquisition';
import {LanguageContext} from '../../context/LanguageContext';

// True only on Android builds that include the SMS User Consent native module.
const SMS_AUTOFILL_AVAILABLE = Platform.OS === 'android' && !!NativeModules.ReactNativeSmsUserConsent;

const RESEND_SECONDS = 60;

const VerifyOtp = ({navigation, route}) => {
  const {t} = React.useContext(LanguageContext);
  // `signup` is set by the Register screen. Signup now collects only the phone
  // number before OTP; the name is asked on the next screen (SignupName) once the
  // account exists, and birth details are asked later, when they are needed.
  const {phoneNumber, role = 'customer', signup, termsAccepted, resendIn} =
    route?.params || {};
  const isSignup = !!signup;

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  // Blocks a second verify while one is in flight (auto-verify on the 6th digit
  // plus a quick tap on the button would otherwise send two).
  const verifyingRef = useRef(false);
  const handleVerifyRef = useRef(null);
  const [smsListenKey, setSmsListenKey] = useState(0);
  const [resending, setResending] = useState(false);
  // Set synchronously on the first tap. The `resending` state can't do this on its
  // own: state only updates on the next render, so two taps in the same frame both
  // read resending=false and both reached the server. The server still sent only
  // one SMS, but the loser's 429 appeared as an error popup right after
  // "New code sent". The ref makes the second tap a no-op.
  const resendInFlight = useRef(false);
  // Normally a fresh 60s. When we arrived here because the server refused to
  // send ANOTHER code (the live one is still good), start from its remaining
  // cooldown instead — clamped, since it is attacker-influenced input and a
  // silly value would strand the customer behind a countdown.
  const [timer, setTimer] = useState(() => {
    const n = Number(resendIn);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), RESEND_SECONDS) : RESEND_SECONDS;
  });
  const otpRef = useRef(null);

  // `flow` splits every event on this shared screen into the signup and login funnels —
  // the screen is identical for both, and blending them hides which one is leaking.
  const flow = isSignup ? 'signup' : 'login';

  useEffect(() => {
    captureEvent('otp_screen_viewed', { flow });
    const onBack = () => {
      captureEvent('otp_back_tapped', { flow });
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // On Android 13+ getToken() makes Firebase ask for POST_NOTIFICATIONS there and
      // then — which is why the "Allow Astrowani to send you notifications?" dialog was
      // landing on the OTP screen, before the customer had been given any reason to say
      // yes. The first thing they see in the app should not be a permission request they
      // have no context for; a "no" here is permanent and costs every later reminder.
      //
      // So the token is only fetched once permission already exists. Otherwise it is
      // skipped, and the free-call booking asks later (FreeCallOffer.afterBooked), where
      // "we will remind you about your call" is an actual reason — and
      // requestUserPermission() fetches and syncs the token the moment it is granted
      // (getFCMToken in utils/PushNotification.js), so nothing is lost by waiting.
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (!granted) return '';
      }
      return (await messaging().getToken()) || '';
    } catch (e) {
      return '';
    }
  };

  // `filled` is the code handed over by the OTP box itself when the 6th digit lands
  // (typed, pasted, or autofilled from the SMS): verification then starts on its
  // own, with no "Verify" tap. The button still works, and passes an event instead.
  const handleVerify = async (filled) => {
    const auto = typeof filled === 'string';
    const otpCode = auto ? filled : code;
    if (verifyingRef.current) return;
    if (otpCode.length !== 6) {
      if (auto) return;
      captureEvent('otp_verify_blocked', { flow, reason: 'incomplete_code', length: otpCode.length });
      showAlert(t('otp.invalidOtpTitle'), t('otp.enterComplete'), 'error');
      return;
    }
    captureEvent('otp_verify_tapped', { flow, auto });
    verifyingRef.current = true;
    setVerifying(true);
    try {
      // In parallel, so the referrer read costs no extra wait. getAcquisition never
      // throws and resolves to nulls on iOS, on a build without the native module, or
      // if Play takes too long — so Promise.all here can only be settled by getFcmToken.
      const [fcmToken, acq] = await Promise.all([getFcmToken(), getAcquisition()]);
      const res = await Instance.post('/api/users/mobile-otp-verify', {
        phoneNumber,
        otp: otpCode,
        fcmToken,
        role,
        // Which QR poster / ad this install came from. Sent on BOTH the signup and
        // login paths on purpose: the login screen's own notice also creates accounts
        // for a new number (see termsAccepted's 'login_notice' branch in the backend),
        // so gating this on isSignup would drop attribution for anyone who tapped
        // Login. The backend records it only when it actually creates the row.
        acquisitionSource: acq.acquisitionSource,
        acquisitionRaw: acq.acquisitionRaw,
        // Labels the acceptance as having come from the Register screen's
        // checkbox rather than the Login screen's notice. The backend stamps the
        // actual timestamp itself — this flag only picks which source to record.
        termsAccepted: !!termsAccepted,
      });
      if (res?.data?.success && res?.data?.token) {
        await AsyncStorage.setItem('token', res.data.token);
        if (res.data.user?.id) {
          await AsyncStorage.setItem('customerId', String(res.data.user.id));
          identifyCustomer(res.data.user.id);
        }

        // An EXISTING account that came in through the signup screen (the store
        // reviewer number, or a returning customer the server let through) is a
        // login: straight to Home, no name step overwriting their name. Only an
        // explicit false counts, so an older backend without the flag behaves as before.
        const existingViaSignup = isSignup && res.data.isNewAccount === false;
        if (isSignup && !existingViaSignup) {
          // The account exists from this point, so this is where signup is
          // "completed" (it also feeds the ad platforms' registration event).
          // Name and welcome come next, but a customer who closes the app on the
          // name screen is still a real, signed-in account.
          captureEvent('signup_otp_verified');
          captureEvent('signup_completed');
          navigation.reset({index: 0, routes: [{name: 'SignupName'}]});
        } else {
          captureEvent('login_completed');
          // A brief "Namaste ji" welcome-back before Home (2026-09-23) -- distinct
          // from the new-signup gift screen: no free-call offer check here, and
          // SignupWelcome auto-advances instead of waiting for a tap when
          // route.params.isLogin is set. Kept in the same reset (not a push) so
          // back from Home still lands outside this stack, same as before.
          navigation.reset({index: 0, routes: [{name: 'SignupWelcome', params: { isLogin: true }}]});
        }
      } else {
        captureEvent(isSignup ? 'signup_failed' : 'login_failed', { reason: 'otp_verify_rejected' });
        showAlert(t('otp.verificationFailed'), res?.data?.message || t('otp.invalidTryAgain'), 'error');
      }
    } catch (error) {
      const data = error?.response?.data;
      // A wrong code is an HTTP 400, which axios throws on, so it lands here —
      // reporting a flat 'otp_verify_error' put "wrong code", "expired",
      // "attempts used up" and "network died" into one analytics bucket, which
      // is what made the failure-reasons card unreadable. Prefer the server's
      // own code; keep the old value only when there is no response at all.
      captureEvent(isSignup ? 'signup_failed' : 'login_failed', {
        reason: apiFailureReason(error),
      });
      // Past the attempt cap the server burns the code, so no further guess can
      // ever succeed — the only way forward is a new OTP. Unlock Resend at once
      // rather than leaving the customer waiting out a countdown for a code
      // that is already dead.
      if (data?.code === 'OTP_ATTEMPTS_EXCEEDED') {
        captureEvent('otp_attempts_exceeded', { flow });
        setCode('');
        otpRef.current?.clear?.();
        setTimer(0);
      }
      const message = data?.message || t('otp.failedVerify');
      showAlert(t('otp.verificationFailed'), message, 'error');
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  handleVerifyRef.current = handleVerify;

  // Android: read the OTP straight from the SMS (Google's SMS User Consent API).
  // When the code arrives Android shows its own "Allow Astrowani to read this
  // message?" prompt; one tap fills the boxes and verification starts by itself.
  // Needs no SMS permission and works with the DLT-registered SMS text as it is.
  // The native module only exists from the store build that added it, so older
  // installs (reached by OTA) skip this and keep manual entry. `smsListenKey`
  // restarts the listener after a resend, since each listen covers one message.
  useEffect(() => {
    if (Platform.OS !== 'android' || !NativeModules.ReactNativeSmsUserConsent) return undefined;
    let stop = null;
    try {
      const { startSmsHandling, retrieveVerificationCode } = require('@eabdullazyanov/react-native-sms-user-consent');
      stop = startSmsHandling((event) => {
        const found = retrieveVerificationCode(event?.sms, 6);
        if (!found) return;
        captureEvent('otp_autofilled_from_sms', { flow });
        otpRef.current?.setValue?.(found);
        setCode(found);
        handleVerifyRef.current?.(found);
      });
    } catch (_) {
      stop = null;
    }
    return () => {
      try { if (stop) stop(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smsListenKey]);

  const handleResend = async () => {
    if (timer > 0 || resending || resendInFlight.current) return;
    // A high resend rate is the classic signature of OTP SMS not arriving — the exact
    // failure this project has hit before (see the OTP non-delivery memory). Worth
    // being able to watch as a rate, not just as support tickets.
    captureEvent('otp_resend_tapped', { flow });
    setResending(true);
    resendInFlight.current = true;
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber,
        role,
      });
      if (res?.data?.success) {
        captureEvent('otp_resent', { flow });
        setCode('');
        otpRef.current?.clear?.();
        setSmsListenKey((k) => k + 1);
        setTimer(RESEND_SECONDS);
        showAlert(t('otp.otpSentTitle'), t('otp.newCodeSent'), 'success');
      } else {
        captureEvent('otp_resend_failed', { flow, reason: res?.data?.code || 'other' });
        showAlert(t('common.error'), res?.data?.message || t('otp.couldNotResend'), 'error');
      }
    } catch (error) {
      // The server owns the real cooldown (per-number and DB-backed); this
      // screen's countdown is only a UI hint and drifts out of step with it —
      // e.g. after an app restart, or when the same number was used on another
      // device. When the server throttles, adopt ITS retryAfterSeconds so the
      // button unlocks exactly when a resend will actually be accepted, and
      // show its message instead of swallowing it behind a generic failure.
      const data = error?.response?.data;
      captureEvent('otp_resend_failed', { flow, reason: data?.code || 'other', throttled: !!data?.retryAfterSeconds });
      if (data?.retryAfterSeconds) setTimer(data.retryAfterSeconds);
      showAlert(t('common.error'), data?.message || t('otp.couldNotResendRetry'), 'error');
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.main}
      // Android: undefined. The manifest's adjustResize already moves the screen for the
      // keyboard; 'height' here fought it and the layout flickered up and down,
      // often leaving a grey gap at the bottom after the keyboard closed.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* style={{flex:1}} required on iOS, not just contentContainerStyle -- see
          CLAUDE.md subsystem BG and Login.js's identical fix. */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              captureEvent('otp_back_tapped', { flow });
              navigation.goBack();
            }}>
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
              onFilled={handleVerify}
              focusColor={COLORS.AstroMaroon}
              theme={{
                containerStyle: styles.otpContainer,
                pinCodeContainerStyle: styles.otpBox,
                focusedPinCodeContainerStyle: styles.otpBoxFocused,
                pinCodeTextStyle: styles.otpText,
              }}
            />
            {/* Only where the SMS auto-fill exists (Android, build 43+), so no phone
                is promised something it cannot do. Prepares the customer for
                Android's own "Allow ... to read this message?" prompt, whose
                wording apps cannot change. */}
            {SMS_AUTOFILL_AVAILABLE && (
              <Text style={styles.smsHint}>{t('otp.smsAutofillHint')}</Text>
            )}
          </View>


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
  scrollView: {
    flex: 1,
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
  smsHint: {
    marginTop: verticalScale(12),
    fontSize: moderateScale(13),
    color: '#2E7D4F',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: moderateScale(19),
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
