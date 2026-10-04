// "How was Astrowani?" — five stars, nothing else.
//
// Mount <RateAstrowaniPromptHost /> ONCE near the navigation root, then call
// showRateAstrowani({ context, sessionId }).
//
// ── THIS CARD DOES GATE THE STORE LINK, AND THAT IS A KNOWN RISK ────────────
// 4-5 stars opens the Play Store listing; 1-3 stars never does. Conditioning the
// store prompt on the answer is exactly what Google's In-App Review guidance tells
// developers not to do, Play's developer policy treats it as ratings manipulation,
// and Apple rejects it outright. Penalties run from the prompt being ignored to the
// listing being suspended.
//
// It is here deliberately (owner, 2026-09-29) with that risk accepted. The exposure
// is to the LISTING, not to the code: if it is ever flagged, the fix is to show the
// same store link for every rating, or none — one line in `pick` below.
//
// An earlier design kept the two decoupled: the stars were our own data, and the
// store link was armed by BEHAVIOUR instead (a free call that ran most of its
// length, still passed in as `ranFullLength` — which this file no longer reads).
// That version was defensible and reached much the same people, since somebody who
// just talked for eleven straight minutes is already happy. It is the fallback if
// the gating has to come out.
//
// Either way the stars are OUR data too: they go to app_ratings and the admin
// dashboard, and they are what tells us a bad call happened. 1-3 stars gets a
// genuine apology, which is worth far more than a suppressed review — it is the only
// moment a disappointed customer is still willing to say what went wrong.

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitAppRating } from '../api/FreeCallApi';
import { hasReviewed, markReviewed } from '../utils/appPrompts';
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

// ── Don't ask the same person over and over ─────────────────────────────────
// Every trigger below used to raise this card unconditionally, so a customer who
// booked a second free call was asked again even if they had rated five stars and
// written a review the week before. These are the gates the removed RateAppPrompt
// used to own; they live here now that this is the only rating card.
//
// K_REVIEW_DONE is DELIBERATELY the same key RateAppPrompt wrote (via
// hasReviewed/markReviewed), so anybody who already reached the listing through the
// old prompt is never asked again by this one either.
const ANSWERED_AT_KEY = 'rateAstrowaniAnsweredAt';
const DISMISSED_AT_KEY = 'rateAstrowaniDismissedAt';
const DAY_MS = 24 * 60 * 60 * 1000;
// Answered but did not go to the store (an unhappy rating): their view is on record,
// so asking again soon adds nothing. Dismissed without answering is a much weaker
// signal -- they may simply have been busy -- so it waits days, not months.
const ANSWERED_COOLDOWN_MS = 90 * DAY_MS;
const DISMISSED_COOLDOWN_MS = 7 * DAY_MS;

// An admin broadcast and a push tap are someone asking ON PURPOSE, so they skip the
// cooldowns. They do NOT skip hasReviewed(): re-asking somebody who has already left
// a review is the one thing that has no upside at all.
const FORCING_CONTEXTS = ['admin', 'push'];

async function readTs(key) {
  try { return Number(await AsyncStorage.getItem(key)) || 0; } catch (_) { return 0; }
}

/**
 * Should the card be raised at all? Fails OPEN -- a broken read must not silence it.
 *
 * ── WHY THIS SILENTLY SWALLOWS THE CARD WHILE TESTING (2026-10-04) ──────────────
 * Every gate below is a persisted AsyncStorage stamp, so the FIRST run of a post-call
 * test arms a cooldown that suppresses every run after it: 90 days for an answer, 7 for
 * a dismissal, and `hasReviewed()` is forever. From the outside that is indistinguishable
 * from the prompt being broken -- the chain runs, showRateAstrowani fires, and nothing
 * appears. It cost a debugging session to find, so: in a DEV build the gates are off and
 * the card always shows. Release builds are completely unaffected; the cooldowns above
 * are the real product behaviour and are deliberately not weakened.
 */
