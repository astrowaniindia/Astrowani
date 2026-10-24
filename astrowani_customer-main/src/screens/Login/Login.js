import openExternalUrl from '../../utils/openExternalUrl';
import React, {useState, useEffect, useRef} from 'react';
import {
  StyleSheet,
  Image,
  Text,
  View,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import {LEGAL_LINKS} from '../../config/legal';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import { showAlert } from '../../Component/CustomAlert';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import {apiFailureReason} from '../../utils/apiFailureReason';
import GuideAvatar from '../../components/GuideAvatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sanitizePhoneInput } from '../../utils/phoneInput';
import Svg, { Path } from 'react-native-svg';

// The length of the intro call, as the screen says it out loud. The LIVE value is
// `durationMinutes` inside app_settings.free_call_offer, not this constant and not
// freeCallRoutes.DEFAULTS (see CLAUDE.md DR) -- there is no pre-login endpoint to read
// it from, so if the owner ever changes that row this has to move with it.
const FREE_CALL_MINUTES = 7;
const FREE_CALL_TOPIC_KEYS = ['login.topicLove', 'login.topicCareer', 'login.topicMoney', 'login.topicFamily'];

const Login = ({navigation, route}) => {
  const { t, language, changeLanguage } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const toggleLanguage = () => changeLanguage(language === 'Hindi' ? 'English' : 'Hindi');
  // Set only by CampaignGiftReveal's ACCEPT path. Pressing the cross there, and every
  // other route into this screen, leaves it undefined and renders the ordinary login
  // below -- so the free-call promise is only ever repeated to somebody who just took it.
  const fromCampaign = route?.params?.fromCampaign === true;

  // Tapping a topic chip opens a short note about what that topic covers. The card is
  // positioned ABSOLUTELY under the chip row rather than inserted into the column, so it
  // overlays the guide avatar instead of squeezing him -- the promise block already gives
  // up its height to the keyboard, and pushing it would move the phone field too.
  const [openTopic, setOpenTopic] = useState(null);
  // The chip row's BOTTOM edge inside the wrapper, not its height: the row carries a
  // top margin, so using height alone placed the card that much too high and it sat on
  // the chips.
  const [chipsBottom, setChipsBottom] = useState(0);
  const chipSpans = useRef({});
  const topicAnim = useRef(new Animated.Value(0)).current;

  const toggleTopic = (key) => {
    const next = openTopic === key ? null : key;
    setOpenTopic(next);
    topicAnim.stopAnimation();
    if (next) {
      topicAnim.setValue(0);
      Animated.timing(topicAnim, {
        toValue: 1, duration: 170, useNativeDriver: true,
      }).start();
    } else {
      topicAnim.setValue(0);
    }
  };
  // The guide is the one thing on the free-call screen that can be given up when the
  // keyboard takes half the window. Without this he keeps his share of the space and
  // squeezes the field and the button down behind the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Which of the two login screens this is, stamped on EVERY event the shared submit
  // path emits. Without it the two variants are indistinguishable past the view event,
  // and the one question worth asking -- does the free-call screen convert better than
  // the standard one -- cannot be answered at all. Also handed to VerifyOtp, because
  // the conversion itself (signup_completed / login_completed) is recorded over there.
  const analyticsVariant = fromCampaign ? 'free_call' : 'standard';
  // Prefilled when signup sends a returning customer here.
  const [phoneNumber, setPhoneNumber] = useState(sanitizePhoneInput(route?.params?.phoneNumber || ''));
  const [loading, SetLoading] = useState(false);
  const phoneRef = useRef(null);
  // Admin-editable via the dashboard's Guide Avatar page (GET /api/guide-avatar/config) —
  // null while loading, so the hint stays hidden rather than flashing the bundled
  // default text before the real config arrives.
  const [guideAvatarConfig, setGuideAvatarConfig] = useState(null);

  // Top of the login funnel. Everything downstream (submit -> otp sent -> verified ->
  // completed) is a percentage of this, so without it a drop-off has no denominator.
  useEffect(() => {
    captureEvent('login_screen_viewed', { variant: analyticsVariant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
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
      captureEvent('login_validation_failed', { reason: 'phone_empty', variant: analyticsVariant });
      showAlert(t('login.validationError'), t('login.phoneEmpty'), 'error');
      return false;
    }
    if (phoneNumber.length < 10) {
      captureEvent('login_validation_failed', { reason: 'phone_too_short', variant: analyticsVariant });
      showAlert(
        t('login.validationError'),
        t('login.phoneTooShort'),
        'error'
      );
      return false;
    }
    return true;
  };

  const startSignup = async () => {
    const goOtp = (extra) => navigation.navigate('VerifyOtp', {
      phoneNumber,
      role: 'customer',
      signup: true,
      termsAccepted: true,
      variant: analyticsVariant,
      ...extra,
    });
    try {
      const res = await Instance.post('/api/users/mobile-otp-request', {
        phoneNumber,
        role: 'customer',
        intent: 'signup',
      });
      if (res?.data?.success) {
        captureEvent('signup_otp_sent', { via: 'login_screen', variant: analyticsVariant });
        goOtp();
        return;
      }
      captureEvent('signup_failed', { reason: res?.data?.code || 'otp_send_failed', via: 'login_screen', variant: analyticsVariant });
      showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
    } catch (error) {
      const data = error?.response?.data;
      if (data?.code === 'OTP_THROTTLED' && data?.codeStillValid) {
        captureEvent('signup_otp_already_sent', { via: 'login_screen', variant: analyticsVariant });
        goOtp({ resendIn: data?.retryAfterSeconds });
        return;
      }
      captureEvent('signup_failed', { reason: apiFailureReason(error), via: 'login_screen', variant: analyticsVariant });
      showAlert(t('common.error'), data?.message || t('login.somethingWrong'), 'error');
    }
  };

  const handleGetOtp = async () => {
    if (validateFields()) {
      captureEvent('login_submit_tapped', { variant: analyticsVariant });
      SetLoading(true);
      try {
        const res = await Instance.post('/api/users/mobile-otp-request', {
          phoneNumber,
          role: 'customer',
          intent: 'login',
        });
        if (res?.data?.success) {
          captureEvent('login_otp_sent', { variant: analyticsVariant });
          navigation.navigate('VerifyOtp', { phoneNumber, role: 'customer', variant: analyticsVariant });
        } else {
          captureEvent('login_failed', { reason: res?.data?.code || 'otp_send_failed', variant: analyticsVariant });
          showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
        }
      } catch (error) {
        const data = error?.response?.data;
        if (data?.code === 'NO_ACCOUNT') {
          // A new number: this one screen signs them up too (2026-09-20). Nothing
          // was sent yet (the server refuses a login OTP before any SMS), so send
          // the SIGNUP code and carry on to the OTP screen: no redirect, no popup,
          // no second screen. The notice under Continue ("By signing up, you agree
          // to our Terms of Use & Privacy Policy") is the terms acceptance.
          captureEvent('login_failed', { reason: 'no_account', variant: analyticsVariant });
          await startSignup();
        } else if (data?.code === 'OTP_THROTTLED' && data?.codeStillValid) {
          // A code for this number is already live. Refusing to SEND another is
          // correct (it costs an SMS and kills the code they may already have),
          // but stopping here was a dead end: the customer sat on this screen
          // with a valid OTP in their inbox and no field to type it into, and
          // the only way on was to guess when the cooldown had passed. Go to the
          // OTP screen and seed its resend countdown with the server's own
          // remaining time, so Resend unlocks exactly when it is allowed.
          captureEvent('login_otp_already_sent', {
            retryAfterSeconds: data?.retryAfterSeconds ?? null,
            variant: analyticsVariant,
          });
          showAlert(t('otp.alreadySentTitle'), t('otp.alreadySentMsg'), 'success');
          navigation.navigate('VerifyOtp', {
            phoneNumber,
            role: 'customer',
            variant: analyticsVariant,
            resendIn: data?.retryAfterSeconds,
          });
        } else {
          console.log('Login error:', error);
          captureEvent('login_failed', { reason: apiFailureReason(error), variant: analyticsVariant });
          showAlert(t('common.error'), data?.message || t('login.somethingWrong'), 'error');
        }
      } finally {
        SetLoading(false);
      }
    }
  };

  // ── The free-call login ────────────────────────────────────────────────────
  // Deliberately a SEPARATE return rather than conditionals sprinkled through the
  // ordinary one: the standard screen below is untouched by this work, and the two
  // can be changed independently. Everything that matters -- validation, the OTP
  // call, the loading state, the legal links -- is the shared logic above; only the
  // arrangement differs.
  if (fromCampaign) {
    return (
      <KeyboardAvoidingView
        style={styles.fcMain}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        {/* A PLAIN VIEW, NOT A SCROLLVIEW, and that is the fix for two bugs at once.
            As a ScrollView this content was a few pixels taller than the window, so it
            scrolled: the legal line started life under the navigation bar, and once the
            keyboard had pushed the view up and been dismissed again the scroll position
            stayed there, leaving a brown band at the bottom. Nothing on this screen is
            longer than a screen, so it must not be scrollable -- the guide's zone flexes
            instead, and absorbs whatever space the keyboard or a short display takes. */}
        <View style={styles.fcBody}>

          <View style={[styles.fcTopBar, { paddingTop: insets.top + verticalScale(10) }]}>
            <View style={styles.fcBrand}>
              <Image source={require('../../assets/images/brandStarLogo.png')} style={styles.fcBrandMark} resizeMode="contain" />
              <Text style={styles.fcBrandName}>Astrowani</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                captureEvent('language_toggled', { from: language, screen: 'login_free_call' });
                toggleLanguage();
              }}
              activeOpacity={0.7}
              style={styles.fcLangPill}>
              <Text style={[styles.langPillText, language === 'English' && styles.langPillTextActive]}>EN</Text>
              <Text style={styles.langPillDivider}>|</Text>
              <Text style={[styles.langPillText, language === 'Hindi' && styles.langPillTextActive]}>हिं</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fcPromise}>
            <Text style={styles.fcHeadline}>{t('login.promiseLine1', { minutes: FREE_CALL_MINUTES })}</Text>
            <Text style={styles.fcHeadlineAccent}>{t('login.promiseLine2')}</Text>
            <Text style={styles.fcSub}>{t('login.promiseSub')}</Text>
            <View style={styles.fcChipsWrap}>
              <View
                style={styles.fcChips}
                onLayout={(e) =>
                  setChipsBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
                }>
                {FREE_CALL_TOPIC_KEYS.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={styles.fcChip}
                    activeOpacity={0.75}
                    onPress={() => toggleTopic(key)}
                    onLayout={(e) => {
                      const {x, width} = e.nativeEvent.layout;
                      chipSpans.current[key] = {x, width};
                    }}>
                    <Text style={styles.fcChipText}>{t(key)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!!openTopic && (
                <Animated.View
                  style={[
                    styles.fcTopicCard,
                    {
                      top: chipsBottom + verticalScale(10),
                      opacity: topicAnim,
                      transform: [
                        {
                          translateY: topicAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-verticalScale(6), 0],
                          }),
                        },
                      ],
                    },
                  ]}>
                  {/* Points at the chip that opened it, so the card needs no label to
                      say which topic it belongs to. */}
                  <View
                    style={[
                      styles.fcTopicCaret,
                      {
                        left: Math.max(
                          scale(14),
                          (chipSpans.current[openTopic]?.x || 0) +
                            (chipSpans.current[openTopic]?.width || 0) / 2 -
                            scale(5),
                        ),
                      },
                    ]}
                  />
                  <Text style={styles.fcTopicTitle}>{t(openTopic)}</Text>
                  <Text style={styles.fcTopicBody}>{t(`${openTopic}Info`)}</Text>
                  <TouchableOpacity
                    style={styles.fcTopicClose}
                    hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                    onPress={() => toggleTopic(openTopic)}>
                    <Text style={styles.fcTopicCloseText}>✕</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
          </View>

          {/* The guide holds the middle of the screen open and bleeds off the right
              edge, so he reads as part of the screen rather than placed on it. Hidden
              by the same admin switch that hides him on the standard login. */}
          <View style={styles.fcGuideZone} pointerEvents="none">
            {!keyboardUp && guideAvatarConfig?.login?.enabled !== false && (
              <Image
                source={require('../../assets/images/guideAvatarLogin.png')}
                style={styles.fcGuide}
                resizeMode="contain"
              />
            )}
          </View>

          <View style={[styles.fcForm, { paddingBottom: insets.bottom + verticalScale(20) }]}>
            <View style={styles.fcInputRow}>
              {/* Fixed +91 for the same reason as the standard screen: the backend
                  hardcodes it and the DLT template is India-only. */}
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={styles.fcCallingCode}>+91</Text>
              <View style={styles.fcDivider} />
              <TextInput
                ref={phoneRef}
                style={styles.fcInput}
                maxLength={12}
                placeholder={t('login.phonePlaceholder')}
                placeholderTextColor="rgba(62,27,14,0.38)"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={(text) => setPhoneNumber(sanitizePhoneInput(text))}
                // The visible "Mobile number" label was dropped (owner, 2026-10-20);
                // the field still has to be named for a screen reader.
                accessibilityLabel={t('login.mobileLabel')}
              />
            </View>

            <TouchableOpacity
              style={[styles.fcCta, loading && styles.fcCtaDisabled]}
              disabled={loading}
              activeOpacity={0.85}
              onPress={handleGetOtp}>
              {loading ? (
                <ActivityIndicator color={COLORS.AstroMaroon} />
              ) : (
                <Text style={styles.fcCtaText}>{t('login.claimFreeCall')}</Text>
              )}
            </TouchableOpacity>

            {/* The last thing read before the tap is reassurance, not a legal warning --
                the warning is still here, just no longer the loudest line on the screen.
                The shield carries the meaning before the sentence is read. */}
            <View style={styles.fcReassureRow}>
              <Svg width={scale(13)} height={scale(15)} viewBox="0 0 13 15">
                <Path
                  d="M6.5 1 11.5 3v4c0 3.2-2.1 5.9-5 6.9C3.6 12.9 1.5 10.2 1.5 7V3Z"
                  fill="none"
                  stroke="rgba(255,246,234,0.84)"
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                />
                <Path
                  d="M4.4 7.3 5.9 8.8 8.8 5.9"
                  fill="none"
                  stroke="rgba(255,246,234,0.84)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={styles.fcReassure}>{t('login.verifyOnly')}</Text>
            </View>

            <View style={styles.fcTermsRow}>
              <Text style={styles.fcTermsText}>{t('login.agreeTerms')}</Text>
              <TouchableOpacity
                onPress={() => {
                  captureEvent('legal_link_opened', { link: 'terms', screen: 'login_free_call' });
                  openExternalUrl(LEGAL_LINKS.termsOfUse);
                }}>
                <Text style={styles.fcTermsLink}>{t('settings.termsOfUse')}</Text>
              </TouchableOpacity>
              <Text style={styles.fcTermsText}>{t('login.and')}</Text>
              <TouchableOpacity
                onPress={() => {
                  captureEvent('legal_link_opened', { link: 'privacy', screen: 'login_free_call' });
                  openExternalUrl(LEGAL_LINKS.privacyPolicy);
                }}>
                <Text style={styles.fcTermsLink}>{t('settings.privacyPolicy')}</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.main}
      // Android: undefined. The manifest's adjustResize already moves the screen for the
      // keyboard; 'height' here fought it and the layout flickered up and down,
      // often leaving a grey gap at the bottom after the keyboard closed.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

      {/* style={{flex:1}} is required on iOS, not just contentContainerStyle -- without
          it the ScrollView sizes to its own content instead of claiming the KeyboardAvoidingView's
          full height, leaving a gap of unknown color beneath it. Android fills regardless
          (documented iOS trap, see CLAUDE.md subsystem BG). Confirmed live via Appetize
          (2026-09-22): this, not contentStyle, is what was leaving the strip above the
          home indicator on Login/VerifyOtp. */}
      {/* bounces={false}: the guide is absolutely positioned against the SCREEN (see the
          comment where he is rendered), so he does not move with the content. iOS
          rubber-band scrolling was therefore sliding the wordmark and the number field
          underneath him -- reported from TestFlight 2026-10-24, and visible as the
          avatar overlapping the field halfway through a drag. The content fits the
          screen; the bounce was the only thing moving it. */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContainer}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo2.jpeg')}
            style={styles.logo}
          />
          {/* "Best Astrologer's Team" was dropped here (owner, 2026-10-20): with the
              pill and the guide's bubble underneath it, the top of the screen was four
              stacked lines of text in a row and read as a wall. The pill says the same
              thing better, so the generic one goes. */}
          <Text style={styles.title}>Astrowani</Text>

          {/* THE PILL BELONGS TO THE HEADER, NOT TO THE WHITE SHEET. As a child of the
              sheet it was inside a flex column that the keyboard shrinks, so it was
              squeezed away whenever the keyboard opened -- flexShrink: 0 was not enough,
              because the sheet itself ends up shorter than its own contents. The brown
              header is a fixed block that the keyboard never resizes. Absolutely
              positioned so it adds no height and the seam stays exactly where it was,
              and raised above the sheet, which is a later sibling and would otherwise
              paint over it (elevation is the one that matters on Android). */}
          <View style={styles.taglineDock} pointerEvents="box-none">
            <View style={styles.taglineContainer}>
              <Text style={styles.tagline}>{t('login.discoverPath')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.loginContainer}>

          {/* The form sits at the BOTTOM of the sheet and the guide holds the middle
              (owner, 2026-10-20). This spacer is what pushes it down; the guide is
              absolutely positioned against the screen bottom, so its offset below has
              to be read together with this. */}
          <View style={styles.formSpacer} />

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
              ref={phoneRef}
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

          {/* The same reassurance the free-call screen carries, and for the same reason:
              the last thing read before the tap should be why the number is safe, not a
              legal warning. Bigger than the terms line underneath it, deliberately. */}
          <View style={styles.reassureRow}>
            <Svg width={scale(13)} height={scale(15)} viewBox="0 0 13 15">
              <Path
                d="M6.5 1 11.5 3v4c0 3.2-2.1 5.9-5 6.9C3.6 12.9 1.5 10.2 1.5 7V3Z"
                fill="none"
                stroke="#6A4A38"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
              <Path
                d="M4.4 7.3 5.9 8.8 8.8 5.9"
                fill="none"
                stroke="#6A4A38"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.reassureText}>{t('login.verifyOnly')}</Text>
          </View>

          {/* Both links were TouchableOpacity with no onPress — they rendered as
              links and did nothing on tap. */}
          <View style={styles.termsView}>
            <Text style={styles.termsText}>
              {t('login.agreeShort')}
            </Text>
            <TouchableOpacity
              style={styles.termsLink}
              onPress={() => {
                captureEvent('legal_link_opened', { link: 'terms', screen: 'login' });
                openExternalUrl(LEGAL_LINKS.termsOfUse);
              }}>
              <Text style={styles.linktext}>{t('login.termsShort')}</Text>
            </TouchableOpacity>
            <Text style={styles.termsText}>{t('login.and')}</Text>
            <TouchableOpacity
              style={styles.termsLink}
              onPress={() => {
                captureEvent('legal_link_opened', { link: 'privacy', screen: 'login' });
                openExternalUrl(LEGAL_LINKS.privacyPolicy);
              }}>
              <Text style={styles.linktext}>{t('login.privacyShort')}</Text>
            </TouchableOpacity>
          </View>

          {/* No separate Register link: this screen signs up a new number itself. The
              empty footer that used to sit here is gone: it carried `marginTop: 'auto'`,
              so it fought `formSpacer` for the slack and the two split it, leaving the
              field and the button floating short of the bottom. The guide no longer needs
              it to reserve space either -- he is positioned absolutely now. */}
        </View>

      </ScrollView>

      {/* OUTSIDE the sheet, over the whole screen. He was moved inside it while trying
          to draw him behind the form; that idea was dropped, and leaving him in there
          left an absolutely-positioned child with its own zIndex inside the sheet's
          flex column, mounting and unmounting on every keyboard event. Out here he
          cannot affect how the form's own children are laid out or drawn.
          `topOffset` is measured from the top of the SCREEN. */}
      {guideAvatarConfig?.login?.enabled !== false && (
        <GuideAvatar
          storageKey="login"
          // Two lines. The second is appended rather than folded into the first, so it
          // survives whatever the admin's Guide Avatar page sets as the greeting.
          message={`${(language === 'Hindi' ? guideAvatarConfig?.login?.textHi : guideAvatarConfig?.login?.textEn) || t('login.guideHint')}
${t('login.guideHintLine2')}`}
          alwaysShow
          // STACKED, not side by side (owner, 2026-10-20): the bubble sits above the
          // guide and he stands centred under it. The row layout hung the bubble off
          // his shoulder, which read as a label pinned next to him. The two offsets
          // below were tuned for that row and have to be zero here, or the bubble and
          // the avatar slide apart.
          layout="stack"
          position="center"
          // He is hidden while the keyboard is up (the component's default). Keeping him
          // on screen was tried and reverted: the keyboard halves the window, so he and
          // the bubble end up over the field whatever they are anchored to, and drawing
          // him UNDER the form meant dropping the bubble's shadow, which stopped it
          // reading as a card at all.
          // Dropped so the guide stands just above the number field, with the bubble
          // over his head, instead of floating in the middle of the empty sheet.
          // Read together with `formSpacer`, which is what puts the field down there.
          topOffset={verticalScale(302)}
          avatarSize={scale(150)}
          offsetX={0}
          avatarOffsetY={0}
          boxOffsetY={0}
          bounce={false}
          onPress={() => {
            // "Already have an account? Sign in here": the number box is right here.
            captureEvent('guide_avatar_tapped', { screen: 'login' });
            phoneRef.current?.focus();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
};

export default Login;

const GOLD = '#FFD233';
const CREAM = '#FFF6EA';

const styles = StyleSheet.create({
  // ── Free-call variant ──────────────────────────────────────────────────────
  fcMain: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  fcBody: {
    flex: 1,
  },
  fcTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
  },
  fcBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fcBrandMark: {
    width: scale(30),
    height: scale(30),
  },
  fcBrandName: {
    marginLeft: scale(8),
    color: COLORS.white,
    fontSize: moderateScale(17),
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fcLangPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
  },
  fcPromise: {
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(34),
    // Raised above fcGuideZone so the topic card can overlay the avatar.
    zIndex: 30,
  },
  fcHeadline: {
    color: GOLD,
    fontSize: moderateScale(42),
    fontWeight: '900',
    letterSpacing: -1,
  },
  fcHeadlineAccent: {
    color: COLORS.white,
    fontSize: moderateScale(42),
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: verticalScale(-6),
  },
  fcSub: {
    marginTop: verticalScale(14),
    color: 'rgba(255,246,234,0.9)',
    fontSize: moderateScale(14.5),
    fontWeight: '500',
    lineHeight: moderateScale(21),
    maxWidth: scale(250),
  },
  // The chip row and its info card live in their own stacking context so the card can
  // sit ON TOP of the guide avatar, which is a LATER sibling and would otherwise paint
  // over it. zIndex alone is enough here because fcGuideZone has pointerEvents="none".
  fcChipsWrap: {
    position: 'relative',
    zIndex: 30,
  },
  fcChips: {
    flexDirection: 'row',
    marginTop: verticalScale(16),
  },
  fcTopicCard: {
    position: 'absolute',
    left: 0,
    width: scale(268),
    backgroundColor: 'rgba(43,16,8,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,200,92,0.38)',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(14),
    paddingTop: verticalScale(10),
    paddingBottom: verticalScale(12),
    paddingRight: scale(30),
    zIndex: 31,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 5},
  },
  fcTopicCaret: {
    position: 'absolute',
    top: -moderateScale(5),
    width: moderateScale(10),
    height: moderateScale(10),
    backgroundColor: 'rgba(43,16,8,0.97)',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,200,92,0.38)',
    transform: [{rotate: '45deg'}],
  },
  fcTopicTitle: {
    color: '#FFC85C',
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    marginBottom: verticalScale(3),
  },
  fcTopicBody: {
    color: 'rgba(255,246,234,0.88)',
    fontSize: moderateScale(12),
    fontWeight: '500',
    lineHeight: moderateScale(18),
  },
  fcTopicClose: {
    position: 'absolute',
    top: verticalScale(7),
    right: scale(9),
  },
  fcTopicCloseText: {
    color: 'rgba(255,246,234,0.55)',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  fcChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,246,234,0.32)',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(11),
    paddingVertical: verticalScale(5),
    marginRight: scale(6),
  },
  fcChipText: {
    color: 'rgba(255,246,234,0.92)',
    fontSize: moderateScale(11.5),
    fontWeight: '600',
  },
  // No minHeight on purpose: this is the slack in the layout. It gives up its height
  // first when the keyboard opens or the display is short, so the field and the button
  // never get pushed off the bottom.
  fcGuideZone: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  fcGuide: {
    flex: 1,
    width: scale(126),
    marginRight: scale(8),
    marginBottom: -verticalScale(8),
  },
  // THE BOTTOM PADDING IS NOT OPTIONAL. This screen draws edge to edge, so the window
  // extends BEHIND the Android navigation bar, and the scroll content ends exactly at
  // the window's bottom -- which put the legal line underneath the bar, sliced in half.
  // `insets.bottom` alone does not save it: it reads 0 on a three-button bar here, which
  // is why the rest of this app pads the bottom by hand too (see `footerContainer`).
  fcForm: {
    paddingHorizontal: scale(24),
  },
  fcInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: verticalScale(56),
    backgroundColor: '#FFFCF4',
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(16),
  },
  fcCallingCode: {
    marginLeft: scale(8),
    color: '#3E1B0E',
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  fcDivider: {
    width: 1,
    height: verticalScale(22),
    backgroundColor: '#E8DCC8',
    marginHorizontal: scale(12),
  },
  fcInput: {
    flex: 1,
    color: '#3E1B0E',
    fontSize: moderateScale(16.5),
    fontWeight: '600',
    letterSpacing: 0.5,
    padding: 0,
  },
  // The one saturated thing on the screen, so it cannot be missed. Deliberately NOT
  // the maroon the standard screen uses -- that button was the dullest element on it.
  fcCta: {
    marginTop: verticalScale(14),
    height: verticalScale(58),
    borderRadius: moderateScale(16),
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  fcCtaDisabled: {
    // OPAQUE, not a 50%-alpha gold. This button carries elevation: 6, and on Android an
    // elevated view with a translucent background composites against the dark screen
    // behind it — which drew a brown rounded block inside the button for the whole time
    // the spinner was up. A dimmer solid gold reads as disabled without the artefact.
    backgroundColor: '#E2BD30',
  },
  fcCtaText: {
    color: '#3E1B0E',
    fontSize: moderateScale(17),
    fontWeight: '900',
  },
  fcReassureRow: {
    marginTop: verticalScale(13),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fcReassure: {
    marginLeft: scale(6),
    color: 'rgba(255,246,234,0.84)',
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  fcTermsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: verticalScale(9),
  },
  // The quietest line on the screen, deliberately. Kept at 0.72 / full cream rather
  // than dimmed further: below that it stops passing contrast at this size.
  fcTermsText: {
    color: 'rgba(255,246,234,0.72)',
    fontSize: moderateScale(8.5),
  },
  fcTermsLink: {
    color: CREAM,
    fontSize: moderateScale(8.5),
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  main: {
    flex: 1,
    // White, NOT maroon. This is what shows through wherever the white sheet does not
    // reach -- on an iPhone that is the home-indicator strip, which read as a dark band
    // glued to the bottom of the screen (reported from TestFlight, 2026-10-24). The brown
    // that the top of the screen needs is painted by `header` below, which is the only
    // part that actually wants it.
    backgroundColor: 'white',
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
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  // paddingBottom sets where the white sheet starts, and with it the pill. paddingTop
  // moves only the logo and the wordmark inside the brown.
  header: {
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingTop: verticalScale(88),
    paddingBottom: verticalScale(22),
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
  // THE KEYBOARD BUG LIVED HERE, and the fix is `overflow: 'visible'`. A View that has
  // BOTH a background and a borderRadius is clipped to that rounded outline on Android,
  // children included. Once the keyboard took half the window this box no longer covered
  // its own contents, and whatever fell outside it was silently cut away -- first the
  // pill hanging off the top, then the number field. Nothing was shrunk and nothing was
  // unmounted, which is why every flexShrink fix missed: the views were laid out
  // correctly and simply not painted. Proven on the device by colouring the field red
  // and seeing no red at all, then by flipping this one property.
  //
  // flexGrow/flexShrink rather than `flex: 1` (= grow 1 + SHRINK 1 + basis 0) so the
  // sheet is never asked to be shorter than its contents in the first place; past that
  // the ScrollView scrolls, which is the honest behaviour on a short screen.
  loginContainer: {
    backgroundColor: 'white',
    overflow: 'visible',
    flexGrow: 1,
    flexShrink: 0,
    width: '100%',
    borderTopLeftRadius: moderateScale(30),
    borderTopRightRadius: moderateScale(30),
    paddingTop: verticalScale(30),
    paddingHorizontal: scale(20),
  },
  // The ONLY flexible thing in the sheet, and the only one without flexShrink: 0. The
  // keyboard makes the sheet shorter than its own contents, and Yoga's answer to that is
  // to shrink every child -- which is how first the pill and then the number field were
  // squeezed out of existence. This collapses to nothing first; past that the ScrollView
  // scrolls, which is the correct behaviour, instead of the form quietly disappearing.
  formSpacer: {
    flex: 1,
    minHeight: 0,
  },
  // Overhangs the bottom of the header by half its own height, so it still straddles
  // the seam exactly as before. `bottom` is the knob that moves it across the seam.
  taglineDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -verticalScale(18),
    alignItems: 'center',
    zIndex: 10,
    elevation: 6,
  },
  taglineContainer: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: moderateScale(20),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(25),
    elevation: 6,
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
    flexShrink: 0,
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
    flexShrink: 0,
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
  // Centred again now the sentence is short: at this length it ends well clear of the
  // floating gift bubble in the corner, so it no longer needs to be offset left.
  reassureRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(2),
    marginBottom: verticalScale(7),
  },
  reassureText: {
    marginLeft: scale(6),
    color: '#6A4A38',
    fontSize: moderateScale(12),
    fontWeight: '600',
  },
  termsView: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: verticalScale(14),
  },
  // Sized to keep the whole sentence on ONE line: at 12 it wrapped, and the second
  // line landed under the floating gift bubble in the corner.
  termsText: {
    fontSize: moderateScale(9),
    color: COLORS.textLight,
  },
  termsLink: {
    padding: scale(1),
  },
  linktext: {
    fontSize: moderateScale(9),
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
