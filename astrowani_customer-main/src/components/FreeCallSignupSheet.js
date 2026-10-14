// The whole sign-up, inside one small card, raised over the free-call panel.
//
// WHY IT EXISTS. A visitor who arrives from the campaign gift reveal lands on the
// free-call screen SIGNED OUT (screens/FreeCall/InstantAstrologers.js). They can see
// the astrologers; they cannot ring one. The moment they reach for anybody — the card,
// "Call free", "Notify me", it makes no difference — this comes up.
//
// THE POINT IS THAT THE PANEL NEVER LEAVES THE SCREEN. Sending them to Login/OTP/Name
// takes away the faces they just chose between and replaces them with a form, and the
// three-screen stack gives no sense of how much is left. Here the astrologers stay
// visible behind the card, the card says the call is already theirs, and it promises a
// number — THIRTY SECONDS — which is the one claim the whole thing is built around.
// Every step below is sized to keep that promise honest: phone, the code, the name.
// The referral box is optional and says so.
//
// It is the same three API calls the full flow makes, in the same order, with the same
// payloads — /api/users/mobile-otp-request, /api/users/mobile-otp-verify,
// PUT /api/users/profile (+ the best-effort referral apply). Nothing about the account
// it creates differs from one made on the Login screen; only the surface does. A
// second sign-up path that wrote accounts its own way would drift from the real one
// the first time either changed, so this one deliberately does not.
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';

import Instance from '../api/ApiCall';
import { COLORS } from '../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent, identifyCustomer } from '../utils/Analytics';
import { getAcquisition } from '../utils/acquisition';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';
// The success tick only. The sheet's own CTA is the app's standard maroon: green is
// this screen's language for "free and available" and belongs to the card's "Call free"
// button, which is the thing being offered. A second green button of equal weight,
// sitting over those cards, competes with it — every other button in the app that moves
// you through a form is maroon, and this is a form.
const FREE_GREEN = '#137A43';
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * The notification token, exactly as VerifyOtp fetches it: only when permission
 * already exists. Asking for notifications in the middle of a sign-up the customer
 * was promised would take thirty seconds is the worst possible moment for it, and a
 * "no" here is permanent. The free-call flow asks later, where it has a reason.
 */
async function getFcmTokenIfAllowed() {
  try {
    const { PermissionsAndroid } = require('react-native');
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (!granted) return '';
    }
    const messaging = require('@react-native-firebase/messaging').default;
    return (await messaging().getToken()) || '';
  } catch (_) {
    return '';
  }
}

