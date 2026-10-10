// Draws the "bas ek chhota sa sign up" reassurance above the navigator — see
// utils/signupNudge.js for why it cannot belong to a screen.
//
// WHY IT EXISTS: someone who has just been told they won an 11-minute call taps the
// button and lands on a phone-number field. Without a word in between that reads as a
// bait and switch, and that is exactly the moment the expensive campaign visitor
// leaves. This says, warmly and in one breath, that the call is already theirs.
//
// TWO LINES, AND NOTHING ELSE. An earlier version spelled out the three sign-up steps
// under numbered dots with a footer line underneath; it turned a moment of reassurance
// into a form preview and made the sign-up look longer than it is. The whole card is
// read in the second it takes to glance at it, and it dismisses ITSELF after NUDGE_MS
// while the caller navigates on the same beat — so it is never a thing to get past.
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { onSignupNudgeChange, hideSignupNudge } from '../utils/signupNudge';
import { getCampaignVariant } from '../utils/acquisition';

// How long the card stays up. Callers wait the same amount before navigating.
export const NUDGE_MS = 3000;

const MEDAL = scale(66);

export default function SignupNudgeHost() {
  const { t: tRaw } = useContext(LanguageContext);
  const [visible, setVisible] = useState(false);
  const [metro, setMetro] = useState(false);
  // English for the Metro campaign, same reason as the reveal screen.
  const t = (key) => tRaw(metro ? key.replace(/^campaignGift\./, 'campaignMetro.') : key);
  const pop = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => onSignupNudgeChange(setVisible), []);

  // Re-read every time the card is raised, NOT once on mount. This host is mounted
  // above the navigator from the app's very first render, which is before bootstrap
  // has worked out (and stored) the campaign variant — a mount-only read therefore
  // always saw null and left the card Hinglish on an English campaign.
  useEffect(() => {
    if (!visible) return;
    getCampaignVariant().then((v) => setMetro(v === 'metro')).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      halo.setValue(0);
      return undefined;
    }
    Animated.spring(pop, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
    // One slow ring out of the medallion, so the card has a pulse rather than being a
    // static slab of text for three seconds.
    const ring = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    ring.start();
    const timer = setTimeout(hideSignupNudge, NUDGE_MS);
    return () => {
      ring.stop();
      clearTimeout(timer);
    };
  }, [visible, pop, halo]);

  if (!visible) return null;

  const cardScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const haloFade = halo.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={hideSignupNudge}>
      {/* pointerEvents none all the way down: the card is read, never operated. */}
      <View style={styles.backdrop} pointerEvents="none">
        <Animated.View style={[styles.card, { opacity: pop, transform: [{ scale: cardScale }] }]}>
          <View style={styles.medalWrap}>
            <Animated.View
              style={[styles.halo, { opacity: haloFade, transform: [{ scale: haloScale }] }]}
            />
            <View style={styles.medal}>
              <MaterialIcons name="check" size={moderateScale(32)} color={COLORS.AstroGold} />
            </View>
          </View>
          <Text style={styles.title}>{t('campaignGift.nudgeTitle')}</Text>
          <View style={styles.rule} />
          <Text style={styles.body}>{t('campaignGift.nudgeBody')}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,12,6,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(34),
  },
  // Small and quiet on purpose — it appears over a screen the customer is leaving, so
  // it should feel like a nod, not another page.
  card: {
    width: '100%',
    maxWidth: scale(300),
    backgroundColor: '#FFF8EE',
    borderRadius: moderateScale(26),
    borderWidth: 1.5,
    borderColor: COLORS.AstroGold,
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(24),
    paddingHorizontal: scale(24),
    alignItems: 'center',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
  },
  medalWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: verticalScale(15) },
  halo: {
    position: 'absolute',
    width: MEDAL,
    height: MEDAL,
    borderRadius: MEDAL / 2,
    backgroundColor: COLORS.AstroGold,
  },
  // A tick, not a gift box: the prize has already been given by this point and the
  // card's job is to confirm it, not to advertise it a second time.
  medal: {
    width: MEDAL,
    height: MEDAL,
    borderRadius: MEDAL / 2,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#4A1C10',
    fontSize: moderateScale(19),
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  rule: {
    width: scale(38),
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.AstroGold,
    marginTop: verticalScale(11),
    marginBottom: verticalScale(11),
  },
  body: {
    color: '#7A5847',
    fontSize: moderateScale(14),
    fontWeight: '600',
    lineHeight: moderateScale(20),
    textAlign: 'center',
  },
});
