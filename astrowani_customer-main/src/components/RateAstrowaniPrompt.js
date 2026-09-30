// "How was Astrowani?" — five stars, nothing else.
//
// Mount <RateAstrowaniPromptHost /> ONCE near the navigation root, then call
// showRateAstrowani({ context, sessionId }).
//
// ── THE IMPORTANT PART: THIS IS NOT A STORE PROMPT ──────────────────────────
// The tempting design is to send 4-5 star tappers to the Play Store and quietly keep
// 1-2 star tappers away from it. That is review gating: Google's In-App Review guidance
// names conditioning the store prompt on a user's answer as a thing not to do, Play's
// developer policy treats it as ratings manipulation, and Apple rejects it outright.
// Penalties run from the prompt being ignored to the listing being suspended.
//
// So the two are decoupled:
//   * the stars here are OUR data. They go to app_ratings and the admin dashboard,
//     and they are what tells us a bad call happened.
//   * the STORE prompt is decided by BEHAVIOUR — a free call that ran most of its
//     length — and is armed independently of whatever is tapped here. Nobody is
//     filtered by their answer.
// In practice much the same people reach the store, because somebody who just talked
// for eleven straight minutes is already a happy customer. The difference is that this
// version is defensible.
//
// 1-2 stars gets a genuine apology and a route to support, which is worth far more
// than a suppressed review: it is the only moment a disappointed customer is still
// willing to tell us what went wrong.

import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';
import { submitAppRating } from '../api/FreeCallApi';
import { navigationRef } from '../utils/NavigationService';
import { PLAY_STORE_URL } from '../config/api';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';

// Below this, the customer is unhappy and gets the apology rather than a thank-you.
// 1-3 stars: apologise and offer support, no store link.
// 4-5 stars: offer the Play Store review page.
//
// ⚠️ THIS IS REVIEW GATING, AND IT IS A DELIBERATE PRODUCT DECISION (owner, 2026-09-29).
// Sending only satisfied users to the store is what Google's In-App Review guidance
// tells developers not to do, and Play policy treats it as ratings manipulation. The
// risk is to the listing, not to the code. If the listing is ever flagged, the fix is
// to show the same store link for every rating (or none), which is a one-line change
// to `happy` below.
const UNHAPPY_AT_OR_BELOW = 3;

let listener = null;

/** Raise the prompt. No-op if the host isn't mounted. */
export const showRateAstrowani = (opts) => { if (listener) listener(opts || {}); };

