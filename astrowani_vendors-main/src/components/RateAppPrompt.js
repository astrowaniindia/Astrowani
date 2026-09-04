// astrowani_vendors-main/src/components/RateAppPrompt.js
//
// Vendor-side "rate the app on the Play Store" prompt. Mount <RateAppPromptHost />
// ONCE near the navigation root.
//
//   import { showRateAppPrompt } from '../components/RateAppPrompt';
//   showRateAppPrompt();                       // respects every eligibility rule
//   showRateAppPrompt({ title, message }, { force: true });   // admin push
//
// There is no "good moment" chain here as there is in the customer app: an
// astrologer never rates a session, so there is no positive signal to hang it on.
// The usage gates (minAppOpens / minDaysSinceInstall) are the whole eligibility
// test, and they are deliberately conservative — this is a work tool, and a review
// request in front of a live call queue is worse than no review.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import {
  fetchReviewConfig, recordAppOpen, isReviewSnoozed, snoozeReview,
  hasReviewed, markReviewed, openStore, localizedCopy, isUpdatePromptActive,
} from '../utils/appPrompts';

const FALLBACK_TITLE = 'Enjoying Astrowani?';
const FALLBACK_MESSAGE = 'A quick rating on the Play Store helps other astrologers find us.';

// Long enough to land after the dashboard has settled rather than on top of a
// still-loading screen — and, more importantly, after any incoming request popup.
const LAUNCH_DELAY_MS = 8000;

let listener = null;

export const showRateAppPrompt = (override, opts) => {
  if (listener) listener(override || null, opts || {});
};

export function RateAppPromptHost() {
  const { language } = useContext(LanguageContext);
  const [visible, setVisible] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [override, setOverride] = useState(null);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const present = useCallback(async (customCopy, opts = {}) => {
    // Never overridden, not even by an admin push.
    if (await hasReviewed()) return;
    if (isUpdatePromptActive()) return;

    const config = await fetchReviewConfig();
    if (!config) return;

    let trigger = opts.trigger || (opts.force ? 'admin' : 'launch');
    if (!opts.force) {
      if (await isReviewSnoozed()) return;
      const { openCount, daysSinceInstall } = await recordAppOpen();
      if (openCount < config.minAppOpens) return;
      if (daysSinceInstall < config.minDaysSinceInstall) return;
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

  // recordAppOpen() runs inside present(), so the counter ticks exactly once per
  // cold start.
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
      // Marked on the tap: the Play Store never tells us whether a review was left,
      // and re-asking someone who did leave one is the worse error.
      await markReviewed();
    } else {
      await snoozeReview(cfg?.remindAfterDays);
    }
    setVisible(false);
  };

  if (!visible || !cfg) return null;

  const copy = localizedCopy(override || cfg, language, FALLBACK_TITLE, FALLBACK_MESSAGE);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={later}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="star" size={moderateScale(30)} color="#fff" />
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
            <Text style={styles.buttonText}>Rate on Play Store</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={later} style={styles.skipBtn}>
            <Text style={styles.skipText}>Maybe later</Text>
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
    width: moderateScale(58),
    height: moderateScale(58),
    borderRadius: moderateScale(29),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  title: {
    fontSize: moderateScale(17),
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
