// "Enjoying Astrowani? Rate us on the Play Store."
//
// Mount <RateAppPromptHost /> ONCE near the navigation root (Navigation.js).
// Imperative API for the out-of-band triggers:
//
//   import { showRateAppPrompt } from '../components/RateAppPrompt';
//   showRateAppPrompt();                        // respects every eligibility rule
//   showRateAppPrompt({ title, message });      // admin-pushed copy (socket / push tap)
//   showRateAppPrompt(null, { force: true });   // admin push — skip the launch gates
//
// NOT THE SAME THING AS ReviewPrompt.js. That one collects a private star rating of
// the ASTROLOGER after a session and writes it to our own `reviews` table. This asks
// for a public rating of the APP on the Play Store. They are chained deliberately —
// ReviewPrompt calls this only after a 4-or-5-star session — which is the whole
// reason to have a separate in-app rating step at all: someone who just had a bad
// consult should never be handed a public review form.
//
// WHO GETS ASKED, and why each gate exists:
//   * minAppOpens / minDaysSinceInstall — never ask someone who has barely used it;
//     a first-launch review request is how apps earn one-star "stop asking" reviews.
//   * remindAfterDays — "Later" is a real answer, honoured for weeks, not minutes.
//   * hasReviewed — once they tap through to the store we never ask again, ever.
// Every threshold is admin-editable and clamped server-side.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';
import {
  fetchReviewConfig, recordAppOpen, isReviewSnoozed, snoozeReview,
  hasReviewed, markReviewed, openStore, localizedCopy, isUpdatePromptActive,
  consumeReviewGoodMoment,
} from '../utils/appPrompts';

// Long enough that the prompt lands after Home has painted and the customer has
// their bearings, rather than on top of a still-loading screen.
const LAUNCH_DELAY_MS = 6000;

let listener = null;

export const showRateAppPrompt = (override, opts) => {
  if (listener) listener(override || null, opts || {});
};

export function RateAppPromptHost() {
  const { language, t } = useContext(LanguageContext);
  const [visible, setVisible] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [override, setOverride] = useState(null);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const present = useCallback(async (customCopy, opts = {}) => {
    // "Already rated" is never overridden, not even by an admin push: asking someone
    // who has reviewed to review again is the one thing that reliably annoys people
    // into editing their rating downwards.
    if (await hasReviewed()) return;
    if (isUpdatePromptActive()) return;

    const config = await fetchReviewConfig();
    if (!config) return;

    let trigger = opts.trigger || (opts.force ? 'admin' : 'launch');

    if (!opts.force) {
      if (await isReviewSnoozed()) return;
      const { openCount, daysSinceInstall } = await recordAppOpen();
      // A 4-or-5-star session rating since the last check short-circuits the usage
      // gates — but never the snooze or "already rated" rules above it.
      const goodMoment = config.askAfterGoodRating && (await consumeReviewGoodMoment());
      if (goodMoment) {
        trigger = 'good_rating';
      } else {
        if (openCount < config.minAppOpens) return;
        if (daysSinceInstall < config.minDaysSinceInstall) return;
      }
    }

    setCfg(config);
    setOverride(customCopy);
    setVisible(true);
    captureEvent('rate_app_prompt_shown', { trigger });
  }, []);

  useEffect(() => {
    listener = present;
    return () => { listener = null; };
  }, [present]);

  // Launch check. recordAppOpen() runs inside present(), so the open counter ticks
  // exactly once per cold start — counting it anywhere else would inflate it.
  useEffect(() => {
    const timer = setTimeout(() => { present(null, {}); }, LAUNCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [present]);

  useEffect(() => {
    if (!visible) return;
    scaleAnim.setValue(0.92);
    Animated.timing(scaleAnim, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true,
    }).start();
  }, [visible, scaleAnim]);

  const later = async () => {
    captureEvent('rate_app_prompt_dismissed');
    setVisible(false);
    await snoozeReview(cfg?.remindAfterDays);
  };

  const rate = async () => {
    const ok = await openStore(cfg?.storeUrl);
    captureEvent('rate_app_prompt_accepted', { opened: ok });
    if (ok) {
      // Marked on the tap, not on a confirmed review — the Play Store never tells us
      // whether they actually left one, and re-asking someone who did is worse than
      // missing someone who changed their mind at the listing.
      await markReviewed();
      setVisible(false);
    } else {
      // Dead link: keep the card up rather than silently swallowing the tap, and
      // snooze so they are not stuck with it every launch.
      await snoozeReview(cfg?.remindAfterDays);
      setVisible(false);
    }
  };

  const ready = useDeferredPresent(visible);
  useModalPresence(ready);

  if (!visible || !cfg) return null;

  const copy = localizedCopy(
    override || cfg,
    language,
    t('rateApp.title'),
    t('rateApp.message'),
  );

  return (
    <Modal transparent visible={ready} animationType="fade" onRequestClose={later}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="star" size={moderateScale(32)} color="#fff" />
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.message}</Text>

          <View style={styles.starsRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <MaterialIcons
                key={i}
                name="star"
                size={moderateScale(26)}
                color={COLORS.AstroGold}
                style={{ marginHorizontal: scale(2) }}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.button} activeOpacity={0.85} onPress={rate}>
            <MaterialIcons
              name="rate-review"
              size={moderateScale(18)}
              color="#fff"
              style={{ marginRight: scale(8) }}
            />
            <Text style={styles.buttonText}>{t('rateApp.rateNow')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={later} style={styles.skipBtn}>
            <Text style={styles.skipText}>{t('rateApp.later')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(30),
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(24),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  iconCircle: {
    width: moderateScale(60),
    height: moderateScale(60),
    borderRadius: moderateScale(30),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: verticalScale(6),
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: '#555',
    textAlign: 'center',
    lineHeight: moderateScale(19),
    marginBottom: verticalScale(12),
  },
  starsRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(16),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(24),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(28),
    alignSelf: 'stretch',
  },
  buttonText: {
    color: '#fff',
    fontSize: moderateScale(14.5),
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(4),
  },
  skipText: {
    color: '#888',
    fontSize: moderateScale(13),
  },
});

export default RateAppPromptHost;
