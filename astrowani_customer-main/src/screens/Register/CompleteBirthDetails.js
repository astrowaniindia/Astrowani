// Birth details, asked the moment they are needed — as a short guided flow in the
// same style as signup, not by dropping the customer onto the Profile screen.
//
// Opened by utils/profileGate.js when a customer taps chat, call, video, live, the
// free chat or the free call booking without these details. Two steps:
//
//   1. Aapke baare mein  — gender, marital status
//   2. Janm vivaran      — date of birth, place of birth, time of birth (optional)
//
// Saves through PUT /api/users/profile, refreshes the cached userData the gate
// reads, and goes back to where the customer was, so their next tap goes through.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Animated,
  Easing,
  BackHandler,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import DateTimePicker from '../../components/ThemedDateTimePicker';
import PlaceAutocomplete from '../../components/PlaceAutocomplete';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import { finishProfileGate } from '../../utils/profileGate';

const TOTAL_STEPS = 2;
// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const GUIDE_AVATAR_ASPECT = 145 / 281;

// The date picker opens on a plausible adult birth year rather than today.
const DEFAULT_DOB_ANCHOR = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  return d;
};

const s = (v) => (v == null ? '' : String(v)).trim();

// "HH:MM[:SS]" -> a Date today, for the time picker.
const parseTime = (value) => {
  if (!value) return null;
  const [h, m] = String(value).split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
};

