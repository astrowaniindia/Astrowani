// The daily-return streak, drawn as a week of diyas.
//
// Mechanically this is a fire streak. The reason it is a lamp is that lighting one is an
// act a large share of our customers already perform every morning, so it reads as ritual
// rather than as a mascot nagging them about a language lesson.
//
// TWO RULES THIS COMPONENT ASSUMES THE SERVER ENFORCES:
//   1. The day boundary is IST, decided on the backend. A device clock decides nothing —
//      changing the phone's date must not mint a streak day.
//   2. A missed day does not zero a long streak. One grace day a week, and a paid buy-back.
//      That is server logic; this component only renders `days` as given, including a
//      `grace` state so a forgiven day is visibly different from a lit one.
//
// The flame is a looping native-driver animation on a plain View — no SVG, no image. Seven
// of them run at once on the Home screen, so it has to cost nothing.

import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Easing, Pressable} from 'react-native';
import {GAME, GAME_MS} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const LAMP_W = moderateScale(24);
const LAMP_H = moderateScale(30);

function Flame({state, index}) {
  // `flick` drives the idle flicker; `ignite` is the one-shot pop when today is lit.
  const flick = useRef(new Animated.Value(0)).current;
  const ignite = useRef(new Animated.Value(state === 'today' ? 0 : 1)).current;

  useEffect(() => {
    if (state !== 'lit' && state !== 'today') return undefined;

    // Each lamp is offset so the row doesn't pulse in unison, which looks mechanical.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flick, {
          toValue: 1,
          duration: 700 + index * 55,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(flick, {
          toValue: 0,
          duration: 700 + index * 55,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flick, state, index]);

  useEffect(() => {
    if (state !== 'today') return;
    ignite.setValue(0);
    Animated.spring(ignite, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [ignite, state]);

  if (state === 'off' || state === 'grace') return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flame,
        {
          transform: [
            {scale: ignite},
            {scaleY: flick.interpolate({inputRange: [0, 1], outputRange: [1, 1.16]})},
            {rotate: flick.interpolate({inputRange: [0, 1], outputRange: ['-2deg', '2.5deg']})},
          ],
        },
      ]}>
      <View style={styles.flameCore} />
    </Animated.View>
  );
}

function Lamp({state, label, index, onPress}) {
  const dim = state === 'off';
  const grace = state === 'grace';

  const body = (
    <View style={styles.lampCol}>
      <View style={styles.lamp}>
        {(state === 'lit' || state === 'today') && <View style={styles.halo} />}
        <Flame state={state} index={index} />
        <View
          style={[
            styles.bowl,
            dim && {opacity: 0.3},
            grace && {backgroundColor: GAME.dim},
          ]}
        />
        {grace && <Text style={styles.graceMark}>~</Text>}
      </View>
      <Text style={[styles.dayLabel, (dim || grace) && {color: GAME.textMuted}]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{color: GAME.tint, borderless: true}}
      hitSlop={6}>
      {body}
    </Pressable>
  );
}

/**
 * @param {Array<'lit'|'today'|'off'|'grace'>} days  exactly 7 entries, Monday first
 * @param {string[]} labels        7 single-letter day labels (localised by the caller)
 * @param {number} streakCount     the headline number — days in a row, not days this week
 * @param {function} onLightToday  called when the customer taps an unlit today; omit to
 *                                 render read-only (e.g. inside a summary card)
 */
export default function DeepakStreak({
  days = [],
  labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  streakCount = 0,
  onLightToday,
}) {
  const safeDays = days.length === 7 ? days : new Array(7).fill('off');
  const todayIndex = safeDays.indexOf('today');
  const todayUnlit = safeDays.findIndex(d => d === 'pending');

  return (
    <View>
      <Text style={styles.kicker}>Your deepak</Text>
      <View style={styles.headRow}>
        <Text style={styles.count}>{streakCount}</Text>
        <Text style={styles.countLabel}>
          {streakCount === 1 ? 'day lit' : 'days lit in a row'}
        </Text>
      </View>

      <View style={styles.row}>
        {safeDays.map((state, i) => (
          <Lamp
            key={i}
            index={i}
            label={labels[i]}
            state={state === 'pending' ? 'off' : state}
            onPress={
              state === 'pending' && onLightToday ? onLightToday : undefined
            }
          />
        ))}
      </View>

      {todayUnlit >= 0 && onLightToday && (
        <Pressable style={styles.cta} onPress={onLightToday} android_ripple={{color: GAME.tint}}>
          <Text style={styles.ctaText}>Light today's lamp</Text>
        </Pressable>
      )}
      {todayIndex >= 0 && (
        <Text style={styles.done}>Today's lamp is lit. Come back tomorrow.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: moderateScale(10),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: GAME.textMuted,
  },
  headRow: {flexDirection: 'row', alignItems: 'baseline', gap: moderateScale(6)},
  count: {
    fontSize: moderateScale(30),
    fontWeight: '700',
    color: GAME.brand,
    lineHeight: moderateScale(34),
  },
  countLabel: {fontSize: moderateScale(12), color: GAME.textSoft},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: verticalScale(10),
  },
  lampCol: {alignItems: 'center', gap: verticalScale(5)},
  lamp: {width: LAMP_W, height: LAMP_H, alignItems: 'center', justifyContent: 'flex-end'},
  bowl: {
    width: LAMP_W * 0.9,
    height: LAMP_H * 0.36,
    backgroundColor: GAME.brandLight,
    borderBottomLeftRadius: LAMP_W,
    borderBottomRightRadius: LAMP_W,
  },
  flame: {
    position: 'absolute',
    bottom: LAMP_H * 0.36,
    width: LAMP_W * 0.38,
    height: LAMP_H * 0.5,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  flameCore: {
    width: '100%',
    height: '100%',
    backgroundColor: GAME.ember,
    borderTopLeftRadius: LAMP_W,
    borderTopRightRadius: LAMP_W,
    borderBottomLeftRadius: LAMP_W * 0.4,
    borderBottomRightRadius: LAMP_W * 0.4,
    // A lighter core sits inside the ember to read as fire rather than a red blob.
    borderWidth: moderateScale(2),
    borderColor: GAME.goldLit,
  },
  halo: {
    position: 'absolute',
    bottom: LAMP_H * 0.2,
    width: LAMP_W * 1.5,
    height: LAMP_W * 1.5,
    borderRadius: LAMP_W,
    backgroundColor: GAME.goldLit,
    opacity: 0.16,
  },
  graceMark: {
    position: 'absolute',
    top: LAMP_H * 0.18,
    fontSize: moderateScale(13),
    color: GAME.textMuted,
  },
  dayLabel: {fontSize: moderateScale(9), color: GAME.textSoft},
  cta: {
    marginTop: verticalScale(12),
    backgroundColor: GAME.brand,
    borderRadius: 8,
    paddingVertical: verticalScale(9),
    alignItems: 'center',
  },
  ctaText: {color: '#FBF1E6', fontSize: moderateScale(12.5), fontWeight: '700'},
  done: {
    marginTop: verticalScale(10),
    textAlign: 'center',
    fontSize: moderateScale(11),
    color: GAME.textMuted,
  },
});
