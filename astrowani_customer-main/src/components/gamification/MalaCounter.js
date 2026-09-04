// A 108-bead jaap counter for a mantra an astrologer has prescribed.
//
// This is the one piece of the gamification layer that stays genuinely useful with every
// reward switched off — which is the strongest argument for building it. A customer told to
// chant something 108 times a day currently counts on their fingers or in another app.
//
// THE FULL MALA IS DRAWN, all 108 beads plus the sumeru. A progress bar would have been
// easier and would have been wrong: the point of a mala is that you can see how far round
// you are, and a bead you have passed looks different from one you have not.
//
// Tapping anywhere on the ring advances one bead. Completing a round does NOT reset to a
// blank ring — it fills the sumeru and increments the round count, because in practice
// people chant several rounds and a ring that empties itself loses their place.

import React, {useEffect, useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Easing, Pressable} from 'react-native';
import Svg, {Circle, G} from 'react-native-svg';
import {GAME} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const BEADS = 108;

/**
 * @param {number} count     beads counted in the CURRENT round, 0..108
 * @param {number} rounds    completed rounds today
 * @param {string} mantra    what they are chanting, from the astrologer's remedy
 * @param {function} onAdvance
 * @param {function} onReset
 */
export default function MalaCounter({
  count = 0,
  rounds = 0,
  mantra = 'Om Namah Shivaya',
  size = 260,
  onAdvance,
  onReset,
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(count);

  useEffect(() => {
    if (count === prev.current) return;
    prev.current = count;
    pulse.setValue(0.94);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [count, pulse]);

  const ringR = size / 2 - moderateScale(14);
  // Arc length available to each bead, then a radius that leaves a visible gap between
  // neighbours. Without the gap 108 circles merge into a solid ring and stop reading as beads.
  const beadPitch = (2 * Math.PI * ringR) / BEADS;
  const beadR = Math.max(2.2, beadPitch * 0.4);

  // Bead centres. Index 0 sits just clockwise of the sumeru at the top, so counting runs
  // the conventional way — away from the guru bead, never through it.
  const beads = useMemo(() => {
    const out = [];
    const gap = 6; // degrees reserved at the top for the sumeru
    const span = 360 - gap;
    for (let i = 0; i < BEADS; i++) {
      const deg = -90 + gap / 2 + (span * (i + 0.5)) / BEADS;
      const rad = (deg * Math.PI) / 180;
      out.push({
        x: size / 2 + ringR * Math.cos(rad),
        y: size / 2 + ringR * Math.sin(rad),
      });
    }
    return out;
  }, [ringR, size]);

  const complete = count >= BEADS;

  return (
    <View style={{alignItems: 'center'}}>
      <Text style={styles.kicker}>Your mala</Text>
      <Text style={styles.mantra} numberOfLines={2}>
        {mantra}
      </Text>

      <Pressable
        onPress={complete ? undefined : onAdvance}
        android_ripple={{color: GAME.tint, borderless: true, radius: size / 2}}
        style={{marginTop: verticalScale(10)}}>
        <Animated.View style={{transform: [{scale: pulse}]}}>
          <Svg width={size} height={size}>
            <G>
              {beads.map((b, i) => {
                const done = i < count;
                return (
                  <Circle
                    key={i}
                    cx={b.x}
                    cy={b.y}
                    r={done ? beadR * 1.12 : beadR}
                    fill={done ? GAME.brand : GAME.dim}
                  />
                );
              })}
              {/* Sumeru — the guru bead. Fills gold only when a full round is done. */}
              <Circle
                cx={size / 2}
                cy={size / 2 - ringR}
                r={beadR * 2.1}
                fill={complete ? GAME.goldLit : GAME.dimSoft}
                stroke={complete ? GAME.gold : GAME.dim}
                strokeWidth={1.5}
              />
            </G>
          </Svg>

          <View style={[styles.center, {width: size, height: size}]}>
            <Text style={styles.count}>{count}</Text>
            <Text style={styles.of}>of {BEADS}</Text>
            {rounds > 0 && (
              <Text style={styles.rounds}>
                {rounds} {rounds === 1 ? 'round' : 'rounds'} today
              </Text>
            )}
          </View>
        </Animated.View>
      </Pressable>

      {complete ? (
        <View style={styles.doneBox}>
          <Text style={styles.doneText}>Round complete</Text>
          <Pressable style={styles.btn} onPress={onReset} android_ripple={{color: GAME.tint}}>
            <Text style={styles.btnText}>Begin another round</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>Tap the mala for each repetition</Text>
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
  mantra: {
    fontSize: moderateScale(15),
    color: GAME.text,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: verticalScale(3),
    paddingHorizontal: moderateScale(20),
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: moderateScale(42),
    fontWeight: '700',
    color: GAME.brand,
    lineHeight: moderateScale(46),
  },
  of: {fontSize: moderateScale(12), color: GAME.textMuted, marginTop: -verticalScale(2)},
  rounds: {
    fontSize: moderateScale(11),
    color: GAME.leaf,
    fontWeight: '600',
    marginTop: verticalScale(6),
  },
  hint: {
    marginTop: verticalScale(10),
    fontSize: moderateScale(11),
    color: GAME.textMuted,
  },
  doneBox: {marginTop: verticalScale(10), alignItems: 'center', gap: verticalScale(8)},
  doneText: {fontSize: moderateScale(13), fontWeight: '700', color: GAME.leaf},
  btn: {
    backgroundColor: GAME.brand,
    borderRadius: 8,
    paddingVertical: verticalScale(9),
    paddingHorizontal: moderateScale(22),
  },
  btnText: {color: '#FBF1E6', fontSize: moderateScale(12.5), fontWeight: '700'},
});
