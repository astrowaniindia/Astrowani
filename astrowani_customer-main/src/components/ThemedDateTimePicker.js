// Brand-themed replacement for @react-native-community/datetimepicker.
//
// WHY THIS EXISTS
// 1. Theming — the community picker renders the OS dialog, so it ignored the
//    app's palette entirely and looked like a stock Android/iOS sheet dropped
//    into a maroon app.
// 2. Pre-1970 birth dates were impossible to enter. No call site ever passed
//    `minimumDate`, so the underlying dialog fell back to its own default
//    minimum — the Unix epoch on the affected devices — and silently clamped
//    anything earlier up to 01 Jan 1970. A customer born in 1965 could not
//    record their own date of birth, which for an astrology app makes every
//    chart and report wrong. This picker owns its own year list, so the range
//    is an explicit decision (DEFAULT_MIN_YEAR) rather than an OS default.
//
// DROP-IN CONTRACT: props and the onChange signature deliberately mirror the
// community picker — `value`, `mode`, `onChange(event, date)`, `minimumDate`,
// `maximumDate` — so call sites only swap the import. `event.type` is 'set' on
// confirm and 'dismissed' on cancel, same as the library.
//
// NOTE for call sites: the old handlers commonly did
// `setShowPicker(Platform.OS === 'ios')`, because the iOS spinner stayed
// inline while the Android dialog closed itself. This picker is a Modal on
// both platforms, so that must become `setShowPicker(false)` or the modal
// never closes on iOS.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';

