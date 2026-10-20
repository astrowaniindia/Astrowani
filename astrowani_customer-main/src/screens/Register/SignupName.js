// Sign-up, step 2 of 3: the customer's name.
//
// Reached from VerifyOtp right after a signup OTP, so the account already exists
// and there is a real token to save with. Nothing else is asked here — birth
// details are asked when they are first needed (see utils/profileGate.js).
//
// A customer who closes the app on this screen is still a signed-in account; the
// next launch goes to Home, and Profile still has the name field.
import React, { useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';
import { prefetchFreeCallOffer, getFreeCallOffer } from '../../api/FreeCallApi';
import { markFreeCallOfferSeen } from '../../utils/onboardingFlags';
import { clearPendingFreeCall } from '../../utils/freeCallInvite';

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const GUIDE_AVATAR_ASPECT = 145 / 281;
const MAX_NAME_LENGTH = 60;
// How long the name screen will hold its spinner waiting for the free-call answer
// before giving up and going to Home. Short on purpose: the answer is normally
// already in hand (prefetched on mount), and Home raises the offer itself when it
// is not, so waiting longer buys nothing and stalls the signup.
const OFFER_WAIT_MS = 2500;

export default function SignupName({ navigation }) {
  const { t } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const referralRef = useRef(null);
  const [name, setName] = useState('');
  // Moved off the OTP screen (2026-09-20): a code typed between the six OTP boxes
  // and the keyboard was easy to miss, and the OTP now verifies itself the moment
  // the sixth digit lands, leaving no time to type one. Applied right after the
  // name is saved, through /api/customer/referral/apply.
  const [referralCode, setReferralCode] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    captureEvent('signup_name_screen_viewed');
    // Ask for the free-call offer now, so the hop straight to the free-call screen
    // below is instant rather than a spinner. The answer is kept by FreeCallApi.
    prefetchFreeCallOffer().catch(() => {});
  }, []);

  // The name is the last thing asked, so this is where the signup ends. Straight
  // onto the free 11-minute call screen -- SignupWelcome used to sit in between and
  // no longer does for signups (2026-10-20): it asked "do you want this?" with its
  // own Claim card, which is the third time of asking for anyone who came through
  // the gift reveal. Its login greeting is untouched, and so is Home's gift bubble.
  //
  // Home is the fallback for every case where that screen would be wrong: the offer
  // switched off, this customer not eligible, the scheduled/slots flow (which has no
  // screen of its own -- Home's card is the only way to pick a time), or an answer
  // that did not arrive in time. In the last case Home's own auto-popup still raises
  // the offer, which is why nothing is marked seen on that path.
  const goAfterName = async () => {
    // Whichever way this lands, the offer has been dealt with here; Home must not
    // raise its sheet on top of it. Cleared BEFORE the await so a campaign flag
    // cannot outlive a failed or slow fetch.
    clearPendingFreeCall();

    let fc = null;
    try {
      fc = await Promise.race([
        getFreeCallOffer({ usePrefetched: true }),
        new Promise((resolve) => { setTimeout(() => resolve(null), OFFER_WAIT_MS); }),
      ]);
    } catch (_) {
      fc = null; // getFreeCallOffer already resolves to "off" on failure; belt and braces.
    }

    const instant = !!(fc?.enabled && fc?.eligible && fc?.offer && fc.offer.mode === 'instant');
    captureEvent('signup_name_done', {
      to: instant ? 'instant_astrologers' : 'home',
      reason: instant ? 'eligible' : (!fc ? 'no_answer' : (!fc.enabled ? 'offer_off' : (!fc.eligible ? 'not_eligible' : 'not_instant'))),
    });

    if (!instant) {
      navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
      return;
    }

    // Seen here, so Home does not raise the same offer again as a popup behind this
    // screen. The gift bubble on Home still offers it until they book.
    try {
      const id = await AsyncStorage.getItem('customerId');
      if (id) await markFreeCallOfferSeen(id);
    } catch (_) {}

    // Home underneath, so closing the free-call screen lands on Home rather than
    // back on a signup screen that no longer applies.
    navigation.reset({
      index: 1,
      routes: [{ name: 'DrawerNavigator' }, { name: 'InstantAstrologers' }],
    });
  };

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      captureEvent('signup_step_blocked', { step: 'name' });
      showAlert(t('signupName.errorTitle'), t('signupName.needName'), 'error');
      return;
    }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.put(
        '/api/users/profile',
        { name: trimmed },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const updated = res?.data?.data;
      if (!res?.data?.success || !updated) throw new Error('save_failed');
      // Keep the cached user in step, as the profile screen does.
      await AsyncStorage.setItem('userData', JSON.stringify(updated));
      captureEvent('signup_name_saved');

      // Best effort, and deliberately never blocking: a wrong or expired code must
      // not stop a new customer from reaching the app. Nothing is shown on failure
      // beyond the analytics event; the reward is the referrer's, not theirs.
      const code = referralCode.trim().toUpperCase();
      if (code) {
        try {
          await Instance.post(
            '/api/customer/referral/apply',
            { referralCode: code },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          captureEvent('referral_code_applied', { at: 'signup_name' });
        } catch (e) {
          captureEvent('referral_code_rejected', {
            at: 'signup_name',
            reason: e?.response?.data?.code || 'other',
          });
        }
      }
      // The account and the name are already saved by here, so a failure while
      // working out where to go must never surface as "save failed" and invite a
      // retry. Home is always a valid landing.
      try {
        await goAfterName();
      } catch (_) {
        navigation.reset({ index: 0, routes: [{ name: 'DrawerNavigator' }] });
      }
    } catch (err) {
      captureEvent('signup_name_save_failed', { reason: err?.response?.data?.code || 'other' });
      // Always our own Hinglish line: the server's message is English and would
      // break the tone of this screen.
      showAlert(t('signupName.errorTitle'), t('signupName.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f3f1" />

      {/* No keyboardVerticalOffset — see Register.jsx. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.guideRow}>
            <Image
              source={require('../../assets/images/guideAvatarLogin.png')}
              style={styles.guideAvatarImg}
              resizeMode="contain"
            />
            <View style={styles.guideBubble}>
              <View style={styles.guideTail} />
              <Text style={styles.guideText}>{t('signupName.guide')}</Text>
            </View>
          </View>

          <Text style={styles.title}>{t('signupName.title')}</Text>
          <Text style={styles.sub}>{t('signupName.sub')}</Text>

          <TextInput
            style={styles.input}
            placeholder={t('signupName.placeholder')}
            placeholderTextColor="#9b8f8a"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="next"
            onSubmitEditing={() => referralRef.current?.focus()}
          />

          <Text style={styles.referralLabel}>{t('signupName.referralLabel')}</Text>
          <TextInput
            ref={referralRef}
            style={[styles.input, styles.referralInput]}
            placeholder={t('signupName.referralPlaceholder')}
            placeholderTextColor="#9b8f8a"
            value={referralCode}
            onChangeText={(v) => setReferralCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(10) }]}>
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
            onPress={handleContinue}
            activeOpacity={0.85}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{t('signupName.continue')}</Text>
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
  scroll: { paddingHorizontal: scale(18), paddingTop: verticalScale(30), paddingBottom: verticalScale(24) },

  guideRow: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(24) },
  guideAvatarImg: { width: scale(62), aspectRatio: GUIDE_AVATAR_ASPECT },
  guideBubble: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(13),
    marginLeft: scale(12),
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
  guideText: { fontSize: moderateScale(14), color: '#4a3a32', lineHeight: moderateScale(20) },

  title: { fontSize: moderateScale(22), fontWeight: 'bold', color: '#2b1a12' },
  sub: { fontSize: moderateScale(13), color: '#8a7c76', marginTop: verticalScale(4), lineHeight: moderateScale(19) },
  input: {
    marginTop: verticalScale(18),
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(13),
    fontSize: moderateScale(15),
    color: '#2b1a12',
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },

  referralLabel: {
    fontSize: moderateScale(12.5),
    color: '#7a6b64',
    marginTop: verticalScale(18),
    marginBottom: verticalScale(6),
    fontWeight: '600',
  },
  referralInput: { marginTop: 0 },
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
  nextBtnText: { color: '#fff', fontSize: moderateScale(15.5), fontWeight: 'bold', marginRight: scale(7) },
});
