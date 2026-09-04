import React, {useState, useEffect} from 'react';
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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import {LEGAL_LINKS} from '../../config/legal';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import { showAlert } from '../../Component/CustomAlert';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import GuideAvatar from '../../components/GuideAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sanitizePhoneInput } from '../../utils/phoneInput';

const Login = ({navigation}) => {
  const { t, language, changeLanguage } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const toggleLanguage = () => changeLanguage(language === 'Hindi' ? 'English' : 'Hindi');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, SetLoading] = useState(false);
  // Admin-editable via the dashboard's Guide Avatar page (GET /api/guide-avatar/config) —
  // null while loading, so the hint stays hidden rather than flashing the bundled
  // default text before the real config arrives.
  const [guideAvatarConfig, setGuideAvatarConfig] = useState(null);

  // Top of the login funnel. Everything downstream (submit -> otp sent -> verified ->
  // completed) is a percentage of this, so without it a drop-off has no denominator.
  useEffect(() => {
    captureEvent('login_screen_viewed');
  }, []);

  useEffect(() => {
    let cancelled = false;
    Instance.get('/api/guide-avatar/config')
      .then((res) => { if (!cancelled) setGuideAvatarConfig(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const validateFields = () => {
    if (!phoneNumber) {
      captureEvent('login_validation_failed', { reason: 'phone_empty' });
      showAlert(t('login.validationError'), t('login.phoneEmpty'), 'error');
      return false;
    }
    if (phoneNumber.length < 10) {
      captureEvent('login_validation_failed', { reason: 'phone_too_short' });
      showAlert(
        t('login.validationError'),
        t('login.phoneTooShort'),
        'error'
      );
      return false;
    }
    return true;
  };

  const handleGetOtp = async () => {
    if (validateFields()) {
      captureEvent('login_submit_tapped');
      SetLoading(true);
      try {
        const res = await Instance.post('/api/users/mobile-otp-request', {
          phoneNumber,
          role: 'customer',
          intent: 'login',
        });
        if (res?.data?.success) {
          captureEvent('login_otp_sent');
          navigation.navigate('VerifyOtp', { phoneNumber, role: 'customer' });
        } else {
          captureEvent('login_failed', { reason: res?.data?.code || 'otp_send_failed' });
          showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
        }
      } catch (error) {
        if (error?.response?.data?.code === 'NO_ACCOUNT') {
          captureEvent('login_failed', { reason: 'no_account' });
          showAlert(
            t('login.noAccountTitle'),
            t('login.noAccountMsg'),
            'error'
          );
        } else {
          console.log('Login error:', error);
          captureEvent('login_failed', { reason: error?.response?.data?.code || 'other' });
          showAlert(t('common.error'), error?.response?.data?.message || t('login.somethingWrong'), 'error');
        }
      } finally {
        SetLoading(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.main}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <TouchableOpacity
        onPress={() => {
          captureEvent('language_toggled', { from: language, screen: 'login' });
          toggleLanguage();
        }}
        activeOpacity={0.7}
        style={[styles.langPill, { top: insets.top + verticalScale(12) }]}>
        <Text style={[styles.langPillText, language === 'English' && styles.langPillTextActive]}>EN</Text>
        <Text style={styles.langPillDivider}>|</Text>
        <Text style={[styles.langPillText, language === 'Hindi' && styles.langPillTextActive]}>हिं</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo2.jpeg')}
            style={styles.logo}
          />
          <Text style={styles.title}>Astrowani</Text>
          <Text style={styles.subTitle}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.loginContainer}>
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>{t('login.discoverPath')}</Text>
          </View>

          <View style={styles.inputContainer}>
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
              style={[styles.input, styles.phoneInput]}
              maxLength={12}
              placeholder={t('login.phoneNumber')}
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
              value={phoneNumber}
              // Was maxLength={10} with no filtering — pasting a number with the
              // country code truncated it to the first 10 CHARACTERS, silently
              // dropping real digits, rather than cleaning it up. See
              // utils/phoneInput.js.
              onChangeText={(text) => setPhoneNumber(sanitizePhoneInput(text))}
            />
          </View>

          <TouchableOpacity
            style={[styles.otpBtn, loading && styles.disabledBtn]}
            disabled={loading}
            onPress={handleGetOtp}>
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.btnTxt}>{t('login.continue')}</Text>
            )}
          </TouchableOpacity>

          {/* Both links were TouchableOpacity with no onPress — they rendered as
              links and did nothing on tap. */}
          <View style={styles.termsView}>
            <Text style={styles.termsText}>
              {t('login.agreeTerms')}
            </Text>
            <TouchableOpacity
              style={styles.termsLink}
              onPress={() => {
                captureEvent('legal_link_opened', { link: 'terms', screen: 'login' });
                Linking.openURL(LEGAL_LINKS.termsOfUse).catch(() => {});
              }}>
              <Text style={styles.linktext}>{t('settings.termsOfUse')}</Text>
            </TouchableOpacity>
            <Text style={styles.termsText}>{t('login.and')}</Text>
            <TouchableOpacity
              style={styles.termsLink}
              onPress={() => {
                captureEvent('legal_link_opened', { link: 'privacy', screen: 'login' });
                Linking.openURL(LEGAL_LINKS.privacyPolicy).catch(() => {});
              }}>
              <Text style={styles.linktext}>{t('settings.privacyPolicy')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <TouchableOpacity onPress={() => {
              captureEvent('auth_mode_switched', { to: 'signup', from: 'login', via: 'inline_link' });
              navigation.navigate('Register');
            }}>
              <Text style={styles.registerText}>{t('login.register')}</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {guideAvatarConfig?.login?.enabled !== false && (
        <GuideAvatar
          storageKey="login"
          message={
            (language === 'Hindi' ? guideAvatarConfig?.login?.textHi : guideAvatarConfig?.login?.textEn)
            || t('login.guideHint')
          }
          alwaysShow
          layout="row"
          position="center"
          bottomOffset={verticalScale(75)}
          avatarSize={scale(115)}
          offsetX={-scale(43)}
          avatarOffsetY={verticalScale(53)}
          boxOffsetY={verticalScale(18)}
          onPress={() => {
            captureEvent('auth_mode_switched', { to: 'signup', from: 'login', via: 'button' });
            navigation.navigate('Register');
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
};

export default Login;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  langPill: {
    position: 'absolute',
    right: scale(20),
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  langPillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  langPillTextActive: {
    color: 'white',
  },
  langPillDivider: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: moderateScale(12),
    marginHorizontal: scale(4),
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: verticalScale(60),
    paddingBottom: verticalScale(20),
  },
  logo: {
    width: scale(100),
    height: verticalScale(100),
    borderRadius: moderateScale(50),
    marginBottom: verticalScale(15),
  },
  title: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '800',
    fontSize: moderateScale(32),
    letterSpacing: scale(1),
    marginBottom: verticalScale(5),
  },
  subTitle: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    fontSize: moderateScale(14),
  },
  loginContainer: {
    backgroundColor: 'white',
    flex: 1,
    width: '100%',
    borderTopLeftRadius: moderateScale(30),
    borderTopRightRadius: moderateScale(30),
    paddingTop: verticalScale(30),
    paddingHorizontal: scale(20),
  },
  taglineContainer: {
    alignSelf: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(25),
    marginTop: verticalScale(-45),
    marginBottom: verticalScale(20),
  },
  tagline: {
    color: 'white',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderRadius: moderateScale(25),
    marginBottom: verticalScale(25),
    padding: moderateScale(3),
  },
  toggleOption: {
    flex: 1,
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(22),
    alignItems: 'center',
  },
  activeToggleOption: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleText: {
    fontSize: moderateScale(14),
    fontWeight: '500',
    color: COLORS.darkGray,
  },
  activeToggleText: {
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: moderateScale(1),
    height: verticalScale(55),
    borderColor: COLORS.lightBorder,
    borderRadius: moderateScale(28),
    marginBottom: verticalScale(20),
    paddingHorizontal: scale(15),
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  inputIcon: {
    marginRight: scale(10),
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(10),
    paddingRight: scale(10),
    borderRightWidth: 1,
    borderRightColor: COLORS.lightBorder,
  },
  callingCode: {
    fontSize: moderateScale(16),
    color: COLORS.AstroMaroon,
    fontWeight: '600',
    marginHorizontal: scale(5),
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: COLORS.textDark,
  },
  phoneInput: {
    marginLeft: scale(10),
  },
  otpBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    height: verticalScale(55),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(28),
    marginBottom: verticalScale(15),
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
    color: 'white',
    fontWeight: 'bold',
    fontSize: moderateScale(16),
  },
  termsView: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: verticalScale(25),
  },
  termsText: {
    fontSize: moderateScale(12),
    color: COLORS.textLight,
  },
  termsLink: {
    padding: scale(1),
  },
  linktext: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: verticalScale(30),
  },
  footerText: {
    fontSize: moderateScale(14),
    color: COLORS.textLight,
  },
  registerText: {
    fontSize: moderateScale(18),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
  },
  flag: {
    fontSize: moderateScale(20),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: scale(20),
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: verticalScale(15),
    textAlign: 'center',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  countryName: {
    fontSize: moderateScale(16),
    marginLeft: scale(10),
    color: COLORS.textDark,
  },
  closeButton: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(10),
    marginTop: verticalScale(15),
  },
  closeText: {
    textAlign: 'center',
    color: 'white',
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
});