export default function CompleteBirthDetails({ navigation, route }) {
  const { t } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const intent = route?.params?.intent || 'unknown';

  const [step, setStep] = useState(0);
  const [gender, setGender] = useState('');
  const [marital, setMarital] = useState('');
  const [dob, setDob] = useState(null);
  const [tob, setTob] = useState(null);
  const [place, setPlace] = useState('');
  const [placeState, setPlaceState] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showTobPicker, setShowTobPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set once the details are saved, so leaving the screen tells the gate to carry on
  // with the action the customer tapped instead of cancelling it.
  const savedRef = useRef(false);
  // Auto-advance only ever reacts to something the customer just did. Without this,
  // a returning customer whose details are already cached would be carried through
  // both steps before they had read either one.
  const touchedRef = useRef(false);
  const touch = () => { touchedRef.current = true; };
  // Turned off for good the moment the customer walks BACK to step 1. They came back
  // to change an answer, and both answers are already filled -- so auto-advance would
  // throw them forward again the instant the screen drew, which is a trap, not a
  // convenience. From then on the button is how they move on. (Reported 2026-09-20.)
  const autoAdvanceOffRef = useRef(false);

  // However the screen closes — saved, back button, swipe — the waiting action gets
  // its answer exactly once.
  useEffect(() => () => finishProfileGate(savedRef.current), []);

  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  // Prefill anything the customer already gave us, so they only fill what is missing.
  useEffect(() => {
    captureEvent('birth_details_screen_viewed', { intent });
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('userData');
        const u = raw ? JSON.parse(raw) : null;
        if (!u) return;
        if (s(u.gender)) setGender(s(u.gender).toLowerCase());
        if (s(u.maritalStatus)) setMarital(s(u.maritalStatus).toLowerCase());
        if (s(u.dob)) {
          const d = new Date(u.dob);
          if (!isNaN(d.getTime())) setDob(d);
        }
        if (s(u.timeOfBirth)) setTob(parseTime(u.timeOfBirth));
        if (s(u.placeOfBirth)) setPlace(s(u.placeOfBirth));
        if (s(u.state)) setPlaceState(s(u.state));
      } catch (_) {
        // Nothing to prefill — the customer fills everything in.
      }
    })();
  }, [intent]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, progress]);

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

  // After a free call is booked these details are not optional: they are what the
  // astrologer reads before dialling, and a booking without them wastes the call and
  // the customer's slot. So in THAT flow the screen cannot be backed out of — the
  // header arrow is hidden on the first step and hardware back does nothing.
  //
  // Only in that flow. The same screen is opened by utils/profileGate.js before a chat
  // or a call, and trapping someone there would leave them unable to get back to the
  // app at all. Stepping backwards between steps keeps working either way.
  const mustComplete = intent === 'free_call_after_booking';

  const handleBack = useCallback(() => {
    if (step > 0) {
      autoAdvanceOffRef.current = true;
      goToStep(step - 1, -1);
      return;
    }
    if (mustComplete) return; // nowhere to go: the form is the last step
    captureEvent('birth_details_abandoned', { intent });
    navigation.goBack();
  }, [step, goToStep, navigation, intent, mustComplete]);

  // Covers what the hardware-back listener cannot: the iOS swipe-back gesture and any
  // programmatic pop. `savedRef` is set just before the successful save navigates away,
  // so the real exit is never blocked.
  useEffect(() => {
    if (!mustComplete) return undefined;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (savedRef.current) return;
      e.preventDefault();
    });
    return unsub;
  }, [navigation, mustComplete]);

  // Hardware back walks the steps backwards before leaving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  const validateStep = (which) => {
    if (which === 0) {
      if (!gender) return t('birthGate.needGender');
      if (!marital) return t('birthGate.needMarital');
    }
    if (which === 1) {
      if (!dob) return t('birthGate.needDob');
      if (!s(place)) return t('birthGate.needPlace');
    }
    return null;
  };

  const save = async () => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const payload = {
        gender,
        maritalStatus: marital,
        dob: dob.toISOString(),
        placeOfBirth: s(place),
        state: placeState || null,
      };
      if (tob) payload.timeOfBirth = tob.toTimeString().slice(0, 5);
      const res = await Instance.put('/api/users/profile', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const updated = res?.data?.data;
      if (!res?.data?.success || !updated) throw new Error('save_failed');
      // The gate reads this cache, so the customer's next tap goes straight through.
      await AsyncStorage.setItem('userData', JSON.stringify(updated));
      captureEvent('birth_details_saved', { intent, has_time_of_birth: !!tob });
      // No "saved, now tap again" popup: going back lets the action the customer
      // originally tapped continue on its own (utils/profileGate.js).
      savedRef.current = true;
      finishProfileGate(true);
      navigation.goBack();
    } catch (err) {
      captureEvent('birth_details_save_failed', { intent, reason: err?.response?.data?.code || 'other' });
      showAlert(t('birthGate.errorTitle'), t('birthGate.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      captureEvent('birth_details_step_blocked', { intent, step: step + 1 });
      showAlert(t('birthGate.errorTitle'), err, 'error');
      return;
    }
    if (step < TOTAL_STEPS - 1) {
      goToStep(step + 1, 1);
      return;
    }
    save();
  };

  // ── Move on by itself once a step is answered ──────────────────────────────
  // No "Aage badhein" tap (2026-09-20, owner's call): the button was a second action
  // for a decision already made. Step 1 leaves as soon as both choices are picked;
  // step 2 saves once all three birth fields are in. The short delay is deliberate --
  // the customer must SEE the chip they tapped turn selected, or the screen appears
  // to jump on its own.
  useEffect(() => {
    if (step !== 0 || autoAdvanceOffRef.current) return undefined;
    if (!touchedRef.current || !gender || !marital) return undefined;
    const id = setTimeout(() => goToStep(1, 1), 260);
    return () => clearTimeout(id);
  }, [step, gender, marital, goToStep]);

  useEffect(() => {
    // Time of birth stays OPTIONAL -- this fires only when the customer has in fact
    // given all three. Leaving it blank is still valid and still uses the button.
    if (step !== 1 || !touchedRef.current || saving || savedRef.current) return undefined;
    if (!dob || !s(place) || !tob) return undefined;
    const id = setTimeout(() => save(), 320);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, dob, place, tob, saving]);

  const STEP_TITLES = [t('birthGate.step1Title'), t('birthGate.step2Title')];
  const STEP_SUBS = [t('birthGate.step1Sub'), t('birthGate.step2Sub')];
  // Straight after booking the free call this is the last step, and says so.
  const afterBooking = mustComplete;
  const GUIDE = [
    afterBooking ? t('birthGate.guideAfterBooking') : t('birthGate.guideStep1'),
    t('birthGate.guideStep2'),
  ];

  const GENDERS = [
    { value: 'male', label: t('birthGate.male') },
    { value: 'female', label: t('birthGate.female') },
    { value: 'other', label: t('birthGate.other') },
  ];
  const MARITAL = [
    { value: 'unmarried', label: t('birthGate.unmarried') },
    { value: 'married', label: t('birthGate.married') },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f3f1" />

      <View style={[styles.header, { paddingTop: insets.top + verticalScale(10) }]}>
        {/* A control that visibly does nothing is worse than no control, so on the first
            step of the mandatory flow the arrow is not drawn at all — the space is kept
            so the title does not shift as the customer moves between steps. */}
        {mustComplete && step === 0 ? (
          <View style={styles.backButton} />
        ) : (
          <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="arrow-back" size={moderateScale(26)} color={COLORS.AstroMaroon} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{afterBooking ? t('birthGate.lastStepTitle') : t('birthGate.title')}</Text>
          <Text style={styles.stepCounter}>{t('birthGate.stepOf', { n: step + 1, total: TOTAL_STEPS })}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      {/* No keyboardVerticalOffset — this KAV is not the screen root (see Register.jsx). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View style={{ flexGrow: 1, opacity: fade, transform: [{ translateX: slide }] }}>
            <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
            <Text style={styles.stepSub}>{STEP_SUBS[step]}</Text>

            <View style={styles.guideRow}>
              <Image
                source={require('../../assets/images/guideAvatarLogin.png')}
                style={styles.guideAvatarImg}
                resizeMode="contain"
              />
              <View style={styles.guideBubble}>
                <View style={styles.guideTail} />
                <Text style={styles.guideText}>{GUIDE[step]}</Text>
              </View>
            </View>

            {step === 0 && (
              <>
                {/* Pushed to the BOTTOM of the screen (2026-09-20): these are the only
                    things to tap here, and at the top of a tall phone they sit where a
                    thumb cannot comfortably reach. */}
                <View style={styles.pushDown} />
                <Text style={styles.fieldLabel}>{t('birthGate.genderLabel')}</Text>
                <View style={styles.choiceRow}>
                  {GENDERS.map((g) => (
                    <Choice key={g.value} label={g.label} selected={gender === g.value} onPress={() => { touch(); setGender(g.value); }} />
                  ))}
                </View>

                <Text style={styles.fieldLabel}>{t('birthGate.maritalLabel')}</Text>
                <View style={styles.choiceRow}>
                  {MARITAL.map((m) => (
                    <Choice key={m.value} label={m.label} selected={marital === m.value} onPress={() => { touch(); setMarital(m.value); }} />
                  ))}
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.fieldLabel}>{t('birthGate.dobLabel')}</Text>
                <TouchableOpacity style={styles.pickerRow} onPress={() => setShowDobPicker(true)} activeOpacity={0.8}>
                  <Icon name="cake" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                  <Text style={[styles.pickerText, !dob && styles.pickerPlaceholder]}>
                    {dob ? dob.toDateString() : t('birthGate.dobPlaceholder')}
                  </Text>
                  <Icon name="chevron-right" size={moderateScale(22)} color="#b0a49f" />
                </TouchableOpacity>

                {/* zIndex on the wrapper: zIndex only orders siblings, so the
                    suggestions list must out-rank the time field below it. */}
                <View style={styles.placeField}>
                  <Text style={styles.fieldLabel}>{t('birthGate.placeLabel')}</Text>
                  <PlaceAutocomplete
                    placeholder={t('birthGate.placePlaceholder')}
                    initialValue={place}
                    inputStyle={styles.input}
                    onSelect={(picked) => {
                      touch();
                      setPlace(picked ? picked.label : '');
                      setPlaceState(picked?.state || '');
                    }}
                  />
                </View>

                <Text style={styles.fieldLabel}>{t('birthGate.tobLabel')}</Text>
                <TouchableOpacity style={styles.pickerRow} onPress={() => setShowTobPicker(true)} activeOpacity={0.8}>
                  <Icon name="schedule" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                  <Text style={[styles.pickerText, !tob && styles.pickerPlaceholder]}>
                    {tob ? tob.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('birthGate.tobPlaceholder')}
                  </Text>
                  <Icon name="chevron-right" size={moderateScale(22)} color="#b0a49f" />
                </TouchableOpacity>

                <View style={styles.noteCard}>
                  <Icon name="lightbulb-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
                  <Text style={styles.noteText}>{t('birthGate.tobNote')}</Text>
                </View>
              </>
            )}
          </Animated.View>
        </ScrollView>

        {/* The button stays on BOTH steps. On step 1 it is usually never tapped --
            picking both choices moves on by itself -- but it has to be there for the
            customer who came back to change an answer, and for anyone who reaches for
            a button out of habit. On step 2 it is the only way out for someone who
            leaves time of birth blank, which is allowed. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(10) }]}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.85}>
              <Text style={styles.backBtnText}>{t('birthGate.back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>
                  {step < TOTAL_STEPS - 1 ? t('birthGate.next') : t('birthGate.save')}
                </Text>
                <Icon name={step < TOTAL_STEPS - 1 ? 'arrow-forward' : 'check'} size={moderateScale(18)} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {showDobPicker && (
        <DateTimePicker
          value={dob || DEFAULT_DOB_ANCHOR()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(event, selected) => {
            setShowDobPicker(false);
            if (event?.type !== 'dismissed' && selected) { touch(); setDob(selected); }
          }}
        />
      )}
      {showTobPicker && (
        <DateTimePicker
          value={tob || new Date()}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShowTobPicker(false);
            if (event?.type !== 'dismissed' && selected) { touch(); setTob(selected); }
          }}
        />
      )}
    </View>
  );
}

function Choice({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}>
      {selected && <Icon name="check" size={moderateScale(16)} color="#fff" style={{ marginRight: scale(4) }} />}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
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

  guideRow: { flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(16), marginBottom: verticalScale(4) },
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
    marginTop: verticalScale(18),
    marginBottom: verticalScale(8),
    fontWeight: '600',
  },

  choiceRow: { flexDirection: 'row', flexWrap: 'wrap' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ecdfd8',
    borderRadius: moderateScale(22),
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(18),
    marginRight: scale(10),
    marginBottom: verticalScale(8),
  },
  choiceSelected: { backgroundColor: COLORS.AstroMaroon, borderColor: COLORS.AstroMaroon },
  choiceText: { fontSize: moderateScale(14), color: '#2b1a12', fontWeight: '600' },
  choiceTextSelected: { color: '#fff' },

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
  placeField: { zIndex: 20, elevation: 20 },

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
  noteText: { flex: 1, marginLeft: scale(9), fontSize: moderateScale(12), color: '#6b574d', lineHeight: moderateScale(17.5) },

  // Eats the free space above the choices so they sit at the bottom of the screen.
  pushDown: { flexGrow: 1, minHeight: verticalScale(10) },
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
    minHeight: verticalScale(50),
  },
  nextBtnText: { color: '#fff', fontSize: moderateScale(15.5), fontWeight: 'bold', marginRight: scale(7) },
});
