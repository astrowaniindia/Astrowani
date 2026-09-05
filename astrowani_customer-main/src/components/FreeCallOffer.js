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
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { getFreeCallSlots, bookFreeCall } from '../api/FreeCallApi';
import {useModalPresence} from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';

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
    </View>
  );
};

const FreeCallOffer = ({ visible, offer, phone, onClose, onBooked, t, source = 'auto' }) => {
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

  const tr = (k, p) => (typeof t === 'function' ? t(k, p) : k);

  // Reset whenever the sheet is reopened, so a customer who backed out mid-flow
  // doesn't come back to a stale selection.
  useEffect(() => {
    if (visible) {
      setStep('intro');
      setPicked(null);
      setError('');
      setConfirmed(null);
      if (offer) captureEvent('free_call_offer_shown', { source });
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

  const goToSlots = () => {
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

  const confirm = async () => {
    if (!picked || booking) return;
    setBooking(true);
    setError('');
    try {
      const res = await bookFreeCall(picked);
      captureEvent('free_call_booked', {
        source,
        slot_start: picked,
        // Whoever the backend actually assigned, or null in manual mode where
        // nobody is assigned yet. No longer falls back to a display persona.
        astrologer_name: res.booking?.astrologerName || null,
      });
      setConfirmed(res.booking);
      setStep('done');
      if (onBooked) onBooked(res.booking);
    } catch (e) {
      // ALREADY_BOOKED is deliberately NOT counted as a failure — it ends on the same
      // confirmation screen as a successful booking, so counting it here would inflate
      // the failure rate with outcomes the customer experienced as success. Every other
      // code is a real failure: SLOT_TAKEN is a capacity signal (add astrologers or
      // slots), anything else is an error worth seeing.
      if (e.code !== 'ALREADY_BOOKED') {
        captureEvent('free_call_booking_failed', { source, slot_start: picked, reason: e.code || 'other' });
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
  useModalPresence(visible && !!offer);

  if (!visible || !offer) return null;

  // The roster is server-built (offer.astrologers) and is now the only source of
  // faces. The typed astrologerName/Image persona that used to back-fill this was
  // removed with the reel (2026-09-05) — a face belonging to nobody bookable is
  // the exact promise this offer should not make. An empty roster renders no
  // cluster at all rather than a placeholder, which AstrologerCluster handles.
  const cluster = Array.isArray(offer.astrologers) ? offer.astrologers : [];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={step === 'done' ? onClose : dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={step === 'done' ? onClose : dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={moderateScale(20)} color="#fff" />
          </TouchableOpacity>

          {/* ── Intro ─────────────────────────────────────────────────── */}
          {step === 'intro' && (
            <>
              <View style={styles.header}>
                <View style={styles.giftRow}>
                  <MaterialIcons name="card-giftcard" size={moderateScale(20)} color={COLORS.AstroGold} />
                  <Text style={styles.minutes}>
                    {tr('freeCall.minutes', { count: offer.durationMinutes })}
                  </Text>
                </View>
                <Text style={styles.headerText}>{offer.headerText}</Text>
              </View>

              <View style={styles.introBody}>
                {cluster.length > 0 && <AstrologerCluster list={cluster} t={t} />}
                {!!offer.bodyText && <Text style={styles.bodyText}>{offer.bodyText}</Text>}

                <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={goToSlots}>
                  <Text style={styles.ctaText}>{offer.ctaText}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismiss} style={styles.later}>
                  <Text style={styles.laterText}>{tr('freeCall.notNow')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Slot picker ───────────────────────────────────────────── */}
          {step === 'slots' && (
            <>
              <View style={styles.header}>
                <Text style={styles.headerSmall}>{tr('freeCall.pickDate')}</Text>
              </View>

              <ScrollView
                horizontal
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

              <View style={styles.slotArea}>
                {loadingSlots ? (
                  <ActivityIndicator color={COLORS.AstroMaroon} style={{ marginTop: verticalScale(30) }} />
                ) : (
                  <ScrollView contentContainerStyle={styles.slotGrid}>
                    {slots.filter((s) => !s.past).length === 0 ? (
                      <Text style={styles.empty}>{tr('freeCall.noSlots')}</Text>
                    ) : (
                      slots.filter((s) => !s.past).map((s) => {
                        const on = picked === s.start;
                        return (
                          <TouchableOpacity
                            key={s.start}
                            activeOpacity={s.taken ? 1 : 0.85}
                            disabled={s.taken}
                            style={[
                              styles.slot,
                              s.taken && styles.slotTaken,
                              on && styles.slotOn,
                            ]}
                            onPress={() => {
                              captureEvent('free_call_slot_selected', { source, slot_start: s.start });
                              setPicked(s.start);
                              setError('');
                            }}>
                            <Text style={[
                              styles.slotTxt,
                              s.taken && styles.slotTxtTaken,
                              on && styles.slotTxtOn,
                            ]}>{s.label}</Text>
                            {s.taken && (
                              <Text style={styles.takenTag}>{tr('freeCall.taken')}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>

              {!!error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.cta, styles.ctaFooter, !picked && styles.ctaDisabled]}
                  activeOpacity={picked ? 0.85 : 1}
                  disabled={!picked || booking}
                  onPress={confirm}>
                  <Text style={styles.ctaText}>
                    {booking ? tr('freeCall.booking') : tr('freeCall.confirm')}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Confirmed ─────────────────────────────────────────────── */}
          {step === 'done' && confirmed && (
            <>
              <View style={styles.header}>
                <Text style={styles.headerSmall}>{tr('freeCall.yourCall')}</Text>
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
                <TouchableOpacity
                  style={[styles.cta, styles.ctaFooter]}
                  activeOpacity={0.85}
                  onPress={() => {
                    captureEvent('free_call_confirmed_done');
                    if (onClose) onClose();
                  }}>
                  <Text style={styles.ctaText}>{tr('freeCall.done')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

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
  closeBtn: {
    position: 'absolute',
    top: verticalScale(12),
    right: scale(12),
    zIndex: 2,
    padding: scale(2),
  },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(16),
  },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
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
  clusterLabel: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#2E1A10',
    marginTop: verticalScale(12),
    textAlign: 'center',
    paddingHorizontal: scale(10),
  },
  bodyText: {
    fontSize: moderateScale(13.5),
    color: '#4A3325',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginTop: verticalScale(12),
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
  later: { marginTop: verticalScale(10), padding: scale(6) },
  laterText: { color: '#8A6A55', fontSize: moderateScale(13), fontWeight: '600' },

  dateStrip: { paddingHorizontal: scale(14), paddingVertical: verticalScale(12), gap: scale(8) },
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
  slotArea: { height: verticalScale(196), paddingHorizontal: scale(14) },
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