// 1900 covers any living customer with room to spare. The previous behaviour
// effectively made this 1970 — see the header note.
const DEFAULT_MIN_YEAR = 1900;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const clone = (d) => new Date(d.getTime());
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const sameDay = (a, b) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Compares by calendar day only. Comparing raw timestamps would reject a date
// picked on the boundary day itself (e.g. a customer born today), because the
// bound usually carries the current time-of-day.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const ThemedDateTimePicker = ({
  value,
  mode = 'date',
  onChange,
  minimumDate,
  maximumDate,
  title,
}) => {
  const initial = useMemo(
    () => (value instanceof Date && !isNaN(value.getTime()) ? clone(value) : new Date()),
    [value],
  );

  const [draft, setDraft] = useState(initial);
  // 'days' | 'months' | 'years' for date mode.
  const [pane, setPane] = useState('days');
  // The month being displayed, which is not the same as the selected date —
  // the user can browse away without changing their selection.
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const yearScrollRef = useRef(null);

  const minYear = minimumDate ? minimumDate.getFullYear() : DEFAULT_MIN_YEAR;
  const maxYear = maximumDate ? maximumDate.getFullYear() : new Date().getFullYear() + 5;
  const years = useMemo(() => {
    const out = [];
    for (let y = maxYear; y >= minYear; y--) out.push(y);
    return out;
  }, [minYear, maxYear]);

  const emit = (type, date) => {
    if (typeof onChange === 'function') {
      onChange({ type, nativeEvent: { timestamp: date ? date.getTime() : undefined } }, date);
    }
  };

  const outOfRange = (d) => {
    const day = startOfDay(d);
    if (minimumDate && day < startOfDay(minimumDate)) return true;
    if (maximumDate && day > startOfDay(maximumDate)) return true;
    return false;
  };

  /* ------------------------------- date pane ------------------------------ */

  const grid = useMemo(() => {
    const lead = new Date(viewYear, viewMonth, 1).getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y < minYear || y > maxYear) return;
    setViewMonth(m);
    setViewYear(y);
  };

  const pickDay = (day) => {
    const next = new Date(viewYear, viewMonth, day, draft.getHours(), draft.getMinutes());
    if (outOfRange(next)) return;
    setDraft(next);
  };

  // Keeps the selection valid when the user jumps to a month with fewer days
  // (31 Jan -> Feb) or to a year where the current day falls outside the range.
  const applyYearMonth = (y, m) => {
    const capped = Math.min(draft.getDate(), daysInMonth(y, m));
    let next = new Date(y, m, capped, draft.getHours(), draft.getMinutes());
    if (minimumDate && startOfDay(next) < startOfDay(minimumDate)) next = clone(minimumDate);
    if (maximumDate && startOfDay(next) > startOfDay(maximumDate)) next = clone(maximumDate);
    setDraft(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  useEffect(() => {
    if (pane !== 'years' || !yearScrollRef.current) return;
    // Land on the selected year rather than at the top of a 120-year list.
    const idx = years.indexOf(draft.getFullYear());
    if (idx < 0) return;
    const row = Math.floor(idx / 4);
    const t = setTimeout(() => {
      yearScrollRef.current?.scrollTo({ y: Math.max(0, row * verticalScale(46) - verticalScale(92)), animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [pane, years, draft]);

  /* ------------------------------- time pane ------------------------------ */

  const hour24 = draft.getHours();
  const isPM = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const setTime = (h12, minute, pm) => {
    let h = h12 % 12;
    if (pm) h += 12;
    setDraft(new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), h, minute));
  };

  const hourRef = useRef(null);
  const minRef = useRef(null);
  const ROW = verticalScale(44);

  useEffect(() => {
    if (mode !== 'time') return;
    const t = setTimeout(() => {
      hourRef.current?.scrollTo({ y: (hour12 - 1) * ROW, animated: false });
      minRef.current?.scrollTo({ y: draft.getMinutes() * ROW, animated: false });
    }, 0);
    return () => clearTimeout(t);
    // Position once on open; re-running on every tap would fight the user's scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const headerLine = mode === 'time'
    ? `${hour12}:${String(draft.getMinutes()).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
    : `${WEEKDAY_LONG[draft.getDay()]}, ${draft.getDate()} ${MONTHS_SHORT[draft.getMonth()]} ${draft.getFullYear()}`;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => emit('dismissed', undefined)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerLabel}>
              {title || (mode === 'time' ? 'Select time' : 'Select date')}
            </Text>
            <Text style={styles.headerValue}>{headerLine}</Text>
          </View>

          {mode === 'time' ? (
            <View style={styles.timeBody}>
              <View style={styles.wheelRow}>
                <Wheel
                  innerRef={hourRef}
                  rowHeight={ROW}
                  data={Array.from({ length: 12 }, (_, i) => i + 1)}
                  selected={hour12}
                  format={(v) => String(v)}
                  onSelect={(v) => setTime(v, draft.getMinutes(), isPM)}
                />
                <Text style={styles.colon}>:</Text>
                <Wheel
                  innerRef={minRef}
                  rowHeight={ROW}
                  data={Array.from({ length: 60 }, (_, i) => i)}
                  selected={draft.getMinutes()}
                  format={(v) => String(v).padStart(2, '0')}
                  onSelect={(v) => setTime(hour12, v, isPM)}
                />
                <View style={styles.meridiem}>
                  {['AM', 'PM'].map((m) => {
                    const active = (m === 'PM') === isPM;
                    return (
                      <TouchableOpacity
                        key={m}
                        activeOpacity={0.8}
                        style={[styles.meridiemBtn, active && styles.meridiemBtnActive]}
                        onPress={() => setTime(hour12, draft.getMinutes(), m === 'PM')}>
                        <Text style={[styles.meridiemTxt, active && styles.meridiemTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.body}>
              <View style={styles.navRow}>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => shiftMonth(-1)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.navTxt}>‹</Text>
                </TouchableOpacity>

                <View style={styles.navLabels}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.navChip, pane === 'months' && styles.navChipActive]}
                    onPress={() => setPane(pane === 'months' ? 'days' : 'months')}>
                    <Text style={[styles.navChipTxt, pane === 'months' && styles.navChipTxtActive]}>
                      {MONTHS[viewMonth]}
                    </Text>
                  </TouchableOpacity>
                  {/* The year is a button, not a label. Reaching 1965 by paging
                      months would be 730 taps; here it is two. */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.navChip, pane === 'years' && styles.navChipActive]}
                    onPress={() => setPane(pane === 'years' ? 'days' : 'years')}>
                    <Text style={[styles.navChipTxt, pane === 'years' && styles.navChipTxtActive]}>
                      {viewYear} ▾
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => shiftMonth(1)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.navTxt}>›</Text>
                </TouchableOpacity>
              </View>

              {pane === 'years' && (
                <ScrollView ref={yearScrollRef} style={styles.pane} contentContainerStyle={styles.paneGrid}>
                  {years.map((y) => {
                    const active = y === draft.getFullYear();
                    return (
                      <TouchableOpacity
                        key={y}
                        activeOpacity={0.8}
                        style={[styles.yearCell, active && styles.cellActive]}
                        onPress={() => { applyYearMonth(y, viewMonth); setPane('days'); }}>
                        <Text style={[styles.yearTxt, active && styles.cellTxtActive]}>{y}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {pane === 'months' && (
                <View style={[styles.pane, styles.paneGrid]}>
                  {MONTHS_SHORT.map((m, i) => {
                    const active = i === draft.getMonth() && viewYear === draft.getFullYear();
                    return (
                      <TouchableOpacity
                        key={m}
                        activeOpacity={0.8}
                        style={[styles.monthCell, active && styles.cellActive]}
                        onPress={() => { applyYearMonth(viewYear, i); setPane('days'); }}>
                        <Text style={[styles.yearTxt, active && styles.cellTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {pane === 'days' && (
                <View style={styles.pane}>
                  <View style={styles.weekRow}>
                    {WEEKDAYS.map((w, i) => (
                      <Text key={`${w}${i}`} style={styles.weekTxt}>{w}</Text>
                    ))}
                  </View>
                  <View style={styles.dayGrid}>
                    {grid.map((day, i) => {
                      if (day === null) return <View key={`b${i}`} style={styles.dayCell} />;
                      const thisDate = new Date(viewYear, viewMonth, day);
                      const disabled = outOfRange(thisDate);
                      const selected = sameDay(thisDate, draft);
                      const today = sameDay(thisDate, new Date());
                      return (
                        <TouchableOpacity
                          key={day}
                          activeOpacity={disabled ? 1 : 0.8}
                          disabled={disabled}
                          style={styles.dayCell}
                          onPress={() => pickDay(day)}>
                          <View style={[
                            styles.dayPill,
                            today && !selected && styles.dayPillToday,
                            selected && styles.dayPillSelected,
                          ]}>
                            <Text style={[
                              styles.dayTxt,
                              disabled && styles.dayTxtDisabled,
                              selected && styles.dayTxtSelected,
                            ]}>{day}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.8}
              onPress={() => emit('dismissed', undefined)}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.okBtn}
              activeOpacity={0.85}
              onPress={() => emit('set', draft)}>
              <Text style={styles.okTxt}>{mode === 'time' ? 'Set time' : 'Set date'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Snapping list used for hours and minutes. A plain ScrollView with
// snapToInterval is enough here and keeps this component free of any native
// dependency, so it ships over OTA like the rest of the JS.
//
// Whatever the scroll settles on IS the selection (onMomentumScrollEnd). Taps
// alone are not enough: spinning the wheel to a value and pressing "Set time"
// would otherwise silently keep the previous one.
const Wheel = ({ innerRef, data, selected, onSelect, format, rowHeight }) => (
  <View style={[styles.wheel, { height: rowHeight * 3 }]}>
    <View style={[styles.wheelHighlight, { height: rowHeight, top: rowHeight }]} pointerEvents="none" />
    <ScrollView
      ref={innerRef}
      showsVerticalScrollIndicator={false}
      snapToInterval={rowHeight}
      decelerationRate="fast"
      onMomentumScrollEnd={(e) => {
        const i = Math.round(e.nativeEvent.contentOffset.y / rowHeight);
        const v = data[Math.max(0, Math.min(data.length - 1, i))];
        if (v !== undefined && v !== selected) onSelect(v);
      }}
      contentContainerStyle={{ paddingVertical: rowHeight }}>
      {data.map((v) => {
        const active = v === selected;
        return (
          <TouchableOpacity
            key={v}
            activeOpacity={0.7}
            style={[styles.wheelRowItem, { height: rowHeight }]}
            onPress={() => onSelect(v)}>
            <Text style={[styles.wheelTxt, active && styles.wheelTxtActive]}>{format(v)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,12,6,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(22),
  },
  card: {
    width: '100%',
    maxWidth: scale(360),
    backgroundColor: CREAM,
    borderRadius: moderateScale(20),
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(14),
  },
  headerLabel: {
    color: COLORS.AstroSoftOrange,
    fontSize: moderateScale(11),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  headerValue: {
    color: '#fff',
    fontSize: moderateScale(21),
    fontWeight: '700',
    marginTop: verticalScale(4),
  },

  body: { paddingHorizontal: scale(14), paddingTop: verticalScale(12) },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(8),
  },
  navBtn: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E3D2',
  },
  navTxt: {
    fontSize: moderateScale(22),
    color: COLORS.AstroMaroon,
    lineHeight: moderateScale(26),
    marginTop: Platform.OS === 'ios' ? -2 : -4,
  },
  navLabels: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  navChip: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(999),
    borderWidth: 1,
    borderColor: BORDER,
  },
  navChipActive: { backgroundColor: COLORS.AstroMaroon, borderColor: COLORS.AstroMaroon },
  navChipTxt: { color: COLORS.AstroMaroon, fontWeight: '700', fontSize: moderateScale(14) },
  navChipTxtActive: { color: '#fff' },

  pane: { minHeight: verticalScale(232), maxHeight: verticalScale(232) },
  paneGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: verticalScale(4) },

  weekRow: { flexDirection: 'row', marginBottom: verticalScale(4) },
  weekTxt: {
    flex: 1,
    textAlign: 'center',
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#A98A72',
  },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(2),
  },
  dayPill: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(17),
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillToday: { borderWidth: 1.5, borderColor: COLORS.AstroGold },
  dayPillSelected: { backgroundColor: COLORS.AstroMaroon },
  dayTxt: { fontSize: moderateScale(14), color: '#3A2418', fontWeight: '600' },
  dayTxtDisabled: { color: '#CBB9AA' },
  dayTxtSelected: { color: '#fff', fontWeight: '700' },

  yearCell: {
    width: '25%',
    paddingVertical: verticalScale(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCell: {
    width: '25%',
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(10) },
  yearTxt: { fontSize: moderateScale(14), fontWeight: '600', color: '#3A2418' },
  cellTxtActive: { color: '#fff', fontWeight: '700' },

  timeBody: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(6),
    minHeight: verticalScale(180),
    justifyContent: 'center',
  },
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wheel: { width: scale(62), overflow: 'hidden' },
  wheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#F3E3D2',
    borderRadius: moderateScale(10),
  },
  wheelRowItem: { alignItems: 'center', justifyContent: 'center' },
  wheelTxt: { fontSize: moderateScale(19), color: '#B09585', fontWeight: '600' },
  wheelTxtActive: { color: COLORS.AstroMaroon, fontWeight: '800', fontSize: moderateScale(22) },
  colon: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: COLORS.AstroMaroon,
    marginHorizontal: scale(2),
  },
  meridiem: { marginLeft: scale(14), gap: verticalScale(8) },
  meridiemBtn: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  meridiemBtnActive: { backgroundColor: COLORS.AstroMaroon, borderColor: COLORS.AstroMaroon },
  meridiemTxt: { fontSize: moderateScale(13), fontWeight: '700', color: COLORS.AstroMaroon },
  meridiemTxtActive: { color: '#fff' },

  footer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    gap: scale(10),
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: verticalScale(11),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  cancelTxt: { color: COLORS.AstroMaroon, fontWeight: '700', fontSize: moderateScale(14) },
  okBtn: {
    flex: 1.4,
    paddingVertical: verticalScale(11),
    borderRadius: moderateScale(12),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
  },
  okTxt: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

export default ThemedDateTimePicker;