async function mayAsk(context) {
  try {
    if (__DEV__) return true;
    if (await hasReviewed()) return false;
    if (FORCING_CONTEXTS.includes(context)) return true;
    const now = Date.now();
    if (now - (await readTs(ANSWERED_AT_KEY)) < ANSWERED_COOLDOWN_MS) return false;
    if (now - (await readTs(DISMISSED_AT_KEY)) < DISMISSED_COOLDOWN_MS) return false;
    return true;
  } catch (_) {
    return true;
  }
}

const stamp = (key) => { AsyncStorage.setItem(key, String(Date.now())).catch(() => {}); };

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

  useEffect(() => {
    listener = (o) => {
      // Async, so the caller never waits on storage: showRateAstrowani stays
      // fire-and-forget and the card simply appears a tick later, or not at all.
      mayAsk(o?.context).then((ok) => {
        if (!ok) return;
        openRef.current = true;
        pickedRef.current = 0;
        setReq(o); setPicked(0); setDone(false);
      });
    };
    return () => { listener = null; };
  }, []);

  // Read through a ref, not the `picked` state: pick() calls close() in the SAME tick
  // for a happy rating, where the state has not re-rendered yet and still reads 0 --
  // which would file that as a dismissal.
  const pickedRef = useRef(0);
  const openRef = useRef(false);

  const close = useCallback(() => {
    // Walked away without answering -> short cooldown. An answer stamps its own key.
    if (openRef.current && !pickedRef.current) stamp(DISMISSED_AT_KEY);
    openRef.current = false;
    pickedRef.current = 0;
    setReq(null); setPicked(0); setDone(false);
  }, []);

  // The thank-you has nothing to tap, so it closes itself rather than sitting there.
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(close, 2200);
    return () => clearTimeout(timer);
  }, [done, close]);

  const goToStore = useCallback((rating) => {
    captureEvent('app_rating_store_opened', { rating: rating ?? picked });
    // market:// opens the Play app straight on the listing where the review box is;
    // the https URL is the fallback for a device with no Play app (and for iOS later).
    // Never let a failed open leave them staring at a dead button — close either way.
    // They have been handed to the listing: never ask again, on any path. Stamped
    // before the open so a link that fails to resolve cannot leave us asking forever.
    markReviewed();
    Linking.openURL(`market://details?id=com.astrowanicustomer`).catch(() => {
      Linking.openURL(PLAY_STORE_URL).catch(() => {});
    });
    close();
  }, [picked, close]);

  const pick = useCallback((rating) => {
    if (pickedRef.current) return; // one answer only; re-tapping must not file a second
    pickedRef.current = rating;
    setPicked(rating);
    captureEvent('app_rated', { rating, context: req?.context || 'unknown' });
    // Fire and forget — submitAppRating resolves on failure. They did us a favour by
    // answering and must never see an error for it.
    submitAppRating({ rating, context: req?.context, sessionId: req?.sessionId });
    stamp(ANSWERED_AT_KEY);
    // A happy answer goes STRAIGHT to the listing. The old "would you share that as a
    // review?" step in between asked the same question twice and is where people
    // dropped out — the star tap already was the answer.
    if (rating > UNHAPPY_AT_OR_BELOW) {
      goToStore(rating);
      return;
    }
    setDone(true);
  }, [req, goToStore]);

  if (!req) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      {/* No close button by design: the only ways out are tapping a star or tapping
          outside the card. */}
      <Pressable style={styles.overlay} onPress={close}>
        {/* Absorbs presses so a tap on the card never reads as "tapped outside". */}
        <Pressable onPress={() => {}}>
          <View style={styles.card}>
          {!done ? (
            <>
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
                      color={n <= picked ? COLORS.AstroGold : '#C4C4C4'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.tapHint}>{t('rateUs.tapHint')}</Text>
            </>
          ) : (
            /* 1-3 stars. A thumbs-up and a thank-you, nothing to tap and nothing asked
               of them — 4 and 5 never reach here, they go straight to the listing. */
            <>
              <MaterialIcons name="thumb-up" size={moderateScale(32)} color={COLORS.AstroGold} />
              <Text style={styles.title}>{t('rateUs.thanksTitle')}</Text>
              <Text style={styles.subtitle}>{t('rateUs.feedbackBody')}</Text>
            </>
          )}
          </View>
        </Pressable>
      </Pressable>
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
