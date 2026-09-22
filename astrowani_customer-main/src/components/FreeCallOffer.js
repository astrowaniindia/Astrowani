// Free 12-minute introductory call — the offer popup and the booking flow.
//
// Replaces FreeChatOfferPopup (the free 5-minute scripted bot chat, switched off
// 2026-08-31). Unlike that one this books a real astrologer's time, so:
//   * the slot grid is whatever the SERVER says it is — this component never
//     computes a time, never decides what is available, and never re-checks a
//     slot it was told is taken;
//   * a booking failure is shown, never swallowed. SLOT_TAKEN in particular
//     means somebody won the race and the grid is refreshed underneath them.
//
// The astrologer rings the customer directly, so there is nothing to join and no
// session to start. The confirmation says exactly that, because a customer who
// thinks they have to be somewhere at 3pm will sit in the app waiting.
//
// Copy (heading, body, button, confirmation) is admin-authored and arrives in
// `offer`; only structural labels are translated here.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { getFreeCallSlots, bookFreeCall } from '../api/FreeCallApi';
import {useModalPresence} from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';
import ShineButton from './ShineButton';
import { requestUserPermission } from '../utils/PushNotification';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';

// `source` says how this was opened ('auto' on first Home load, 'gift_bubble' when the
// floating bubble is tapped) so the funnel can tell an offer the customer sought out from
// one that was pushed at them — very different intent, very different conversion rate.

// How many faces the overlapping cluster shows. The backend already returns a
// roster of 5-6 (DISPLAY_ROSTER_MIN/MAX in freeCallRoutes.js); this caps what is
// drawn so a longer roster cannot overflow a narrow phone.
const CLUSTER_MAX = 5;
const CLUSTER_FACE = scale(46);
// Negative margin between faces — how far each one tucks under the previous.
const CLUSTER_OVERLAP = scale(14);

const FALLBACK_FACE = require('../assets/images/brandStarLogo.png');
const faceSource = (uri) => (uri ? { uri } : FALLBACK_FACE);

/**
 * The astrologer cluster: a static row of overlapping faces.
 *
 * Replaced the spinning "reel" (2026-09-05). The reel animated a strip past a gold
 * ring and stopped on one astrologer, which made the card a promise about a
 * PARTICULAR person. The offer is not that — whoever is free takes the call, and
 * pool mode can assign any of several — so the card now shows the panel as a group
 * and says who they are collectively, with no name and nothing moving.
 *
 * No Animated, no timers, no featuredIndex: this renders once and holds still.
 * Deliberately so — the brief was to remove the animation completely.
 */
const AstrologerCluster = ({ list, t }) => {
  const faces = (list || []).slice(0, CLUSTER_MAX);
  const tr = (k) => (typeof t === 'function' ? t(k) : k);
  if (!faces.length) return null;

  return (
    <View style={styles.clusterWrap}>
      <View style={styles.clusterRow}>
        {faces.map((a, i) => (
          <Image
            key={`${a.name || 'astro'}-${i}`}
            source={faceSource(a.image)}
            style={[
              styles.clusterFace,
              // Every face after the first slides left to sit under its neighbour.
              // zIndex descends so the leftmost reads as the top of the stack, which
              // is the convention these avatar clusters use everywhere else.
              i > 0 && { marginLeft: -CLUSTER_OVERLAP },
              { zIndex: faces.length - i },
            ]}
          />
        ))}
      </View>
      <Text style={styles.clusterLabel} numberOfLines={2}>
        {tr('freeCall.byVerifiedAstrologers')}
      </Text>
      <Text style={styles.clusterDetail}>{tr('freeCall.callsOnYourNumber')}</Text>
    </View>
  );
};

