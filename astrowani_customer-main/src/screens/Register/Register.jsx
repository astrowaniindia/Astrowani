// Sign-up, step 1 of 3: mobile number only.
//
// The flow is now:  mobile number -> OTP (VerifyOtp) -> name (SignupName) ->
// welcome (SignupWelcome) -> Home.
//
// WHY SO SHORT. This used to be a three-step wizard asking for a photo, name,
// gender, date/time/place of birth, mobile, email and terms before a single OTP
// was sent. Every field before the phone number was a place to quit, and a
// customer who quit left nothing behind — not even a number to reach them on.
// Asking for the number FIRST means the account exists after ~20 seconds.
//
// Birth details are no longer asked here at all. They are asked when the
// customer first tries something that needs them (chat, call, video, the free
// chat, the free call booking) and on the Profile screen — see
// utils/profileGate.js and UserProfileScreen. Email and photo are never required.
import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import {apiFailureReason} from '../../utils/apiFailureReason';
import { sanitizePhoneInput } from '../../utils/phoneInput';
import TermsAcceptance from '../../components/TermsAcceptance';

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const GUIDE_AVATAR_ASPECT = 145 / 281;

export default function Register({ navigation }) {
  const { t, language } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  // Admin-editable via the dashboard's Guide Avatar page (GET /api/guide-avatar/config).
  const [guideAvatarConfig, setGuideAvatarConfig] = useState(null);
  const [mobile, setMobile] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Top of the signup funnel.
  useEffect(() => {
    captureEvent('signup_screen_viewed');
  }, []);

  useEffect(() => {
    let cancelled = false;
    Instance.get('/api/guide-avatar/config')
      .then((res) => { if (!cancelled) setGuideAvatarConfig(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Returns [userFacingMessage, analyticsReason]. The message is translated, so
  // it cannot double as the analytics value — it would split one bucket across
  // languages and could never be compared. `signup_step_blocked` used to carry
  // no reason at all, which made "28 people were blocked here" unactionable:
  // there was no way to tell an unticked terms box from a short phone number.
  const validate = () => {
    if (!mobile.trim()) return [t('register.enterMobile'), 'phone_empty'];
    if (mobile.length < 10) return [t('register.validMobile'), 'phone_too_short'];
    if (!acceptedTerms) return [t('register.acceptRequired'), 'terms_not_accepted'];
    return [null, null];
  };

  const handleSubmit = async () => {
    const [err, blockReason] = validate();
    if (err) {
      captureEvent('signup_step_blocked', { step: 1, reason: blockReason });
      showAlert(t('register.errorTitle'), err, 'error');
      return;
    }
    captureEvent('signup_submit_tapped');
    setSubmitting(true);
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber: mobile,
        role: 'customer',
        intent: 'signup',
      });
      if (res?.data?.success) {
        captureEvent('signup_otp_sent');
        navigation.navigate('VerifyOtp', {
          phoneNumber: mobile,
          role: 'customer',
          signup: true,
          // Recorded on the new account row by the backend at insert time.
          termsAccepted: true,
        });
      } else {
        captureEvent('signup_failed', { reason: res?.data?.code || 'otp_send_failed' });
        showAlert(t('register.errorTitle'), res?.data?.message || t('register.otpFailed'), 'error');
      }
    } catch (error) {
      const data = error?.response?.data;
      if (data?.code === 'OTP_THROTTLED' && data?.codeStillValid) {
        // See Login.js: a live code exists, so carry on to the OTP screen rather
        // than dead-ending on the phone-number step.
        captureEvent('signup_otp_already_sent', {
          retryAfterSeconds: data?.retryAfterSeconds ?? null,
        });
        showAlert(t('otp.alreadySentTitle'), t('otp.alreadySentMsg'), 'success');
        navigation.navigate('VerifyOtp', {
          phoneNumber: mobile,
          role: 'customer',
          signup: true,
          termsAccepted: true,
          resendIn: data?.retryAfterSeconds,
        });
      } else if (data?.code === 'ACCOUNT_EXISTS') {
        captureEvent('signup_failed', { reason: 'account_exists' });
        showAlert(
          t('register.accountExists'),
          t('register.accountExistsMsg'),
          'error',
          () => navigation.navigate('Login'),
        );
      } else {
        console.error(error);
        captureEvent('signup_failed', { reason: apiFailureReason(error) });
        // The server's message is kept when present: it can carry specifics a
        // generic line would lose (e.g. how long to wait before another OTP).
        showAlert(t('register.errorTitle'), data?.message || t('register.somethingWrong'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    captureEvent('signup_abandoned', { step: 1 });
    navigation.goBack();
  };

  const guideEnabled = guideAvatarConfig?.register?.enabled !== false;
  const adminMessage = language === 'Hindi'
    ? guideAvatarConfig?.register?.textHi
    : guideAvatarConfig?.register?.textEn;
  const guideMessage = adminMessage || t('register.guideMobile');

  return (
    // NOT SafeAreaView: the insets are applied manually to the header and footer,
    // and SafeAreaView would count both edges a second time.
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f3f1" />

      <View style={[styles.header, { paddingTop: insets.top + verticalScale(10) }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-back" size={moderateScale(26)} color={COLORS.AstroMaroon} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('register.title')}</Text>
      </View>

      {/* No keyboardVerticalOffset: this KAV is not the screen root, and an offset
          here leaks as permanent padding on iOS after the keyboard closes. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* style={{flex: 1}} + flexGrow: 1 keep the footer at the bottom on iOS. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>{t('register.signupTitle')}</Text>
          <Text style={styles.stepSub}>{t('register.signupSub')}</Text>

          {guideEnabled && (
            <View style={styles.guideRow}>
              <Image
                source={require('../../assets/images/guideAvatarLogin.png')}
                style={styles.guideAvatarImg}
                resizeMode="contain"
              />
              <View style={styles.guideBubble}>
                <View style={styles.guideTail} />
                <Text style={styles.guideText}>{guideMessage}</Text>
              </View>
            </View>
          )}

          <Text style={styles.fieldLabel}>{t('register.mobileLabel')}</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder={t('register.mobileNumber')}
              placeholderTextColor="#9b8f8a"
              value={mobile}
              keyboardType="phone-pad"
              onChangeText={(text) => setMobile(sanitizePhoneInput(text))}
              maxLength={12}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          <TermsAcceptance
            accepted={acceptedTerms}
            onChange={setAcceptedTerms}
            style={styles.terms}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(10) }]}>
          <TouchableOpacity
            style={[styles.nextBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{t('register.getOtp')}</Text>
                <Icon name="arrow-forward" size={moderateScale(18)} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f3f1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(18),
    paddingBottom: verticalScale(10),
    backgroundColor: '#f7f3f1',
  },
  backButton: { padding: scale(5), marginRight: scale(10) },
  title: { fontSize: moderateScale(20), fontWeight: 'bold', color: COLORS.AstroMaroon },

  scroll: { paddingHorizontal: scale(18), paddingTop: verticalScale(18), paddingBottom: verticalScale(24) },
  stepTitle: { fontSize: moderateScale(22), fontWeight: 'bold', color: '#2b1a12' },
  stepSub: { fontSize: moderateScale(13), color: '#8a7c76', marginTop: verticalScale(4), lineHeight: moderateScale(19) },

  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(18),
    marginBottom: verticalScale(8),
  },
  guideAvatarImg: { width: scale(46), aspectRatio: GUIDE_AVATAR_ASPECT },
  guideBubble: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(12),
    marginLeft: scale(10),
    borderWidth: 1,
    borderColor: '#ecd9cf',
  },
  guideTail: {
    position: 'absolute',
    left: -scale(6),
    top: '45%',
    width: 0,
    height: 0,
    borderTopWidth: scale(6),
    borderBottomWidth: scale(6),
    borderRightWidth: scale(7),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#fff',
  },
  guideText: { fontSize: moderateScale(13), color: '#4a3a32', lineHeight: moderateScale(19) },

  fieldLabel: {
    fontSize: moderateScale(12.5),
    color: '#5c4a42',
    marginTop: verticalScale(16),
    marginBottom: verticalScale(6),
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: '#ecdfd8',
    paddingHorizontal: scale(14),
  },
  phonePrefix: {
    fontSize: moderateScale(15),
    color: '#5c4a42',
    fontWeight: '600',
    marginRight: scale(8),
    paddingRight: scale(8),
    borderRightWidth: 1,
    borderRightColor: '#ecdfd8',
    paddingVertical: verticalScale(13),
  },
  phoneInput: { flex: 1, fontSize: moderateScale(15), color: '#2b1a12', paddingVertical: verticalScale(13) },

  terms: { marginTop: verticalScale(20) },

  footer: {
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(10),
    backgroundColor: '#f7f3f1',
    borderTopWidth: 1,
    borderTopColor: '#ece1db',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    minHeight: verticalScale(50),
  },
  nextBtnText: {
    color: '#fff',
    fontSize: moderateScale(15.5),
    fontWeight: 'bold',
    marginRight: scale(7),
  },
});
