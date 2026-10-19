// The whole sign-up, as one card floating over the free 11-minute panel.
//
// WHY IT EXISTS (owner, 2026-10-17). The gift reveal ends with "YOU WIN — 11 minutes
// free", and until now the very next thing the visitor saw was a full-screen maroon
// phone-number form. The prize vanished off the screen at the exact moment we asked
// for something, which reads as the catch. Now the reveal hands straight over to the
// free-call panel itself — real astrologers, real faces — and this card rises over
// the bottom of it. The prize stays visible BEHIND the form the whole way through, so
// the sign-up reads as the last step of collecting something they already won rather
// than as a gate in front of it.
//
// IT CANNOT BE DISMISSED, DELIBERATELY. There is no ✕ and `onRequestClose` is a no-op,
// so Android back does nothing. The astrologers behind are visible but not reachable —
// the screen underneath renders them inert in guest mode. That was the explicit
// decision: the panel is the reward being shown, not a thing to browse first.
//
// ALL THREE STEPS LIVE IN THIS ONE CARD — phone, OTP, name. Handing off to the
// existing Login / VerifyOtp / SignupName screens for any of them would navigate the
// panel away and bring back the exact problem this replaces. The card swaps its own
// contents instead and the screen behind never moves.
//
// THE NETWORK CALLS ARE THE SAME ONES THOSE SCREENS MAKE, deliberately unchanged:
//   POST /api/users/mobile-otp-request   (intent login, falling back to signup on
//                                         NO_ACCOUNT — same single-field rule as
//                                         Login.js, so one number works either way)
//   POST /api/users/mobile-otp-verify    (same acquisition + termsAccepted payload,
//                                         same token/customerId storage)
//   PUT  /api/users/profile              (the name, same as SignupName.js)
// Nothing new is asked of the backend. If the sign-up rules change, they change in
// those endpoints and this card follows for free.
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  PermissionsAndroid,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { OtpInput } from 'react-native-otp-entry';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';

import Instance from '../api/ApiCall';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { showAlert } from '../Component/CustomAlert';
import { captureEvent, identifyCustomer } from '../utils/Analytics';
import { apiFailureReason } from '../utils/apiFailureReason';
import { getAcquisition } from '../utils/acquisition';
import { DEVICE_PLATFORM } from '../utils/devicePlatform';
import { sanitizePhoneInput } from '../utils/phoneInput';
import { LEGAL_LINKS } from '../config/legal';
import openExternalUrl from '../utils/openExternalUrl';

// The same green the free-call panel behind uses for "available now", so the badge
// belongs to that screen rather than looking like a notification from somewhere else.
const FREE_GREEN = '#137A43';

const RESEND_SECONDS = 60;
// One full ripple, dot to faded edge.
const WAVE_MS = 1900;
const MAX_NAME_LENGTH = 60;

/**
 * Identical to VerifyOtp.getFcmToken, and identical for the same reason: on Android 13+
 * `getToken()` is what raises the notification permission dialog, and raising it here —
 * over a gift the customer has not finished claiming — buys a permanent "no" for every
 * later reminder. Only read the token when permission already exists; the free-call
 * booking asks later, where there is a reason to say yes.
 */