export default function FreeCallSignupSheet({ visible, onClose, onDone }) {
  const { t } = useContext(LanguageContext);

  const [step, setStep] = useState('phone'); // phone | otp | name
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [referral, setReferral] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Guards the network calls rather than `busy`: state lands a frame late, and the
  // double tap that matters happens inside that frame.
  const inFlight = useRef(false);
  const tokenRef = useRef('');
  // Funnel milestones are reported ONCE each. Without these latches, "filled the
  // phone number" would count a keystroke rather than a person: every edit after the
  // tenth digit re-fires, and a step that can fire repeatedly makes the funnel read
  // as though more people reached it than reached the step before it.
  const phoneFilledRef = useRef(false);
  const otpFilledRef = useRef(false);

  // NO entrance animation on the card, deliberately. It used to pop in on a
  // native-driver spring, and the Animated node sitting inside a <Modal> + a
  // KeyboardAvoidingView was re-parented the moment the keyboard opened over the
  // phone field — which threw "connectAnimatedNodes: Animated node with tag (parent)
  // does not exist" and red-boxed the app on the very first field. The Modal's own
  // animationType="fade" already gives the sheet an entrance; a second, hand-rolled
  // one bought nothing and cost the whole screen.
  useEffect(() => {
    if (!visible) return undefined;
    captureEvent('free_call_signup_sheet_shown', { step: 'phone' });
    return undefined;
  }, [visible]);

  // Reset only once the sheet is fully gone. Clearing on the way out would blank the
  // fields in front of the customer during the dismiss animation.
  useEffect(() => {
    if (visible) return undefined;
    const id = setTimeout(() => {
      setStep('phone'); setOtp(''); setName(''); setReferral('');
      setError(''); setBusy(false); setResendIn(0);
      inFlight.current = false;
      phoneFilledRef.current = false;
      otpFilledRef.current = false;
    }, 250);
    return () => clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const fail = (message, reason) => {
    setError(message);
    captureEvent('free_call_signup_failed', { step, reason: reason || 'other' });
  };

  /* ── Step 1: the number ─────────────────────────────────────────────────── */
  const sendOtp = async (isResend) => {
    if (inFlight.current) return;
    const digits = phone.replace(/\D/g, '');
    // The TAP, reported before anything can refuse it. `_otp_sent` below only fires
    // when the server actually accepted, so the gap between these two is "asked for a
    // code and did not get one" — invisible if the funnel only counted successes.
    if (!isResend) captureEvent('free_call_signup_otp_tapped');
    if (digits.length !== 10) {
      fail(t('freeCallSignup.phoneInvalid'), 'phone_invalid');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      // NO `intent`. The backend only enforces "this number must/must not already
      // exist" when the caller names a flow (index.js mobile-otp-request): `signup`
      // refuses an existing number with ACCOUNT_EXISTS, `login` refuses a new one with
      // NO_ACCOUNT. This sheet is BOTH — the app has never had separate login and
      // sign-up journeys, and a returning customer reaching for a free call must get
      // their code, not "please log in instead" on a screen with nowhere to log in.
      // Omitted, the server sends the code either way; `isNewAccount` on verify is
      // what decides whether the name step is needed.
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber: digits,
        role: 'customer',
      });
      if (res?.data?.success) {
        captureEvent('free_call_signup_otp_sent', { resend: !!isResend });
        setStep('otp');
        setResendIn(RESEND_SECONDS);
      } else {
        fail(res?.data?.message || t('freeCallSignup.otpFailed'), res?.data?.code);
      }
    } catch (err) {
      const data = err?.response?.data;
      // A code is already on its way and still valid — carry on to the box rather
      // than making them wait out a throttle for an SMS they have in hand.
      if (data?.code === 'OTP_THROTTLED' && data?.codeStillValid) {
        setStep('otp');
        setResendIn(Number(data?.retryAfterSeconds) || RESEND_SECONDS);
      } else {
        fail(data?.message || t('freeCallSignup.otpFailed'), data?.code);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  /* ── Step 2: the code ───────────────────────────────────────────────────── */
  const verify = async (filled) => {
    const code = (typeof filled === 'string' ? filled : otp).replace(/\D/g, '');
    if (inFlight.current) return;
    if (code.length !== OTP_LENGTH) {
      if (typeof filled === 'string') return; // autosubmit, not a tap — stay quiet
      fail(t('freeCallSignup.otpIncomplete'), 'otp_incomplete');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      // In parallel: neither can reject, so this costs the slower of the two rather
      // than the sum. getAcquisition resolves to nulls on iOS and on any build
      // without the native referrer module.
      const [fcmToken, acq] = await Promise.all([getFcmTokenIfAllowed(), getAcquisition()]);
      const res = await Instance.post('/api/users/mobile-otp-verify', {
        phoneNumber: phone.replace(/\D/g, ''),
        otp: code,
        fcmToken,
        role: 'customer',
        acquisitionSource: acq.acquisitionSource,
        acquisitionRaw: acq.acquisitionRaw,
        // The sheet carries the same terms notice the Login screen does, so the
        // acceptance is recorded the same way.
        termsAccepted: true,
      });
      if (res?.data?.success && res?.data?.token) {
        tokenRef.current = res.data.token;
        await AsyncStorage.setItem('token', res.data.token);
        if (res.data.user?.id) {
          await AsyncStorage.setItem('customerId', String(res.data.user.id));
          identifyCustomer(res.data.user.id);
        }
        captureEvent('signup_otp_verified', { via: 'free_call_sheet' });
        captureEvent('signup_completed', { via: 'free_call_sheet' });

        // An account that already existed has a name already. Asking a returning
        // customer to retype it — and overwriting what they had with it — is the
        // bug the full flow avoids with the same check.
        if (res.data.isNewAccount === false) {
          if (res.data.user) {
            await AsyncStorage.setItem('userData', JSON.stringify(res.data.user));
          }
          finish(res.data.user?.name || '');
          return;
        }
        setStep('name');
      } else {
        fail(res?.data?.message || t('freeCallSignup.otpWrong'), 'otp_rejected');
      }
    } catch (err) {
      const data = err?.response?.data;
      // Both of these burn the code server-side, so no further guess can work.
      // Unlock Resend at once instead of running out a countdown on a dead code.
      if (data?.code === 'OTP_ATTEMPTS_EXCEEDED' || data?.code === 'ACCOUNT_LOOKUP_FAILED') {
        setOtp('');
        setResendIn(0);
      }
      fail(data?.message || t('freeCallSignup.otpWrong'), data?.code);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  /**
   * Back to the number, with it still in the box so a typo is one character to fix
   * rather than ten to retype. Without this a mistyped digit was a dead end: the
   * sheet has no back button and the only way out was to close it and start again.
   * The full sign-up flow has had this all along (VerifyOtp's "Change Phone Number"),
   * which is why this reuses that screen's label rather than inventing a second one.
   */
  const changeNumber = () => {
    if (inFlight.current) return;
    captureEvent('free_call_signup_change_number');
    setStep('phone');
    setOtp('');
    setError('');
    // The code already sent stays valid, and the server's own throttle still applies
    // if they ask for another — but the countdown belonged to the old number, and
    // leaving it running would block a legitimate first send to a corrected one.
    setResendIn(0);
  };

  /* ── Step 3: the name (and, optionally, a friend's code) ────────────────── */
  const saveName = async () => {
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      fail(t('freeCallSignup.needName'), 'name_empty');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    const auth = { headers: { Authorization: `Bearer ${tokenRef.current}` } };
    try {
      const res = await Instance.put('/api/users/profile', { name: trimmed }, auth);
      const updated = res?.data?.data;
      if (!res?.data?.success || !updated) throw new Error('save_failed');
      await AsyncStorage.setItem('userData', JSON.stringify(updated));
      captureEvent('signup_name_saved', { via: 'free_call_sheet' });

      // Best effort and never blocking: a mistyped code must not stand between a new
      // customer and the call they were promised. The reward is the referrer's.
      const code = referral.trim().toUpperCase();
      if (code) {
        try {
          await Instance.post('/api/customer/referral/apply', { referralCode: code }, auth);
          captureEvent('referral_code_applied', { at: 'free_call_sheet' });
        } catch (e) {
          captureEvent('referral_code_rejected', {
            at: 'free_call_sheet',
            reason: e?.response?.data?.code || 'other',
          });
        }
      }
      finish(trimmed);
    } catch (err) {
      fail(t('freeCallSignup.nameFailed'), err?.response?.data?.code || 'name_save_failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const finish = (finalName) => {
    captureEvent('free_call_signup_sheet_completed');
    Keyboard.dismiss();
    onDone?.(finalName);
  };

  const primary = () => {
    if (step === 'phone') return sendOtp(false);
    if (step === 'otp') return verify();
    return saveName();
  };

  const ctaLabel = step === 'phone'
    ? t('freeCallSignup.sendOtp')
    : step === 'otp' ? t('freeCallSignup.verify') : t('freeCallSignup.startCall');

  // 1 of 3, 2 of 3, 3 of 3 — three dots, because "how much is left" is the whole
  // reassurance and a bare form answers it with nothing.
  const stepIndex = step === 'phone' ? 0 : step === 'otp' ? 1 : 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.close}
            onPress={() => {
              // WHERE they gave up is the whole value of this event. "Closed the
              // sign-up" tells you nothing; "closed it on the OTP step" tells you the
              // code is not arriving.
              captureEvent('free_call_signup_sheet_dismissed', { step });
              onClose?.();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
          >
            <Icon name="close" size={moderateScale(18)} color={COLORS.AstroMaroon} />
          </TouchableOpacity>

          <View style={styles.tick}>
            <Icon name="check-circle" size={moderateScale(30)} color={FREE_GREEN} />
          </View>

          <Text style={styles.title}>{t('freeCallSignup.title')}</Text>
          {/* One line, always. It is a supporting line under the headline, and at two
              lines it competed with the headline and pushed the 30-second promise —
              the thing that actually earns the next tap — further down the card.
              adjustsFontSizeToFit rather than truncation, so a longer translation
              shrinks slightly instead of losing its last word to an ellipsis. */}
          {/* minimumFontScale is what keeps this honest: the line is long enough that
              adjustsFontSizeToFit would otherwise shrink it to unreadable on a narrow
              phone rather than admit it does not fit. At 0.75 it stops shrinking and
              wraps instead — ugly on a 4" screen, but still legible, which is the
              better failure. */}
          <Text style={styles.sub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {t('freeCallSignup.sub')}
          </Text>

          {/* The promise, given its own line and its own weight. It is the reason
              anybody gets past the first field. */}
          <View style={styles.promise}>
            <Icon name="timer" size={moderateScale(14)} color={COLORS.AstroMaroon} />
            <Text style={styles.promiseTxt}>{t('freeCallSignup.thirtySeconds')}</Text>
          </View>

          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i <= stepIndex && styles.dotOn]} />
            ))}
          </View>

          {step === 'phone' && (
            <View style={styles.fieldRow}>
              <Text style={styles.prefix}>+91</Text>
              <TextInput
                style={styles.fieldInput}
                value={phone}
                onChangeText={(v) => {
                  const digits = v.replace(/\D/g, '').slice(0, 10);
                  setPhone(digits);
                  setError('');
                  if (digits.length === 10 && !phoneFilledRef.current) {
                    phoneFilledRef.current = true;
                    captureEvent('free_call_signup_phone_filled');
                  }
                }}
                placeholder={t('freeCallSignup.phonePlaceholder')}
                placeholderTextColor="#B9A693"
                keyboardType="number-pad"
                maxLength={10}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => sendOtp(false)}
              />
            </View>
          )}

          {step === 'otp' && (
            <>
              <Text style={styles.sentTo}>
                {t('freeCallSignup.sentTo', { phone: phone.replace(/\D/g, '') })}
              </Text>
              <TextInput
                style={[styles.field, styles.otpField]}
                value={otp}
                onChangeText={(v) => {
                  const digits = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
                  setOtp(digits);
                  setError('');
                  if (digits.length === OTP_LENGTH && !otpFilledRef.current) {
                    otpFilledRef.current = true;
                    // `autofilled` separates a code the phone read from the SMS from
                    // one that was typed — very different friction, same step.
                    // Empty one moment and six digits the next means it was pasted
                    // or autofilled; typing arrives a digit at a time.
                    captureEvent('free_call_signup_otp_filled', { autofilled: !otp });
                  }
                  // Verify the moment the last digit lands — typed, pasted or
                  // autofilled. One fewer tap inside a thirty-second promise.
                  if (digits.length === OTP_LENGTH) verify(digits);
                }}
                placeholder={t('freeCallSignup.otpPlaceholder')}
                placeholderTextColor="#B9A693"
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                autoFocus
              />
              <View style={styles.otpLinks}>
                <TouchableOpacity
                  disabled={resendIn > 0 || busy}
                  onPress={() => sendOtp(true)}
                  style={styles.linkBtn}
                >
                  <Text style={[styles.resend, resendIn > 0 && styles.resendOff]}>
                    {resendIn > 0
                      ? t('freeCallSignup.resendIn', { seconds: resendIn })
                      : t('freeCallSignup.resend')}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.linkSep}>·</Text>
                <TouchableOpacity disabled={busy} onPress={changeNumber} style={styles.linkBtn}>
                  <Text style={styles.resend}>{t('otp.changeNumber')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'name' && (
            <>
              <TextInput
                style={styles.field}
                value={name}
                onChangeText={(v) => { setName(v); setError(''); }}
                placeholder={t('freeCallSignup.namePlaceholder')}
                placeholderTextColor="#B9A693"
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <TextInput
                style={[styles.field, styles.referralField]}
                value={referral}
                onChangeText={setReferral}
                placeholder={t('freeCallSignup.referralPlaceholder')}
                placeholderTextColor="#B9A693"
                autoCapitalize="characters"
                maxLength={12}
              />
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.cta, busy && styles.ctaBusy]}
            activeOpacity={0.88}
            onPress={primary}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.ctaTxt}>{ctaLabel}</Text>
                <Icon name="arrow-forward" size={moderateScale(17)} color={COLORS.white} />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>{t('freeCallSignup.legal')}</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 4, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(22),
  },
  card: {
    width: '100%',
    backgroundColor: CREAM,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  close: { position: 'absolute', top: verticalScale(10), right: scale(10), padding: scale(6), zIndex: 5 },
  tick: { alignItems: 'center', marginBottom: verticalScale(6) },
  title: {
    fontFamily: 'Poppins-Bold',
    fontSize: moderateScale(17),
    color: COLORS.AstroMaroon,
    textAlign: 'center',
  },
  sub: {
    fontFamily: 'Poppins-Regular',
    // Sized so the full line fits without adjustsFontSizeToFit having to do much —
    // auto-shrinking is the safety net, not the plan.
    fontSize: moderateScale(10.5),
    // Lighter than the headline on purpose: this line supports it, it does not
    // compete with it.
    color: '#9A8574',
    textAlign: 'center',
    marginTop: verticalScale(4),
  },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: scale(5),
    backgroundColor: COLORS.AstroGold,
    paddingHorizontal: scale(11),
    paddingVertical: verticalScale(5),
    borderRadius: moderateScale(14),
    marginTop: verticalScale(10),
  },
  promiseTxt: {
    fontFamily: 'Poppins-Bold',
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
  },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: scale(6), marginTop: verticalScale(12) },
  dot: {
    width: scale(18), height: verticalScale(3.5), borderRadius: 3,
    backgroundColor: '#E6D6C6',
  },
  dotOn: { backgroundColor: COLORS.AstroMaroon },
  field: {
    marginTop: verticalScale(12),
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: Platform.OS === 'ios' ? verticalScale(12) : verticalScale(8),
    fontFamily: 'Poppins-Regular',
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
  },
  fieldRow: {
    marginTop: verticalScale(12),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
  },
  prefix: {
    fontFamily: 'Poppins-Bold',
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
    marginRight: scale(8),
  },
  fieldInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? verticalScale(12) : verticalScale(8),
    fontFamily: 'Poppins-Regular',
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
    letterSpacing: 1,
  },
  otpField: { textAlign: 'center', letterSpacing: moderateScale(8), fontFamily: 'Poppins-Bold' },
  referralField: { marginTop: verticalScale(8) },
  sentTo: {
    fontFamily: 'Poppins-Regular',
    fontSize: moderateScale(11.5),
    color: '#6B4A36',
    textAlign: 'center',
    marginTop: verticalScale(10),
  },
  otpLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  linkBtn: { paddingVertical: verticalScale(6), paddingHorizontal: scale(4) },
  linkSep: { color: '#C7B3A1', fontSize: moderateScale(11.5) },
  resend: { fontFamily: 'Poppins-Bold', fontSize: moderateScale(11.5), color: COLORS.AstroMaroon },
  resendOff: { color: '#B9A693' },
  error: {
    fontFamily: 'Poppins-Regular',
    fontSize: moderateScale(11.5),
    color: '#C0392B',
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
  cta: {
    marginTop: verticalScale(14),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(7),
    minHeight: verticalScale(44),
  },
  ctaBusy: { opacity: 0.8 },
  ctaTxt: { fontFamily: 'Poppins-Bold', fontSize: moderateScale(14), color: COLORS.white },
  legal: {
    fontFamily: 'Poppins-Regular',
    fontSize: moderateScale(9.5),
    color: '#9A8574',
    textAlign: 'center',
    marginTop: verticalScale(9),
    lineHeight: moderateScale(14),
  },
});
