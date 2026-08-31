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

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';

const FreeCallOffer = ({ visible, offer, phone, onClose, onBooked, t }) => {
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
    }
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
    setStep('slots');
    loadSlots(null);
  };

  const confirm = async () => {
    if (!picked || booking) return;
    setBooking(true);
    setError('');
    try {
      const res = await bookFreeCall(picked);
      setConfirmed(res.booking);
      setStep('done');
      if (onBooked) onBooked(res.booking);
    } catch (e) {
      if (e.code === 'SLOT_TAKEN' || e.code === 'SLOT_PAST') {
        // Someone else won the slot. Re-read the grid so the customer is choosing
        // from the truth, not from the stale list they were just looking at.
        setError(e.code === 'SLOT_TAKEN' ? tr('freeCall.slotTaken') : e.message);
        setPicked(null);
        loadSlots(activeDate);
      } else if (e.code === 'ALREADY_BOOKED' && e.booking) {
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

  if (!visible || !offer) return null;

  const astroImage = offer.astrologerImage
    ? { uri: offer.astrologerImage }
    : require('../assets/images/brandStarLogo.png');

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
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
                <Image source={astroImage} style={styles.avatar} />
                <Text style={styles.astroName}>{offer.astrologerName}</Text>
                {!!offer.astrologerExperience && (
                  <Text style={styles.astroMeta}>
                    {tr('freeCall.experience', { years: offer.astrologerExperience })}
                  </Text>
                )}
                {!!offer.astrologerSpecialities && (
                  <Text style={styles.astroSpec}>{offer.astrologerSpecialities}</Text>
                )}
                {!!offer.bodyText && <Text style={styles.bodyText}>{offer.bodyText}</Text>}

                <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={goToSlots}>
                  <Text style={styles.ctaText}>{offer.ctaText}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.later}>
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
                      onPress={() => { setPicked(null); loadSlots(d.key); }}>
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
                            onPress={() => { setPicked(s.start); setError(''); }}>
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
                  {tr('freeCall.callingYou', {
                    name: confirmed.astrologerName || offer.astrologerName,
                    phone: phone || '',
                  })}
                </Text>
                <TouchableOpacity style={[styles.cta, styles.ctaFooter]} activeOpacity={0.85} onPress={onClose}>
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
  avatar: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    borderWidth: 2,
    borderColor: COLORS.AstroGold,
    backgroundColor: '#F3E3D2',
  },
  astroName: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#2E1A10',
    marginTop: verticalScale(10),
  },
  astroMeta: { fontSize: moderateScale(12.5), color: '#8A6A55', marginTop: verticalScale(2) },
  astroSpec: {
    fontSize: moderateScale(12.5),
    color: '#8A6A55',
    textAlign: 'center',
    marginTop: verticalScale(2),
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