async function getFcmToken() {
  try {
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
}

export default function SignupGatePopup({ visible, onDone }) {
  const { t } = useContext(LanguageContext);

  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'name'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // Optional, and applied only AFTER the name is saved — see saveName. Same field,
  // same endpoint and same best-effort handling as SignupName.js, so the two ways
  // into an account cannot disagree about how a referral is redeemed.
  const [referralCode, setReferralCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);

  // Synchronous guards. `busy` is state and only lands on the next render, so two taps
  // in the same frame both read false and both reach the server — the same bug that
  // was fixed on VerifyOtp's resend button. These make the second tap a no-op.
  const busyRef = useRef(false);
  const resendRef = useRef(false);
  const otpRef = useRef(null);
  const referralRef = useRef(null);
  const rise = useRef(new Animated.Value(0)).current;
  // Two rings leaving the green dot, the second half a cycle behind the first, so the
  // badge reads as a ripple on water rather than as one pulsing circle.
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    captureEvent('signup_gate_shown');
    Animated.timing(rise, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, rise]);

  useEffect(() => {
    if (!visible) return undefined;
    const ring = (v) => Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: WAVE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    const a = ring(wave1);
    const b = ring(wave2);
    a.start();
    // Staggered by starting late rather than by an Animated.delay INSIDE the loop:
    // a delay in the loop body is paid on every repeat, which would space this ring
    // 1.5x further apart each cycle instead of holding it half a beat behind.
    const t = setTimeout(() => b.start(), WAVE_MS / 2);
    return () => { clearTimeout(t); a.stop(); b.stop(); wave1.setValue(0); wave2.setValue(0); };
  }, [visible, wave1, wave2]);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const id = setInterval(() => setTimer((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Android SMS User Consent, exactly as VerifyOtp uses it: the code fills itself and
  // verifies with no tap. The native module only exists from the store build that
  // added it, so an older install reached by OTA simply types the code by hand.
  const verifyRef = useRef(null);
  useEffect(() => {
    if (step !== 'otp') return undefined;
    if (Platform.OS !== 'android' || !NativeModules.ReactNativeSmsUserConsent) return undefined;
    let stop = null;
    try {
      const {
        startSmsHandling,
        retrieveVerificationCode,
      } = require('@eabdullazyanov/react-native-sms-user-consent');
      stop = startSmsHandling((event) => {
        const found = retrieveVerificationCode(event?.sms, 6);
        if (!found) return;
        captureEvent('otp_autofilled_from_sms', { flow: 'signup_gate' });
        otpRef.current?.setValue?.(found);
        setCode(found);
        verifyRef.current?.(found);
      });
    } catch (_) {
      stop = null;
    }
    return () => {
      try { if (stop) stop(); } catch (_) {}
    };
  }, [step]);

  // ── Step 1: the number ─────────────────────────────────────────────────────
  const sendOtp = async (intent) => Instance.post('/api/users/mobile-otp-request', {
    phoneNumber,
    role: 'customer',
    intent,
  });

  const submitPhone = async () => {
    if (busyRef.current) return;
    if (phoneNumber.length < 10) {
      showAlert(t('login.validationError'), t('login.phoneTooShort'), 'error');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    captureEvent('signup_gate_phone_submitted');
    const toOtp = (seconds) => {
      setCode('');
      otpRef.current?.clear?.();
      setTimer(Math.min(Math.ceil(Number(seconds) || RESEND_SECONDS), RESEND_SECONDS));
      captureEvent('signup_gate_otp_shown');
      setStep('otp');
    };
    try {
      const res = await sendOtp('login');
      if (res?.data?.success) {
        captureEvent('signup_gate_otp_sent', { intent: 'login' });
        toOtp();
      } else {
        showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
      }
    } catch (error) {
      const data = error?.response?.data;
      if (data?.code === 'NO_ACCOUNT') {
        // A new number. The server refuses a LOGIN code before any account exists and
        // has sent nothing, so send the SIGNUP one and carry straight on — no second
        // screen, no "please register first". Same rule as Login.js.
        try {
          const res = await sendOtp('signup');
          if (res?.data?.success) {
            captureEvent('signup_gate_otp_sent', { intent: 'signup' });
            toOtp();
          } else {
            showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
          }
        } catch (err) {
          const d = err?.response?.data;
          if (d?.code === 'OTP_THROTTLED' && d?.codeStillValid) {
            toOtp(d?.retryAfterSeconds);
          } else {
            captureEvent('signup_gate_failed', { step: 'phone', reason: apiFailureReason(err) });
            showAlert(t('common.error'), d?.message || t('login.somethingWrong'), 'error');
          }
        }
      } else if (data?.code === 'OTP_THROTTLED' && data?.codeStillValid) {
        // A live code already exists for this number. Sending another would cost an
        // SMS and kill the one already in their inbox — move to the boxes instead and
        // seed the countdown with the server's own remaining time, so Resend unlocks
        // exactly when a resend will actually be accepted.
        toOtp(data?.retryAfterSeconds);
      } else {
        captureEvent('signup_gate_failed', { step: 'phone', reason: apiFailureReason(error) });
        showAlert(t('common.error'), data?.message || t('login.somethingWrong'), 'error');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (timer > 0 || resendRef.current) return;
    resendRef.current = true;
    captureEvent('otp_resend_tapped', { flow: 'signup_gate' });
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber,
        role: 'customer',
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
      const data = error?.response?.data;
      // The server owns the real cooldown; this card's countdown is only a hint and
      // drifts out of step with it. Adopt the server's number when it throttles.
      if (data?.retryAfterSeconds) setTimer(data.retryAfterSeconds);
      showAlert(t('common.error'), data?.message || t('otp.couldNotResendRetry'), 'error');
    } finally {
      resendRef.current = false;
    }
  };

  // ── Step 2: the code ───────────────────────────────────────────────────────
  const verify = async (filled) => {
    const otpCode = typeof filled === 'string' ? filled : code;
    if (busyRef.current) return;
    if (otpCode.length !== 6) {
      if (typeof filled === 'string') return;
      showAlert(t('otp.invalidOtpTitle'), t('otp.enterComplete'), 'error');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      // In parallel: getAcquisition never throws and resolves to nulls on iOS or on a
      // build without the native module, so only getFcmToken can hold this up.
      const [fcmToken, acq] = await Promise.all([getFcmToken(), getAcquisition()]);
      const res = await Instance.post('/api/users/mobile-otp-verify', {
        phoneNumber,
        otp: otpCode,
        fcmToken,
        role: 'customer',
        acquisitionSource: acq.acquisitionSource,
        acquisitionRaw: acq.acquisitionRaw,
        // iPhone or Android. Recorded on the customer row so the admin can tell the two
        // store listings apart — see utils/devicePlatform.js. Unlike acquisition above
        // this is never null, which is the point: it is the only platform signal an
        // iPhone can give us at all.
        devicePlatform: DEVICE_PLATFORM,
        // The line under the Continue button is the acceptance, same as Login's notice.
        termsAccepted: true,
      });
      if (res?.data?.success && res?.data?.token) {
        await AsyncStorage.setItem('token', res.data.token);
        if (res.data.user?.id) {
          await AsyncStorage.setItem('customerId', String(res.data.user.id));
          identifyCustomer(res.data.user.id);
        }
        // An existing account coming through here is a LOGIN: it already has a name,
        // and asking again would overwrite it with whatever they type. Only an
        // explicit false counts, so an older backend without the flag behaves as the
        // signup path did before.
        const isNew = res.data.isNewAccount !== false;
        if (isNew) {
          captureEvent('signup_otp_verified');
          captureEvent('signup_completed');
          if (res.data.user) {
            await AsyncStorage.setItem('userData', JSON.stringify(res.data.user));
          }
          // The last step, and the one with no second chance: a customer who closes
          // the app here already HAS an account, so they never come back through this
          // card and never appear in signup_name_saved. Without this stage the funnel
          // would report them as having dropped at OTP, which they did not.
          captureEvent('signup_gate_name_shown');
          setStep('name');
        } else {
          captureEvent('login_completed');
          if (res.data.user) {
            await AsyncStorage.setItem('userData', JSON.stringify(res.data.user));
          }
          finish('login');
        }
      } else {
        showAlert(t('otp.verificationFailed'), res?.data?.message || t('otp.invalidTryAgain'), 'error');
      }
    } catch (error) {
      const data = error?.response?.data;
      captureEvent('signup_gate_failed', { step: 'otp', reason: apiFailureReason(error) });
      // Past the attempt cap, or when the account lookup failed, the code is already
      // burned server-side and no further guess can ever succeed. Unlock Resend at
      // once rather than leaving them waiting out a countdown for a dead code.
      if (data?.code === 'OTP_ATTEMPTS_EXCEEDED' || data?.code === 'ACCOUNT_LOOKUP_FAILED') {
        setCode('');
        otpRef.current?.clear?.();
        setTimer(0);
      }
      showAlert(t('otp.verificationFailed'), data?.message || t('otp.failedVerify'), 'error');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  verifyRef.current = verify;

  // ── Step 3: the name ───────────────────────────────────────────────────────
  const saveName = async () => {
    if (busyRef.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showAlert(t('signupName.errorTitle'), t('signupName.needName'), 'error');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.put(
        '/api/users/profile',
        { name: trimmed },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const updated = res?.data?.data;
      if (!res?.data?.success || !updated) throw new Error('save_failed');
      await AsyncStorage.setItem('userData', JSON.stringify(updated));
      captureEvent('signup_name_saved', { via: 'signup_gate' });

      // DELIBERATELY NEVER BLOCKING, and deliberately after the name is already
      // saved: a wrong, expired or mistyped code must not stop a new customer
      // reaching their free call. Nothing is shown on failure beyond the analytics
      // event — the reward is the referrer's, not theirs, so there is nothing for
      // this person to act on. Same rule as SignupName.js.
      const code = referralCode.trim().toUpperCase();
      if (code) {
        try {
          await Instance.post(
            '/api/customer/referral/apply',
            { referralCode: code },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          captureEvent('referral_code_applied', { at: 'signup_gate' });
        } catch (e) {
          captureEvent('referral_code_rejected', {
            at: 'signup_gate',
            reason: e?.response?.data?.code || 'other',
          });
        }
      }

      finish('signup');
    } catch (err) {
      captureEvent('signup_name_save_failed', { reason: err?.response?.data?.code || 'other' });
      showAlert(t('signupName.errorTitle'), t('signupName.saveFailed'), 'error');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const finish = (how) => {
    captureEvent('signup_gate_completed', { how });
    onDone?.();
  };

  if (!visible) return null;


  const slide = rise.interpolate({
    inputRange: [0, 1],
    outputRange: [verticalScale(420), 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Deliberately a no-op: Android back must not get past this card. See the file
      // header — the panel behind is the prize being shown, not a thing to browse.
      onRequestClose={() => {}}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* A dim rather than a blackout: the astrologers behind have to stay readable,
            since they are the reason the card is worth filling in. Not touchable —
            there is nothing to tap through to. */}
        <View style={styles.scrim} pointerEvents="none" />

        <View style={styles.bottom} pointerEvents="box-none">
          <Animated.View style={[styles.card, { transform: [{ translateY: slide }] }]}>
            {/* The badge gets its OWN line under the grabber rather than sharing one
                with it. Overlaid in the corner it was wide enough — in both languages —
                to cover the grabber completely and crowd the prize chip underneath,
                so the top of the card read as three things fighting for one strip. */}
            <View style={styles.topBar}>
              <View style={styles.grabber} />
              <View style={styles.live}>
                <View style={styles.dotWrap}>
                  {[wave1, wave2].map((w, i) => (
                    <Animated.View
                      key={i}
                      pointerEvents="none"
                      style={[styles.wave, {
                        opacity: w.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.45, 0] }),
                        transform: [{ scale: w.interpolate({ inputRange: [0, 1], outputRange: [1, 3.1] }) }],
                      }]}
                    />
                  ))}
                  <View style={styles.dot} />
                </View>
                <Text style={styles.liveTxt} numberOfLines={1}>{t('signupGate.social')}</Text>
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardBody}
            >
              {step === 'phone' && (
                <>
                  <Text style={styles.title}>{t('signupGate.phoneTitle')}</Text>
                  <Text style={styles.sub}>{t('signupGate.phoneSub')}</Text>

                  {/* The four things a person wants to know before typing a number
                      into anything, answered before they ask. Only on the phone step:
                      by the OTP step they have already decided, and repeating it there
                      would read as protesting too much.
                      BLUE, deliberately not the card's maroon or the badge's green —
                      maroon is this app's "pay / commit" colour on every wallet and
                      checkout button, which is the exact association to avoid on the
                      line that says it costs nothing. */}
                  <View style={styles.trustRow}>
                    {['trustZero', 'trustNoAutopay', 'trustFree', 'trustSafe'].map((k) => (
                      <View key={k} style={styles.trustChip}>
                        <Text style={styles.trustTxt}>{t(`signupGate.${k}`)}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.inputRow}>
                    <View style={styles.cc}>
                      <Text style={styles.flag}>🇮🇳</Text>
                      <Text style={styles.ccTxt}>+91</Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      maxLength={12}
                      keyboardType="phone-pad"
                      placeholder={t('login.phoneNumber')}
                      placeholderTextColor={COLORS.placeholder}
                      value={phoneNumber}
                      onChangeText={(v) => setPhoneNumber(sanitizePhoneInput(v))}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.cta, busy && styles.ctaOff]}
                    disabled={busy}
                    activeOpacity={0.88}
                    onPress={submitPhone}
                  >
                    {busy
                      ? <ActivityIndicator color={COLORS.white} />
                      : <Text style={styles.ctaTxt}>{t('signupGate.sendCode')}</Text>}
                  </TouchableOpacity>

                  <View style={styles.terms}>
                    <Text style={styles.termsTxt}>{t('login.agreeTerms')} </Text>
                    <TouchableOpacity onPress={() => openExternalUrl(LEGAL_LINKS.termsOfUse)}>
                      <Text style={styles.termsLink}>{t('settings.termsOfUse')}</Text>
                    </TouchableOpacity>
                    <Text style={styles.termsTxt}> {t('login.and')} </Text>
                    <TouchableOpacity onPress={() => openExternalUrl(LEGAL_LINKS.privacyPolicy)}>
                      <Text style={styles.termsLink}>{t('settings.privacyPolicy')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 'otp' && (
                <>
                  <Text style={styles.title}>{t('signupGate.otpTitle')}</Text>
                  <Text style={styles.sub}>
                    {t('signupGate.otpSub', { phone: `+91 ${phoneNumber}` })}
                  </Text>

                  <OtpInput
                    ref={otpRef}
                    // Focus (and therefore the keyboard) on BOTH steps after the
                    // first. Only the phone step is left unfocused, because there the
                    // keyboard would cover the astrologers the customer is signing up
                    // to reach before they had chosen to type anything. Past that they
                    // have committed, and making them tap a field they were just sent
                    // to is a step for nothing.
                    autoFocus
                    numberOfDigits={6}
                    focusColor={COLORS.AstroMaroon}
                    onTextChange={setCode}
                    onFilled={(v) => verify(v)}
                    theme={{
                      containerStyle: styles.otpBox,
                      pinCodeContainerStyle: styles.otpCell,
                      pinCodeTextStyle: styles.otpTxt,
                    }}
                  />

                  <TouchableOpacity
                    style={[styles.cta, busy && styles.ctaOff]}
                    disabled={busy}
                    activeOpacity={0.88}
                    onPress={() => verify()}
                  >
                    {busy
                      ? <ActivityIndicator color={COLORS.white} />
                      : <Text style={styles.ctaTxt}>{t('signupGate.verify')}</Text>}
                  </TouchableOpacity>

                  <View style={styles.footRow}>
                    <TouchableOpacity onPress={() => { setStep('phone'); setTimer(0); }}>
                      <Text style={styles.linkTxt}>{t('signupGate.changeNumber')}</Text>
                    </TouchableOpacity>
                    {timer > 0 ? (
                      <Text style={styles.mutedTxt}>{t('signupGate.resendIn', { n: timer })}</Text>
                    ) : (
                      <TouchableOpacity onPress={resend}>
                        <Text style={styles.linkTxt}>{t('signupGate.resend')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              {step === 'name' && (
                <>
                  <Text style={styles.title}>{t('signupGate.nameTitle')}</Text>
                  <Text style={styles.sub}>{t('signupGate.nameSub')}</Text>

                  <View style={styles.inputRow}>
                    <Icon
                      name="person-outline"
                      size={moderateScale(20)}
                      color={COLORS.AstroMaroon}
                      style={styles.nameIcon}
                    />
                    <TextInput
                      style={styles.input}
                      autoFocus
                      maxLength={MAX_NAME_LENGTH}
                      placeholder={t('signupGate.namePlaceholder')}
                      placeholderTextColor={COLORS.placeholder}
                      value={name}
                      onChangeText={setName}
                      onSubmitEditing={() => referralRef.current?.focus()}
                      returnKeyType="next"
                    />
                  </View>

                  {/* Optional, and labelled as optional rather than merely allowed to
                      be blank: an unexplained second box on the last step of a
                      sign-up reads as one more thing being asked for. */}
                  <Text style={styles.referralLabel}>{t('signupName.referralLabel')}</Text>
                  <View style={[styles.inputRow, styles.referralRow]}>
                    <Icon
                      name="card-giftcard"
                      size={moderateScale(19)}
                      color={COLORS.AstroMaroon}
                      style={styles.nameIcon}
                    />
                    <TextInput
                      ref={referralRef}
                      style={styles.input}
                      maxLength={20}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder={t('signupName.referralPlaceholder')}
                      placeholderTextColor={COLORS.placeholder}
                      value={referralCode}
                      onChangeText={setReferralCode}
                      onSubmitEditing={saveName}
                      returnKeyType="done"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.cta, busy && styles.ctaOff]}
                    disabled={busy}
                    activeOpacity={0.88}
                    onPress={saveName}
                  >
                    {busy
                      ? <ActivityIndicator color={COLORS.white} />
                      : <Text style={styles.ctaTxt}>{t('signupGate.start')}</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23, 10, 6, 0.45)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: moderateScale(28),
    borderTopRightRadius: moderateScale(28),
    paddingTop: verticalScale(10),
    // Capped so the panel behind is never fully covered — the prize has to stay in
    // view, which is the whole point of showing the card over it rather than as a screen.
    // Belt and braces behind the content trims above: even a very large system font
    // cannot let this card climb over the astrologers' Call free buttons, which is
    // the whole reason it is a card and not a screen.
    maxHeight: '66%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  topBar: {
    paddingBottom: verticalScale(8),
  },
  grabber: {
    alignSelf: 'center',
    width: scale(44),
    height: verticalScale(4),
    borderRadius: moderateScale(3),
    backgroundColor: '#E6D8CC',
    marginBottom: verticalScale(8),
  },
  live: {
    alignSelf: 'flex-end',
    marginRight: scale(16),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF7EF',
    borderWidth: 1,
    borderColor: '#CFE9DA',
    borderRadius: moderateScale(14),
    paddingLeft: scale(8),
    paddingRight: scale(10),
    paddingVertical: verticalScale(4),
    // Bounded so a long translation cannot reach the opposite edge of the card.
    maxWidth: '82%',
  },
  dotWrap: {
    width: scale(10),
    height: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(7),
  },
  wave: {
    position: 'absolute',
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: FREE_GREEN,
  },
  dot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(4),
    backgroundColor: FREE_GREEN,
  },
  liveTxt: {
    flexShrink: 1,
    color: '#14633C',
    fontWeight: '700',
    fontSize: moderateScale(10),
  },
  cardBody: {
    paddingHorizontal: scale(22),
    paddingBottom: verticalScale(16),
  },
  title: {
    textAlign: 'center',
    color: COLORS.textDark,
    fontWeight: '800',
    fontSize: moderateScale(19),
  },
  sub: {
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: moderateScale(12.5),
    marginTop: verticalScale(4),
    marginBottom: verticalScale(13),
    lineHeight: moderateScale(18),
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: scale(6),
    marginBottom: verticalScale(14),
  },
  trustChip: {
    backgroundColor: '#EDF3FF',
    borderWidth: 1,
    borderColor: '#D3E2FF',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(3),
  },
  trustTxt: {
    color: '#1B5FD9',
    fontWeight: '700',
    fontSize: moderateScale(10.5),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: verticalScale(50),
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    borderRadius: moderateScale(26),
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(12),
  },
  cc: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: scale(10),
    marginRight: scale(10),
    borderRightWidth: 1,
    borderRightColor: COLORS.lightBorder,
  },
  flag: { fontSize: moderateScale(18) },
  ccTxt: {
    marginLeft: scale(5),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    fontSize: moderateScale(15),
  },
  nameIcon: { marginRight: scale(8) },
  referralLabel: {
    color: COLORS.textLight,
    fontSize: moderateScale(11.5),
    fontWeight: '600',
    marginBottom: verticalScale(5),
    marginLeft: scale(4),
  },
  referralRow: { marginBottom: verticalScale(14) },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: COLORS.textDark,
    padding: 0,
  },
  otpBox: { marginBottom: verticalScale(18) },
  otpCell: {
    borderRadius: moderateScale(12),
    borderColor: COLORS.lightBorder,
    width: scale(44),
    height: verticalScale(52),
  },
  otpTxt: {
    fontSize: moderateScale(19),
    fontWeight: '700',
    color: COLORS.textDark,
  },
  cta: {
    height: verticalScale(50),
    borderRadius: moderateScale(26),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.65 },
  ctaTxt: {
    color: COLORS.white,
    fontWeight: '800',
    fontSize: moderateScale(16),
  },
  footRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: verticalScale(16),
  },
  linkTxt: {
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    fontSize: moderateScale(13),
  },
  mutedTxt: {
    color: COLORS.textLight,
    fontSize: moderateScale(13),
  },
  terms: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: verticalScale(11),
  },
  termsTxt: {
    fontSize: moderateScale(11),
    color: COLORS.textLight,
  },
  termsLink: {
    fontSize: moderateScale(11),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
});