export function RateAstrowaniPromptHost() {
  const { t } = useContext(LanguageContext);
  const [req, setReq] = useState(null);
  const [picked, setPicked] = useState(0);
  const [done, setDone] = useState(false);

  const visible = useDeferredPresent(!!req);
  useModalPresence(visible);

  useEffect(() => { listener = (o) => { setReq(o); setPicked(0); setDone(false); }; return () => { listener = null; }; }, []);

  const close = useCallback(() => { setReq(null); setPicked(0); setDone(false); }, []);

  const pick = useCallback((rating) => {
    if (picked) return; // one answer only; re-tapping must not file a second rating
    setPicked(rating);
    captureEvent('app_rated', { rating, context: req?.context || 'unknown' });
    // Fire and forget — submitAppRating resolves on failure. They did us a favour by
    // answering and must never see an error for it.
    submitAppRating({ rating, context: req?.context, sessionId: req?.sessionId });
    setDone(true);
  }, [picked, req]);

  const goToSupport = useCallback(() => {
    close();
    navigationRef.navigate('Support');
  }, [close]);

  const goToStore = useCallback(() => {
    captureEvent('app_rating_store_opened', { rating: picked });
    // market:// opens the Play app straight on the listing where the review box is;
    // the https URL is the fallback for a device with no Play app (and for iOS later).
    // Never let a failed open leave them staring at a dead button — close either way.
    Linking.openURL(`market://details?id=com.astrowanicustomer`).catch(() => {
      Linking.openURL(PLAY_STORE_URL).catch(() => {});
    });
    close();
  }, [picked, close]);

  if (!req) return null;

  const unhappy = picked > 0 && picked <= UNHAPPY_AT_OR_BELOW;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {!done ? (
            <>
              {/* A quiet corner dismiss instead of a "Not now" text button. The button
                  sat directly under the stars and read as a third option competing with
                  them; this gets out of the way. It is NOT removed altogether — a modal
                  with no visible way out is a trap, and Android's back gesture alone is
                  not an affordance anybody can see. */}
              <TouchableOpacity style={styles.closeBtn} onPress={close} activeOpacity={0.8}>
                <MaterialIcons name="close" size={moderateScale(17)} color={COLORS.AstroMaroon} />
              </TouchableOpacity>

              {/* The guide mascot, not an abstract sparkle. It is the face that greeted
                  them at login and sits on the Home tips, so "How was Astrowani?" is
                  being asked by somebody they recognise rather than by a glyph. */}
              <View style={styles.mascotRing}>
                <Image
                  source={require('../assets/images/guideAvatarLogin.png')}
                  style={styles.mascot}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.title}>{t('rateUs.title')}</Text>
              <Text style={styles.subtitle}>{t('rateUs.subtitle')}</Text>

              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => pick(n)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                    style={styles.starHit}
                  >
                    <MaterialIcons
                      name={n <= picked ? 'star' : 'star-border'}
                      size={moderateScale(38)}
                      color={n <= picked ? COLORS.AstroGold : '#C9A98F'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.tapHint}>{t('rateUs.tapHint')}</Text>
            </>
          ) : unhappy ? (
            <>
              <MaterialIcons name="sentiment-dissatisfied" size={moderateScale(32)} color={COLORS.AstroMaroon} />
              <Text style={styles.title}>{t('rateUs.sorryTitle')}</Text>
              <Text style={styles.subtitle}>{t('rateUs.sorryBody')}</Text>
              <TouchableOpacity style={styles.primary} onPress={goToSupport} activeOpacity={0.85}>
                <Text style={[styles.primaryTxt, styles.primaryTxtNoIcon]}>{t('rateUs.tellUs')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.skip}>
                <Text style={styles.skipTxt}>{t('common.close')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <MaterialIcons name="favorite" size={moderateScale(32)} color={COLORS.AstroGold} />
              <Text style={styles.title}>{t('rateUs.thanksTitle')}</Text>
              <Text style={styles.subtitle}>{t('rateUs.storeBody')}</Text>
              <TouchableOpacity style={styles.primary} onPress={goToStore} activeOpacity={0.85}>
                <MaterialIcons name="rate-review" size={moderateScale(16)} color={COLORS.white} />
                <Text style={styles.primaryTxt}>{t('rateUs.rateOnStore')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close} activeOpacity={0.7} style={styles.skip}>
                <Text style={styles.skipTxt}>{t('rateUs.notNow')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: scale(20) },
  card: {
    width: '100%', maxWidth: scale(320), backgroundColor: CREAM,
    borderRadius: moderateScale(18), padding: scale(22), alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  title: { fontSize: moderateScale(17), fontWeight: '800', color: COLORS.AstroMaroon, marginTop: verticalScale(8), textAlign: 'center' },
  primaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    fontSize: moderateScale(12), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(5), lineHeight: moderateScale(18),
  },
  closeBtn: {
    position: 'absolute', top: scale(10), right: scale(10),
    width: scale(28), height: scale(28), borderRadius: scale(14),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0E2D4', borderWidth: 1, borderColor: BORDER, zIndex: 2,
  },
  // A soft halo so the mascot reads as an illustration rather than a stray cut-out.
  mascotRing: {
    width: scale(84), height: scale(84), borderRadius: scale(42),
    backgroundColor: '#F6E7D6', alignItems: 'center', justifyContent: 'center',
    marginBottom: verticalScale(2),
  },
  mascot: { width: scale(70), height: scale(70) },
  stars: { flexDirection: 'row', marginTop: verticalScale(14), marginBottom: verticalScale(4) },
  starHit: { paddingHorizontal: scale(4) },
  tapHint: { fontSize: moderateScale(10.5), color: '#9b8a7c', marginTop: verticalScale(2) },
  primary: {
    marginTop: verticalScale(16), backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(22), paddingHorizontal: scale(24), paddingVertical: verticalScale(11),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  primaryTxt: { color: COLORS.white, fontWeight: '700', fontSize: moderateScale(13), marginLeft: scale(7) },
  primaryTxtNoIcon: { marginLeft: 0 },
  skip: { marginTop: verticalScale(12) },
  skipTxt: { color: '#8a7a6e', fontSize: moderateScale(12) },
});
