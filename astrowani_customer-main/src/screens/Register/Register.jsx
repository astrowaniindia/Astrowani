// Sign-up, as a three-step guided flow.
//
// WHAT THIS REPLACES. One screen holding every field at once: photo, name,
// gender, date of birth, time of birth, place of birth, mobile, email and the
// terms checkbox, in a single scroll. Nine inputs is a wall — the first thing a
// new user saw was the longest form in the app, with no sense of how much was
// left, and one "Submit" at the bottom that could fail on a field scrolled off
// screen.
//
// It is now three steps, grouped by what the user is actually being asked for:
//
//   1. About you      — photo, name, gender      (who they are)
//   2. Birth details  — date, time, place        (what the chart is built from)
//   3. Contact        — mobile, email, terms     (how we verify and reach them)
//
// WHY A WIZARD INSIDE ONE SCREEN, NOT THREE ROUTES. All three steps feed a
// single submit: the OTP request happens once, at the end, and the collected
// answers ride to VerifyOtp as one `profileData` object. Splitting into three
// navigation routes would mean either passing partial state through route params
// at each hop or lifting it into a context — both of which make it possible to
// arrive at step 3 with step 1's answers lost. Keeping one component keeps one
// piece of state and one submit path, and leaves Navigation.js untouched.
//
// The payload sent to VerifyOtp is deliberately UNCHANGED in shape, with one
// exception noted at buildProfileData().
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Modal,
  PermissionsAndroid,
  SafeAreaView,
  Animated,
  Easing,
  BackHandler,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '../../components/ThemedDateTimePicker';
import { Dropdown } from 'react-native-element-dropdown';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import PlaceAutocomplete from '../../components/PlaceAutocomplete';
import { sanitizePhoneInput } from '../../utils/phoneInput';
import TermsAcceptance from '../../components/TermsAcceptance';

const TOTAL_STEPS = 3;

// A birth date is meaningless as "today", so the picker opens on a plausible
// adult birth year instead of now. Purely the picker's starting position — it is
// not submitted unless the user actually confirms a date (see dobSet).
const DEFAULT_DOB_ANCHOR = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d;
};