const FreeCallOffer = ({
  visible, offer, phone, onClose, onBooked, t, source = 'auto', startAtSlots = false,
  // Birth details are asked AFTER booking now (2026-09-19), as an optional step on
  // the confirmation screen. Asking before the slots lost about 1 in 4 people.
  needsBirthDetails = false, onAddBirthDetails,
  // inline: render just the card, in the page (the signup Welcome screen), with no
  // Modal and no dimmed backdrop. The host screen provides its own way out.
  inline = false,
  // Told which step the card is on, whenever it changes. The host owns the way out
  // in inline mode, and "are you sure" is only right before the offer has landed:
  // the signup Welcome screen asks on 'intro' and leaves instantly on 'done'.
  // Pass a stable callback (useCallback) — this fires on every change of it.
  onStepChange,
}) => {
  // 'intro' -> 'slots' -> 'done'
  const [step, setStep] = useState('intro');
  const [dates, setDates] = useState([]);
  const [activeDate, setActiveDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);
  // ── The "there is more below" nudge ──────────────────────────────────────
  // A wall of time chips that happens to be cut off at the bottom reads as the whole
  // list. Nobody scrolls something they do not know is scrollable, so once the times
  // land the grid scrolls itself down a little, holds for a beat, and glides back:
  // enough for the eye to catch that the chips moved and more exist underneath.
  // Only when something IS actually hidden, only once per date, and it gets out of the
  // way the instant the customer touches the list — a hint that fights the finger is
  // worse than no hint.
  const slotScrollRef = useRef(null);
  const hintTimers = useRef([]);
  const hintedForDate = useRef(null);
  const userScrolledSlots = useRef(false);
  const slotContentH = useRef(0);
  const slotViewH = useRef(0);

  const clearHintTimers = useCallback(() => {
    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];
  }, []);

  // Whether anything is still hidden below the fold, which drives both the nudge and
  // the little "more times" chevron.
  const [moreBelow, setMoreBelow] = useState(false);
  const chevronBounce = useRef(new Animated.Value(0)).current;

  const refreshMoreBelow = useCallback((offsetY = 0) => {
    const hidden = slotContentH.current - slotViewH.current - offsetY;
    setMoreBelow(hidden > verticalScale(12));
  }, []);

  // The chevron breathes downward so it reads as "keep going that way" rather than as a
  // static icon nobody looks at twice.
  useEffect(() => {
    if (!moreBelow) { chevronBounce.stopAnimation(); chevronBounce.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(chevronBounce, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(chevronBounce, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [moreBelow, chevronBounce]);

  const maybeHintScroll = useCallback(() => {
    const contentH = slotContentH.current;
    const viewH = slotViewH.current;
    if (!slotScrollRef.current || !viewH) return;
    // Less than about half a row hidden is not worth a nudge.
    if (contentH - viewH < verticalScale(24)) return;
    if (hintedForDate.current === activeDate) return;
    hintedForDate.current = activeDate;
    userScrolledSlots.current = false;
    const peek = Math.min(verticalScale(84), contentH - viewH);
    clearHintTimers();
    const step1 = setTimeout(() => {
      if (userScrolledSlots.current) return;
      slotScrollRef.current?.scrollTo({ y: peek, animated: true });
    }, 420);
    const step2 = setTimeout(() => {
      if (userScrolledSlots.current) return;
      slotScrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 1620); // ~1s resting at the peek, so the movement registers
    hintTimers.current.push(step1, step2);
  }, [activeDate, clearHintTimers]);

  // A hint firing into an unmounted card would scroll nothing and warn in dev.
  useEffect(() => clearHintTimers, [clearHintTimers]);

  // After a booking: the pending hop to the birth-details form (see afterBooked).
  const autoNextRef = useRef(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const tr = (k, p) => (typeof t === 'function' ? t(k, p) : k);

  // Reset whenever the sheet is reopened, so a customer who backed out mid-flow
  // doesn't come back to a stale selection.
  useEffect(() => {
    if (visible) {
      setPicked(null);
      setError('');
      setConfirmed(null);
      if (startAtSlots) {
        // Reopened right after the customer filled in their birth details: they
        // already chose to book, so go straight to the times.
        captureEvent('free_call_slots_opened', { source, after_birth_details: true });
        setStep('slots');
        loadSlots(null);
      } else {
        setStep('intro');
        if (offer) captureEvent('free_call_offer_shown', { source });
      }
    } else if (autoNextRef.current) {
      // Closed before the automatic hop to birth details: do not open it anyway.
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadSlots = useCallback(async (dateKey) => {
    setLoadingSlots(true);
    setError('');
    try {
      const data = await getFreeCallSlots(dateKey);
      setDates(data.dates || []);
      setActiveDate(data.date || dateKey || null);
      setSlots(data.slots || []);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => () => { if (autoNextRef.current) clearTimeout(autoNextRef.current); }, []);

  // After booking (2026-09-20): "Slot booked!" shows, the notification prompt is
  // asked (right after booking, where "we will remind you" gives it a reason),
  // and once it is answered and at least 2 seconds have passed, the birth-details
  // form opens by itself as the last step for the astrologer.
  const afterBooked = async () => {
    const bookedAt = Date.now();
    await new Promise((r) => setTimeout(r, 900));
    try { await requestUserPermission(); } catch (_) {}
    if (!needsBirthDetails || !onAddBirthDetails || !visibleRef.current) return;
    const wait = Math.max(0, 2000 - (Date.now() - bookedAt));
    autoNextRef.current = setTimeout(() => {
      autoNextRef.current = null;
      if (!visibleRef.current) return;
      captureEvent('free_call_birth_details_auto_opened', { source });
      onAddBirthDetails();
    }, wait);
  };

  // Keep the host in step with the card (see onStepChange above).
  useEffect(() => { if (onStepChange) onStepChange(step); }, [step, onStepChange]);

  const goToSlots = async () => {
    captureEvent('free_call_slots_opened', { source });
    setStep('slots');
    loadSlots(null);
  };

  // Dismissal, as distinct from finishing. Carries the step it was abandoned at, which is
  // the whole point: leaving on 'intro' means the offer did not land, leaving on 'slots'
  // means it did and the times on offer did not.
  const dismiss = () => {
    captureEvent('free_call_offer_dismissed', { source, step, had_slot_picked: !!picked });
    if (onClose) onClose();
  };

  // Tapping a time books it at once; there is no separate Confirm step.
  // The slot chips themselves.
  const renderSlots = () => {
    const open = slots.filter((s) => !s.past);
    if (open.length === 0) return <Text style={styles.empty}>{tr('freeCall.noSlots')}</Text>;
    return open.map((s) => {
      const on = picked === s.start;
      return (
        <TouchableOpacity
          key={s.start}
          activeOpacity={s.taken ? 1 : 0.85}
          disabled={s.taken || booking}
          style={[styles.slot, s.taken && styles.slotTaken, on && styles.slotOn]}
          onPress={() => {
            captureEvent('free_call_slot_selected', { source, slot_start: s.start });
            setPicked(s.start);
            setError('');
            confirm(s.start);
          }}>
          <Text style={[styles.slotTxt, s.taken && styles.slotTxtTaken, on && styles.slotTxtOn]}>
            {s.label}
          </Text>
          {s.taken && <Text style={styles.takenTag}>{tr('freeCall.taken')}</Text>}
        </TouchableOpacity>
      );
    });
  };

  const confirm = async (slotStart = picked) => {
    if (!slotStart || booking) return;
    setBooking(true);
    setError('');
    try {
      const res = await bookFreeCall(slotStart);
      captureEvent('free_call_booked', {
        source,
        slot_start: slotStart,
        // Whoever the backend actually assigned, or null in manual mode where
        // nobody is assigned yet. No longer falls back to a display persona.
        astrologer_name: res.booking?.astrologerName || null,
      });
      setConfirmed(res.booking);
      setStep('done');
      if (onBooked) onBooked(res.booking);
      afterBooked();
    } catch (e) {
      // ALREADY_BOOKED is deliberately NOT counted as a failure — it ends on the same
      // confirmation screen as a successful booking, so counting it here would inflate
      // the failure rate with outcomes the customer experienced as success. Every other
      // code is a real failure: SLOT_TAKEN is a capacity signal (add astrologers or
      // slots), anything else is an error worth seeing.
      if (e.code !== 'ALREADY_BOOKED') {
        captureEvent('free_call_booking_failed', { source, slot_start: slotStart, reason: e.code || 'other' });
      }
      if (e.code === 'SLOT_TAKEN' || e.code === 'SLOT_PAST') {
        // Someone else won the slot. Re-read the grid so the customer is choosing
        // from the truth, not from the stale list they were just looking at.
        setError(e.code === 'SLOT_TAKEN' ? tr('freeCall.slotTaken') : e.message);
        setPicked(null);
        loadSlots(activeDate);
      } else if (e.code === 'ALREADY_BOOKED' && e.booking) {
        captureEvent('free_call_already_booked', { source });
        setConfirmed(e.booking);
        setStep('done');
        if (onBooked) onBooked(e.booking);
      } else {
        setError(e.message);
      }
    } finally {
      setBooking(false);
    }
  };

  // Declares this modal to the presentation registry so root-level popups wait
  // for it instead of colliding with it on iOS (utils/modalPresentation).
  useModalPresence(visible && !!offer && !inline);

  if (!visible || !offer) return null;

  // The roster is server-built (offer.astrologers) and is now the only source of
  // faces. The typed astrologerName/Image persona that used to back-fill this was
  // removed with the reel (2026-09-05) — a face belonging to nobody bookable is
  // the exact promise this offer should not make. An empty roster renders no
  // cluster at all rather than a placeholder, which AstrologerCluster handles.
  const cluster = Array.isArray(offer.astrologers) ? offer.astrologers : [];

  // Inline, the card GROWS to the page once there are times to show, so the slot grid
  // gets the leftover height and the page itself never scrolls (2026-09-20). On
  // 'intro' it still hugs its content -- a short card is the point; no flex there.
  const card = (
        <View style={[styles.card, inline && styles.cardInline, inline && step !== 'intro' && styles.cardFill]}>

          {/* ── Intro ─────────────────────────────────────────────────── */}
          {step === 'intro' && (
            <>
              {/* Reading order (2026-09-19): a large limited-offer tag, what the offer
                  is, then the button, whose "Claim my FREE call" is the one place FREE
                  appears. The faces and the admin's body text come last and smaller.
                  The admin headerText ("Your first 12-minute call is on us") is not
                  shown: it repeated the headline. */}
              <View style={[styles.header, styles.headerCentered]}>
                <View style={styles.limitedTag}>
                  <MaterialIcons name="card-giftcard" size={moderateScale(19)} color={COLORS.AstroMaroon} />
                  <Text style={styles.limitedTagText}>{tr('freeCall.limitedOffer')}</Text>
                </View>
                <Text style={styles.freeSub}>
                  {tr('freeCall.minutesCall', { count: offer.durationMinutes })}
                </Text>
              </View>

              <View style={styles.introBody}>
                {/* Kept deliberately sparse: faces, the button, one trust line, one link.
                    The divider and the admin bodyText were dropped (2026-09-19); the
                    button's own small line already says when the call comes. */}
                {cluster.length > 0 && <AstrologerCluster list={cluster} t={t} />}

                {/* Claim opens the time slots inside this same card; nothing is booked
                    until a time is tapped (2026-09-20). */}
                <ShineButton
                  style={[styles.cta, styles.ctaBig]}
                  onPress={() => {
                    captureEvent('free_call_claim_tapped', { source });
                    goToSlots();
                  }}>
                  <Text style={[styles.ctaText, styles.ctaBigText]}>{tr('freeCall.claimFree')}</Text>
                </ShineButton>
                <Text style={styles.trustLine}>{tr('freeCall.trustLine')}</Text>
                {!!error && <Text style={styles.error}>{error}</Text>}

              </View>
            </>
          )}

          {/* ── Slot picker ───────────────────────────────────────────── */}
          {step === 'slots' && (
            <>
              <View style={styles.header}>
                <Text style={styles.headerSmall}>{tr('freeCall.pickDate')}</Text>
              </View>

              {/* flexGrow 0 + flex-start is load-bearing (2026-09-20): once the card
                  flexes to fill the page, a horizontal ScrollView with no height of
                  its own eats the leftover space and stretches every date chip to the
                  full height of it. */}
              <ScrollView
                horizontal
                style={styles.dateScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateStrip}>
                {dates.map((d) => {
                  const on = d.key === activeDate;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      activeOpacity={0.85}
                      style={[styles.dateChip, on && styles.dateChipOn]}
                      onPress={() => {
                        captureEvent('free_call_date_selected', { source, date: d.key });
                        setPicked(null);
                        loadSlots(d.key);
                      }}>
                      <Text style={[styles.dateDay, on && styles.dateOnTxt]}>{d.label.day}</Text>
                      <Text style={[styles.dateNum, on && styles.dateOnTxt]}>{d.label.date}</Text>
                      <Text style={[styles.dateMon, on && styles.dateOnTxt]}>{d.label.month}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.sectionLabel}>{tr('freeCall.pickTime')}</Text>

              {/* One compact, scrolling box wherever this card appears. It used to be a
                  vertical ScrollView nested inside the signup Welcome page's own
                  ScrollView, which on Android does not scroll at all without
                  nestedScrollEnabled — so every time past the first dozen was simply
                  unreachable, on every date, for every customer who signed up. The flag
                  below is what makes the inner list win the gesture.

                  The box is also sized to the screen now rather than a hardcoded 196dp:
                  the live offer generates FORTY times a day and the old window showed
                  about twelve of them. */}
              <View style={[styles.slotArea, inline && styles.slotAreaFill]}>
                {loadingSlots ? (
                  <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginTop: verticalScale(30) }} />
                ) : (
                  <ScrollView
                    ref={slotScrollRef}
                    contentContainerStyle={styles.slotGrid}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    persistentScrollbar
                    scrollEventThrottle={16}
                    onScroll={(e) => refreshMoreBelow(e.nativeEvent.contentOffset.y)}
                    onContentSizeChange={(w, h) => { slotContentH.current = h; refreshMoreBelow(0); maybeHintScroll(); }}
                    onLayout={(e) => { slotViewH.current = e.nativeEvent.layout.height; refreshMoreBelow(0); maybeHintScroll(); }}
                    onScrollBeginDrag={() => { userScrolledSlots.current = true; clearHintTimers(); }}>
                    {renderSlots()}
                  </ScrollView>
                )}

                {/* Sits over the last row so the chips are visibly cut off rather than
                    ending cleanly — a list with a tidy bottom edge looks complete. Not
                    touchable, so it never eats a tap meant for the time underneath. */}
                {moreBelow && !loadingSlots && (
                  <View style={styles.moreBelowWrap} pointerEvents="none">
                    <View style={styles.moreFadeA} />
                    <View style={styles.moreFadeB} />
                    <Animated.View
                      style={[
                        styles.morePill,
                        { transform: [{ translateY: chevronBounce.interpolate({ inputRange: [0, 1], outputRange: [0, verticalScale(4)] }) }] },
                      ]}>
                      <Text style={styles.morePillTxt}>{tr('freeCall.moreTimes')}</Text>
                      <MaterialIcons name="keyboard-arrow-down" size={moderateScale(16)} color={COLORS.AstroMaroon} />
                    </Animated.View>
                  </View>
                )}
              </View>

              {!!error && <Text style={styles.error}>{error}</Text>}

              {/* No Confirm button: tapping a time books it. This line says so, and
                  shows progress while the booking goes through. */}
              <View style={[styles.footer, styles.bookingStatus]}>
                {booking && <ActivityIndicator color={COLORS.AstroMaroon} />}
                <Text style={styles.bookingStatusText}>
                  {booking ? tr('freeCall.booking') : tr('freeCall.tapToBook')}
                </Text>
              </View>
            </>
          )}

          {/* ── Confirmed ─────────────────────────────────────────────── */}
          {step === 'done' && confirmed && (
            <>
              <View style={styles.header}>
                <Text style={styles.headerSmall}>{tr('freeCall.slotBooked')}</Text>
              </View>
              <View style={styles.doneBody}>
                <View style={styles.tick}>
                  <MaterialIcons name="check" size={moderateScale(30)} color="#fff" />
                </View>
                <Text style={styles.doneTime}>{confirmed.label}</Text>
                <Text style={styles.doneDate}>{prettyDate(confirmed.dateKey)}</Text>
                <Text style={styles.doneNote}>
                  {/* Prefer the number snapshotted on the booking — that is the
                      one the astrologer will dial. Falls back to the profile's,
                      and to a phone-less sentence if neither is known, so this
                      can never read "will call you on ."

                      No astrologer NAME here (2026-09-05). The offer is not a
                      promise about a particular person — pool mode can assign any
                      of several, and in manual mode nobody is assigned yet when
                      this screen is shown, so naming one would have been a claim
                      the backend might not keep. `confirmed.astrologerName` is
                      still snapshotted on the booking for the admin and the
                      vendor's own list; it just isn't quoted to the customer. */}
                  {(() => {
                    const num = confirmed.customerPhone || phone || '';
                    return num
                      ? tr('freeCall.callingYou', { phone: num })
                      : tr('freeCall.callingYouNoPhone');
                  })()}
                </Text>
                {needsBirthDetails ? (
                  // Opens by itself about 2 seconds after booking (afterBooked).
                  <View style={styles.lastStepRow}>
                    <ActivityIndicator color={COLORS.AstroMaroon} size="small" />
                    <Text style={styles.lastStepText}>{tr('freeCall.lastStep')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.cta, styles.ctaFooter]}
                    activeOpacity={0.85}
                    onPress={() => {
                      captureEvent('free_call_confirmed_done');
                      if (onClose) onClose();
                    }}>
                    <Text style={styles.ctaText}>{tr('freeCall.done')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
  );

  if (inline) return card;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={step === 'done' ? onClose : dismiss}>
      <View style={styles.overlay}>
        {/* No close button and no "Maybe later" (2026-09-19): the offer is closed only
            by tapping the dimmed area around the card. The backdrop sits BEHIND the
            card as a sibling, so taps on the card (and its scrolling date/slot lists)
            never reach it. Android back still closes it via onRequestClose. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={step === 'done' ? onClose : dismiss}
          accessibilityRole="button"
          accessibilityLabel={tr('freeCall.notNow')}
        />
        {card}
      </View>
    </Modal>
  );
};

// The slot grid is the whole point of this screen and it must not be a peephole.
// With the live offer (11:30-24:00 at 15-minute steps) the server returns FORTY slots a
// day; the old fixed 196dp box showed about twelve, so most of the day was unreachable
// for anyone whose scroll did not work — and on the signup Welcome screen it never did
// (see the nested-scroll note below). Sized against the screen instead of hardcoded, and
// bounded so the card still fits on a small phone.
const SCREEN_H = Dimensions.get('window').height;
const SLOT_AREA_H = Math.min(Math.max(SCREEN_H * 0.38, 220), 340);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// dateKey is 'YYYY-MM-DD' already in the offer's business timezone, so it is
// formatted as plain digits — never fed back through `new Date(...)` local
// getters, which would shift it a day for customers west of India.
function prettyDate(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${d} ${MONTHS[m - 1]} ${y}`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,12,6,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  // On the signup Welcome screen the card sits on the same brown as its own header,
  // so a gold edge is what separates the two.
  cardInline: { borderWidth: 1.5, borderColor: COLORS.AstroGold },
  cardFill: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: scale(360),
    backgroundColor: CREAM,
    borderRadius: moderateScale(22),
    overflow: 'hidden',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(16),
  },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  headerCentered: { alignItems: 'center', paddingTop: verticalScale(20), paddingBottom: verticalScale(18) },
  limitedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(24),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(7),
  },
  limitedTagText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(15),
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  freeSub: {
    color: '#fff',
    fontSize: moderateScale(22),
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: moderateScale(29),
    marginTop: verticalScale(12),
  },
  ctaBig: { paddingVertical: verticalScale(16), marginTop: verticalScale(16), borderRadius: moderateScale(16) },
  ctaBigText: { fontSize: moderateScale(18), fontWeight: '800' },
  trustLine: { color: '#2E7D4F', fontSize: moderateScale(12.5), fontWeight: '700', marginTop: verticalScale(10), textAlign: 'center' },
  minutes: {
    color: COLORS.AstroGold,
    fontSize: moderateScale(11),
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerText: {
    color: '#fff',
    fontSize: moderateScale(19),
    fontWeight: '700',
    marginTop: verticalScale(6),
    paddingRight: scale(24),
  },
  headerSmall: {
    color: '#fff',
    fontSize: moderateScale(17),
    fontWeight: '700',
    paddingRight: scale(24),
  },

  bookingStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8) },
  bookingStatusText: { color: '#6f5a4c', fontSize: moderateScale(13.5), fontWeight: '600', textAlign: 'center' },
  lastStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginTop: verticalScale(16),
    paddingHorizontal: scale(6),
  },
  lastStepText: { flexShrink: 1, color: COLORS.AstroMaroon, fontSize: moderateScale(14), fontWeight: '700' },
  introBody: { alignItems: 'center', paddingHorizontal: scale(20), paddingVertical: verticalScale(18) },

  clusterWrap: { alignItems: 'center' },
  clusterRow: { flexDirection: 'row', alignItems: 'center' },
  clusterFace: {
    width: CLUSTER_FACE,
    height: CLUSTER_FACE,
    borderRadius: CLUSTER_FACE / 2,
    backgroundColor: '#F3E3D2',
    // The white ring is what separates one face from the next once they overlap —
    // without it the cluster reads as one blurred shape at this size.
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterDetail: {
    fontSize: moderateScale(12.5),
    color: '#6f5a4c',
    marginTop: verticalScale(3),
    textAlign: 'center',
    paddingHorizontal: scale(10),
  },
  clusterLabel: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#2E1A10',
    marginTop: verticalScale(10),
    textAlign: 'center',
    paddingHorizontal: scale(10),
  },

  cta: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(13),
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: verticalScale(16),
  },
  ctaFooter: { marginTop: verticalScale(4) },
  ctaDisabled: { backgroundColor: '#B99C8A' },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14.5) },

  dateScroll: { flexGrow: 0, flexShrink: 0 },
  dateStrip: { paddingHorizontal: scale(14), paddingVertical: verticalScale(12), gap: scale(8), alignItems: 'flex-start' },
  dateChip: {
    width: scale(54),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dateChipOn: { backgroundColor: COLORS.AstroMaroon, borderColor: COLORS.AstroMaroon },
  dateDay: { fontSize: moderateScale(10.5), color: '#8A6A55', fontWeight: '600' },
  dateNum: { fontSize: moderateScale(18), color: '#2E1A10', fontWeight: '700' },
  dateMon: { fontSize: moderateScale(10.5), color: '#8A6A55', fontWeight: '600' },
  dateOnTxt: { color: '#fff' },

  sectionLabel: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#A98A72',
    paddingHorizontal: scale(18),
    marginBottom: verticalScale(6),
  },
  slotArea: { height: SLOT_AREA_H, paddingHorizontal: scale(14) },
  // Inline the card owns the page, so the times take whatever height is left rather
  // than a measured slice of the screen.
  slotAreaFill: { height: undefined, flex: 1 },
  moreBelowWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: verticalScale(46),
  },
  // Two stacked translucent bands stand in for a gradient (no gradient library here),
  // enough to soften the cut-off edge under the pill.
  moreFadeA: { position: 'absolute', left: 0, right: 0, bottom: 0, height: verticalScale(30), backgroundColor: 'rgba(253,248,243,0.75)' },
  moreFadeB: { position: 'absolute', left: 0, right: 0, bottom: 0, height: verticalScale(16), backgroundColor: 'rgba(253,248,243,0.95)' },
  morePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(999),
    backgroundColor: '#FFF4E8',
    borderWidth: 1,
    borderColor: '#E8D5C3',
    marginBottom: verticalScale(2),
  },
  morePillTxt: { fontSize: moderateScale(11), fontWeight: '700', color: COLORS.AstroMaroon },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), paddingBottom: verticalScale(8) },
  slot: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(9),
    borderRadius: moderateScale(11),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#fff',
    minWidth: scale(78),
    alignItems: 'center',
  },
  slotOn: { backgroundColor: COLORS.AstroMaroon, borderColor: COLORS.AstroMaroon },
  slotTaken: { backgroundColor: '#EFE6DE', borderColor: '#E2D3C7' },
  slotTxt: { fontSize: moderateScale(13.5), fontWeight: '600', color: '#2E1A10' },
  slotTxtOn: { color: '#fff', fontWeight: '700' },
  slotTxtTaken: { color: '#B0998A', textDecorationLine: 'line-through' },
  takenTag: { fontSize: moderateScale(9), color: '#B0998A', marginTop: verticalScale(1), fontWeight: '600' },
  empty: {
    fontSize: moderateScale(13),
    color: '#8A6A55',
    textAlign: 'center',
    width: '100%',
    marginTop: verticalScale(28),
    paddingHorizontal: scale(20),
  },
  error: {
    color: '#C0392B',
    fontSize: moderateScale(12.5),
    paddingHorizontal: scale(18),
    marginTop: verticalScale(4),
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(10),
    paddingBottom: verticalScale(14),
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: verticalScale(8),
  },

  doneBody: { alignItems: 'center', paddingHorizontal: scale(22), paddingVertical: verticalScale(22) },
  tick: {
    width: scale(54),
    height: scale(54),
    borderRadius: scale(27),
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTime: {
    fontSize: moderateScale(24),
    fontWeight: '800',
    color: '#2E1A10',
    marginTop: verticalScale(12),
  },
  doneDate: { fontSize: moderateScale(13.5), color: '#8A6A55', marginTop: verticalScale(2) },
  doneNote: {
    fontSize: moderateScale(13.5),
    color: '#4A3325',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginTop: verticalScale(12),
  },
});

export default FreeCallOffer;