export default function Register({ navigation }) {
  const { t, language } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  // Admin-editable via the dashboard's Guide Avatar page (GET /api/guide-avatar/config).
  const [guideAvatarConfig, setGuideAvatarConfig] = useState(null);

  // Top of the signup funnel — every step_completed below is a share of this.
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

  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState(DEFAULT_DOB_ANCHOR);
  // Tracks whether the user actually CHOSE a date, as opposed to the picker's
  // starting value. The old screen initialised dob to `new Date()` and always
  // submitted it, so anyone who never opened the picker silently registered with
  // today as their birth date — worse than no date at all, because it looks like
  // real data and produces a confidently wrong chart.
  const [dobSet, setDobSet] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [timeOfBirth, setTimeOfBirth] = useState(new Date());
  const [tobSet, setTobSet] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [place, setPlace] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState(null); // data-URI, for the preview
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  // ── Step transition animation ──────────────────────────────────────────────
  // One shared pair of values rather than one per step: only ever one step is
  // mounted, so the outgoing content is gone before the incoming content moves.
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      // Width cannot be driven natively; this is one short animation on a 4px
      // bar, not a per-frame layout of the whole form.
      useNativeDriver: false,
    }).start();
  }, [step, progress]);

  // `direction` is +1 going forward, -1 going back, so the content always slides
  // the way the user is travelling.
  const goToStep = useCallback((next, direction) => {
    Animated.parallel([
      Animated.timing(slide, { toValue: -20 * direction, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slide.setValue(28 * direction);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    });
  }, [slide, fade]);

  useEffect(() => {
    if (Platform.OS === 'android') requestCameraPermission();
    // Intentionally once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hardware back walks the wizard backwards before it leaves the screen —
  // otherwise a user on step 3 loses everything they typed to one back tap.
  useEffect(() => {
    const onBack = () => {
      if (step > 0) { goToStep(step - 1, -1); return true; }
      return false; // step 1: let the OS/navigator do the normal thing
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [step, goToStep]);

  const requestCameraPermission = async () => {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: t('register.cameraPermTitle'),
        message: t('register.cameraPermMsg'),
        buttonNeutral: t('register.askLater'),
        buttonNegative: t('common.cancel'),
        buttonPositive: t('common.ok'),
      });
    } catch (err) {
      console.warn(err);
    }
  };

  const onChangeDOB = (event, selectedDate) => {
    setShowDobPicker(false);
    if (event?.type !== 'dismissed' && selectedDate) {
      setDob(selectedDate);
      setDobSet(true);
    }
  };

  const onChangeTime = (event, selectedTime) => {
    setShowTimePicker(false);
    if (event?.type !== 'dismissed' && selectedTime) {
      setTimeOfBirth(selectedTime);
      setTobSet(true);
    }
  };

  const selectImage = () => {
    captureEvent('signup_photo_tapped');
    setShowImagePickerModal(true);
  };

  const applyPickedAsset = (response) => {
    if (response.didCancel) {
      captureEvent('signup_photo_cancelled');
      return;
    }
    if (response.errorCode) {
      captureEvent('signup_photo_failed', { code: response.errorCode });
      console.log('ImagePicker Error: ', response.errorMessage);
      return;
    }
    const source = response.assets?.[0];
    if (source) {
      captureEvent('signup_photo_added');
      setImage(`data:${source.type || 'image/jpeg'};base64,${source.base64}`);
    }
  };

  const handleImageLibraryLaunch = () => {
    captureEvent('signup_photo_source_chosen', { source: 'gallery' });
    setShowImagePickerModal(false);
    launchImageLibrary({ mediaType: 'photo', quality: 1, includeBase64: true }, applyPickedAsset);
  };

  const handleCameraLaunch = () => {
    captureEvent('signup_photo_source_chosen', { source: 'camera' });
    setShowImagePickerModal(false);
    launchCamera(
      { mediaType: 'photo', quality: 1, includeBase64: true, saveToPhotos: true, cameraType: 'back' },
      applyPickedAsset,
    );
  };

  // ── Validation, per step ───────────────────────────────────────────────────
  // Each step validates only what it owns, so an error is always about something
  // currently on screen. The old single form could reject on a field the user had
  // scrolled past minutes earlier.
  const validateStep = (which) => {
    if (which === 0) {
      if (!name.trim()) return t('register.needName');
      return null;
    }
    if (which === 1) {
      // Birth details stay optional — a real user may not know their birth time,
      // and blocking sign-up on it would cost accounts. Step 2's copy explains
      // why the details matter instead of forcing them.
      return null;
    }
    if (which === 2) {
      if (!mobile.trim()) return t('register.fillNameMobile');
      if (mobile.length < 10) return t('register.validMobile');
      if (!acceptedTerms) return t('register.acceptRequired');
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      // Which step rejects people, and on what. Step 3's terms checkbox and the
      // mobile-number rules are the two that can silently stall a signup.
      captureEvent('signup_step_blocked', { step: step + 1 });
      showAlert(t('common.error'), err, 'error');
      return;
    }
    captureEvent('signup_step_completed', { step: step + 1 });
    if (step < TOTAL_STEPS - 1) { goToStep(step + 1, 1); return; }
    handleSubmit();
  };

  // The one deliberate payload change: a field the user never filled is OMITTED
  // rather than sent as a default. PUT /api/users/profile only writes keys that
  // are present (`if (b.dob != null)`), so omission means "leave it unset" —
  // which is the truth — instead of storing today's date as a birth date.
  const buildProfileData = () => {
    const data = {
      name,
      gender,
      email,
      profilePic: image || null,
    };
    if (dobSet) data.dob = dob.toISOString().split('T')[0];
    if (tobSet) data.time_of_birth = timeOfBirth.toTimeString().split(' ')[0];
    if (place) data.place_of_birth = place;
    return data;
  };

  const handleSubmit = async () => {
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
          // Recorded on the new account row by the backend at insert time.
          termsAccepted: true,
          // Applied to the new account via PUT /api/users/profile right after OTP verify.
          profileData: buildProfileData(),
        });
      } else {
        captureEvent('signup_failed', { reason: res?.data?.code || 'otp_send_failed' });
        showAlert(t('common.error'), res?.data?.message || t('login.otpFailed'), 'error');
      }
    } catch (error) {
      if (error?.response?.data?.code === 'ACCOUNT_EXISTS') {
        captureEvent('signup_failed', { reason: 'account_exists' });
        showAlert(
          t('register.accountExists'),
          t('register.accountExistsMsg'),
          'error',
          () => navigation.navigate('Login'),
        );
      } else {
        console.error(error);
        captureEvent('signup_failed', { reason: error?.response?.data?.code || 'other' });
        showAlert(t('common.error'), error?.response?.data?.message || t('login.somethingWrong'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      captureEvent('signup_step_back', { step: step + 1 });
      goToStep(step - 1, -1);
      return;
    }
    // Leaving step 1 backwards is abandoning signup entirely, not moving within it.
    captureEvent('signup_abandoned', { step: 1 });
    navigation.goBack();
  };

  // ── The guide avatar ───────────────────────────────────────────────────────
  // It now says something DIFFERENT on each step, because a hint that never
  // changes stops being read after the first screen. Step 1 keeps the
  // admin-editable message so the dashboard's Guide Avatar page still controls
  // the first thing a new user is told; steps 2 and 3 carry their own copy,
  // which is where the avatar earns its place — explaining why we want birth
  // details, and reassuring about the phone number.
  const guideEnabled = guideAvatarConfig?.register?.enabled !== false;
  const adminMessage = language === 'Hindi'
    ? guideAvatarConfig?.register?.textHi
    : guideAvatarConfig?.register?.textEn;
  const guideMessage = [
    adminMessage || t('register.guideStep1'),
    t('register.guideStep2'),
    t('register.guideStep3'),
  ][step];

  const STEP_TITLES = [t('register.step1Title'), t('register.step2Title'), t('register.step3Title')];
  const STEP_SUBS = [t('register.step1Sub'), t('register.step2Sub'), t('register.step3Sub')];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />

      <View style={[styles.header, { paddingTop: insets.top + verticalScale(10) }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="arrow-back" size={moderateScale(26)} color={COLORS.AstroMaroon} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('register.title')}</Text>
          <Text style={styles.stepCounter}>
            {t('register.stepOf', { n: step + 1, total: TOTAL_STEPS })}
          </Text>
        </View>
      </View>

      {/* Progress bar — the single clearest answer to "how much more is there?",
          which the old one-page form never gave. */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + verticalScale(60)}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
            <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
            <Text style={styles.stepSub}>{STEP_SUBS[step]}</Text>

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

            {step === 0 && (
              <>
                <TouchableOpacity style={styles.avatarPicker} onPress={selectImage} activeOpacity={0.85}>
                  {image ? (
                    <>
                      <Image source={{ uri: image }} style={styles.avatarImage} />
                      <View style={styles.avatarEditBadge}>
                        <Icon name="edit" size={moderateScale(14)} color="#fff" />
                      </View>
                    </>
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Icon name="add-a-photo" size={moderateScale(26)} color={COLORS.AstroMaroon} />
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.photoHint}>
                  {image ? t('register.changePhoto') : t('register.tapToAddPhoto')}
                  <Text style={styles.optionalTag}>{`  ${t('register.optional')}`}</Text>
                </Text>

                <Field label={t('register.fullNameLabel')}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('register.fullName')}
                    placeholderTextColor="#9b8f8a"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </Field>

                <Field label={t('register.genderLabel')} optional optionalText={t('register.optional')}>
                  <Dropdown
                    style={styles.dropdown}
                    placeholderStyle={styles.placeholderStyle}
                    selectedTextStyle={styles.selectedTextStyle}
                    data={[
                      { label: t('register.male'), value: 'Male' },
                      { label: t('register.female'), value: 'Female' },
                      { label: t('register.other'), value: 'Other' },
                    ]}
                    maxHeight={300}
                    labelField="label"
                    valueField="value"
                    placeholder={t('register.selectGender')}
                    value={gender}
                    onChange={(item) => setGender(item.value)}
                    containerStyle={styles.dropdownContainer}
                    itemTextStyle={styles.dropdownItemText}
                    activeColor={COLORS.lightGray || '#f0f0f0'}
                  />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label={t('register.dobLabel')} optional optionalText={t('register.optional')}>
                  <TouchableOpacity style={styles.pickerRow} onPress={() => { captureEvent('signup_field_opened', { field: 'dob' }); setShowDobPicker(true); }} activeOpacity={0.8}>
                    <Icon name="cake" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                    <Text style={[styles.pickerText, !dobSet && styles.pickerPlaceholder]}>
                      {dobSet ? dob.toDateString() : t('register.dobPlaceholder')}
                    </Text>
                    <Icon name="chevron-right" size={moderateScale(22)} color="#b0a49f" />
                  </TouchableOpacity>
                </Field>

                {showDobPicker && (
                  <DateTimePicker
                    value={dob}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onChangeDOB}
                    maximumDate={new Date()}
                  />
                )}

                <Field label={t('register.tobLabel')} optional optionalText={t('register.optional')}>
                  <TouchableOpacity style={styles.pickerRow} onPress={() => { captureEvent('signup_field_opened', { field: 'time_of_birth' }); setShowTimePicker(true); }} activeOpacity={0.8}>
                    <Icon name="schedule" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                    <Text style={[styles.pickerText, !tobSet && styles.pickerPlaceholder]}>
                      {tobSet
                        ? timeOfBirth.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : t('register.tobPlaceholder')}
                    </Text>
                    <Icon name="chevron-right" size={moderateScale(22)} color="#b0a49f" />
                  </TouchableOpacity>
                </Field>

                {showTimePicker && (
                  <DateTimePicker
                    value={timeOfBirth}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onChangeTime}
                  />
                )}

                {/* Was a free-text box, so birth place arrived as whatever the user
                    typed ("mumbai", "Bombay", a typo) — astrologers read this verbatim
                    in chat, and it can never be used for a chart. The picker stores a
                    resolved "City, State, Country" instead. Same keyless provider as
                    the report screens, so there is no billing dependency. */}
                <Field label={t('register.pobLabel')} optional optionalText={t('register.optional')}>
                  <PlaceAutocomplete
                    placeholder={t('register.placeOfBirth')}
                    inputStyle={styles.input}
                    onSelect={(picked) => setPlace(picked ? picked.label : '')}
                  />
                </Field>

                <View style={styles.noteCard}>
                  <Icon name="lightbulb-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
                  <Text style={styles.noteText}>{t('register.birthNote')}</Text>
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <Field label={t('register.mobileLabel')}>
                  <View style={styles.phoneRow}>
                    <Text style={styles.phonePrefix}>+91</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder={t('register.mobileNumber')}
                      placeholderTextColor="#9b8f8a"
                      value={mobile}
                      keyboardType="phone-pad"
                      // maxLength={15} with no filtering let non-digit characters (and up
                      // to 15 of them) straight into the value the backend has to
                      // interpret as a phone number. See utils/phoneInput.js.
                      onChangeText={(text) => setMobile(sanitizePhoneInput(text))}
                      maxLength={12}
                    />
                  </View>
                </Field>

                <Field label={t('register.emailLabel')} optional optionalText={t('register.optional')}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('register.emailAddress')}
                    placeholderTextColor="#9b8f8a"
                    value={email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onChangeText={setEmail}
                  />
                </Field>

                <TermsAcceptance
                  accepted={acceptedTerms}
                  onChange={setAcceptedTerms}
                  style={styles.terms}
                />
              </>
            )}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(10) }]}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
              <Text style={styles.backBtnText}>{t('register.back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, submitting && { opacity: 0.6 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={submitting}>
            <Text style={styles.nextBtnText}>
              {step < TOTAL_STEPS - 1
                ? t('register.next')
                : (submitting ? t('register.sendingOtp') : t('register.submit'))}
            </Text>
            {!submitting && (
              <Icon
                name={step < TOTAL_STEPS - 1 ? 'arrow-forward' : 'check'}
                size={moderateScale(18)}
                color="#fff"
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent
        visible={showImagePickerModal}
        animationType="fade"
        onRequestClose={() => setShowImagePickerModal(false)}>
        <TouchableOpacity
          style={styles.imagePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowImagePickerModal(false)}>
          <View style={styles.imagePickerSheet}>
            <TouchableOpacity style={styles.imagePickerOption} onPress={handleCameraLaunch}>
              <Icon name="photo-camera" size={moderateScale(21)} color={COLORS.AstroMaroon} />
              <Text style={styles.imagePickerOptionText}>{t('register.takePhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imagePickerOption} onPress={handleImageLibraryLaunch}>
              <Icon name="photo-library" size={moderateScale(21)} color={COLORS.AstroMaroon} />
              <Text style={styles.imagePickerOptionText}>{t('register.chooseFromLibrary')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imagePickerCancel} onPress={() => setShowImagePickerModal(false)}>
              <Text style={styles.imagePickerCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// Labelled field wrapper. The old form was placeholder-only, so every label
// vanished the moment the user started typing and the filled form read as a
// column of unlabelled values.
function Field({ label, optional, optionalText, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional && <Text style={styles.optionalTag}>{`  ${optionalText}`}</Text>}
      </Text>
      {children}
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
  stepCounter: { fontSize: moderateScale(12), color: '#8a7c76', marginTop: verticalScale(2) },

  progressTrack: {
    height: verticalScale(4),
    backgroundColor: '#e6ddd8',
    marginHorizontal: scale(18),
    borderRadius: moderateScale(4),
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(4) },

  scroll: { paddingHorizontal: scale(18), paddingTop: verticalScale(18), paddingBottom: verticalScale(24) },
  stepTitle: { fontSize: moderateScale(22), fontWeight: 'bold', color: '#2b1a12' },
  stepSub: { fontSize: moderateScale(13), color: '#8a7c76', marginTop: verticalScale(4), lineHeight: moderateScale(19) },

  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: verticalScale(14),
    marginBottom: verticalScale(4),
  },
  guideAvatarImg: { width: scale(52), height: scale(52) },
  guideBubble: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(11),
    marginLeft: scale(10),
    borderWidth: 1,
    borderColor: '#ecd9cf',
  },
  // Small triangle pointing back at the avatar, so the bubble reads as speech
  // rather than as a floating notice.
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
  guideText: { fontSize: moderateScale(12.5), color: '#4a3a32', lineHeight: moderateScale(18) },

  avatarPicker: { alignSelf: 'center', marginTop: verticalScale(18) },
  avatarImage: { width: scale(96), height: scale(96), borderRadius: scale(48) },
  avatarPlaceholder: {
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e3cfc4',
    borderStyle: 'dashed',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.AstroMaroon,
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f7f3f1',
  },
  photoHint: {
    alignSelf: 'center',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(4),
    fontSize: moderateScale(12.5),
    color: '#8a7c76',
  },

  field: { marginTop: verticalScale(16) },
  fieldLabel: {
    fontSize: moderateScale(12.5),
    color: '#5c4a42',
    marginBottom: verticalScale(6),
    fontWeight: '600',
  },
  optionalTag: { fontSize: moderateScale(11), color: '#a8998f', fontWeight: '400' },

  input: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    fontSize: moderateScale(14.5),
    color: '#2b1a12',
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    height: verticalScale(46),
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },
  dropdownContainer: { borderRadius: moderateScale(12) },
  dropdownItemText: { color: '#2b1a12', fontSize: moderateScale(14) },
  placeholderStyle: { color: '#9b8f8a', fontSize: moderateScale(14.5) },
  selectedTextStyle: { color: '#2b1a12', fontSize: moderateScale(14.5) },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(13),
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },
  pickerText: { flex: 1, marginLeft: scale(10), fontSize: moderateScale(14.5), color: '#2b1a12' },
  pickerPlaceholder: { color: '#9b8f8a' },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fdf6f1',
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginTop: verticalScale(18),
    borderWidth: 1,
    borderColor: '#f0e0d6',
  },
  noteText: {
    flex: 1,
    marginLeft: scale(9),
    fontSize: moderateScale(12),
    color: '#6b574d',
    lineHeight: moderateScale(17.5),
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
    fontSize: moderateScale(14.5),
    color: '#5c4a42',
    fontWeight: '600',
    marginRight: scale(8),
    paddingRight: scale(8),
    borderRightWidth: 1,
    borderRightColor: '#ecdfd8',
    paddingVertical: verticalScale(12),
  },
  phoneInput: { flex: 1, fontSize: moderateScale(14.5), color: '#2b1a12', paddingVertical: verticalScale(12) },

  terms: { marginTop: verticalScale(20) },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(10),
    backgroundColor: '#f7f3f1',
    borderTopWidth: 1,
    borderTopColor: '#ece1db',
  },
  backBtn: {
    paddingVertical: verticalScale(13),
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: '#d9c8bf',
    marginRight: scale(10),
  },
  backBtnText: { color: '#6b574d', fontSize: moderateScale(14.5), fontWeight: '600' },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
  },
  nextBtnText: {
    color: '#fff',
    fontSize: moderateScale(15.5),
    fontWeight: 'bold',
    marginRight: scale(7),
  },

  imagePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  imagePickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(18),
    borderTopRightRadius: moderateScale(18),
    paddingVertical: verticalScale(10),
  },
  imagePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(15),
    paddingHorizontal: scale(22),
  },
  imagePickerOptionText: { marginLeft: scale(14), fontSize: moderateScale(15), color: '#2b1a12' },
  imagePickerCancel: { paddingVertical: verticalScale(14), alignItems: 'center' },
  imagePickerCancelText: { fontSize: moderateScale(15), color: '#8a7c76', fontWeight: '600' },
});
