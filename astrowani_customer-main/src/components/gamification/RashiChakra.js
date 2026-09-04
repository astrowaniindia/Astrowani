// The daily wheel — twelve segments, one free spin a day.
//
// THE HARD RULE: this component does not decide anything. The parent asks the server for a
// spin, the server picks the segment, and `resultIndex` arrives as a prop. The wheel then
// animates to a result it was TOLD. Rolling on the device would make the outcome a client
// decision, which for anything with real value is the same as letting the customer choose.
//
// THE OTHER HARD RULE, which lives in product rather than code: there is no paid spin. No
// "buy 3 more for ₹49". The audience is people making decisions under stress and a paid
// spin turns that into a gambling loop. If a future ticket asks for one, escalate it — do
// not quietly add a `price` prop.
//
// Prizes are discount coupons (decided 2026-09-04): a percentage off reports, remedies or a
// consultation. That costs margin instead of cash and pushes toward the shop, and it means
// no wallet or currency has to exist before this can ship.

import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated, Easing, Pressable, ActivityIndicator} from 'react-native';
import Svg, {Path, Circle, Text as SvgText, G} from 'react-native-svg';
import {GAME, GAME_MS} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const N = 12;
const SEG = 360 / N;
const R = 95;

// Wedge path for segment i in a 200x200 viewBox.
function wedge(i) {
  const a0 = ((i * SEG - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * SEG - 90) * Math.PI) / 180;
  const x0 = (100 + R * Math.cos(a0)).toFixed(2);
  const y0 = (100 + R * Math.sin(a0)).toFixed(2);
  const x1 = (100 + R * Math.cos(a1)).toFixed(2);
  const y1 = (100 + R * Math.sin(a1)).toFixed(2);
  return `M100 100 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z`;
}

// Labels run RADIALLY — out along the wedge's centre line, not around the rim.
//
// Tangential labels (the obvious first attempt) get only the wedge's arc to live in: at
// r=58 with twelve wedges that is ~30px, and "25% OFF" needs ~35px, so the bottom of the
// wheel collided into one unreadable smear. Radially there is the whole 15→95 radius to
// use.
//
// The second half of this is the flip. Text laid along a direction pointing left of
// vertical comes out upside down, so those wedges are rotated a further 180° — the label
// then reads inward instead of outward, but it reads.
function labelPos(i) {
  const phi = i * SEG + SEG / 2 - 90; // screen angle of this wedge's centre line
  const rad = (phi * Math.PI) / 180;
  const norm = ((phi % 360) + 360) % 360;
  return {
    x: (100 + 58 * Math.cos(rad)).toFixed(2),
    y: (100 + 58 * Math.sin(rad)).toFixed(2),
    rot: norm > 90 && norm < 270 ? phi + 180 : phi,
  };
}

/**
 * @param {Array<{short:string, rare?:boolean}>} segments  exactly 12, from the server
 * @param {number|null} resultIndex   set by the parent once the server answers; the wheel
 *                                    animates to it and then calls onSettled
 * @param {string} resultText         the human sentence to show once it lands
 * @param {boolean} busy              a spin request is in flight
 * @param {boolean} available         false when today's spin is already used
 * @param {function} onSpin
 * @param {function} onSettled
 */
export default function RashiChakra({
  segments = [],
  resultIndex = null,
  resultText = '',
  busy = false,
  available = true,
  onSpin,
  onSettled,
  size = 196,
}) {
  const rot = useRef(new Animated.Value(0)).current;
  const turns = useRef(0); // cumulative degrees, so each spin continues forward
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (resultIndex === null || resultIndex === undefined) return;

    setSettled(false);
    // Four full turns plus whatever brings the winning wedge under the pointer at 12 o'clock.
    const target =
      turns.current + 360 * 4 + (360 - (resultIndex * SEG + SEG / 2));
    turns.current = target;

    Animated.timing(rot, {
      toValue: target,
      duration: GAME_MS.spin,
      easing: Easing.bezier(0.14, 0.72, 0.12, 1), // long tail — it coasts to a stop
      useNativeDriver: true,
    }).start(({finished}) => {
      if (!finished) return;
      setSettled(true);
      onSettled && onSettled();
    });
  }, [resultIndex, rot, onSettled]);

  const spin = rot.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const segs = segments.length === N ? segments : new Array(N).fill({short: '—'});

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>
        {available ? 'One free spin every day' : "Today's spin is used"}
      </Text>

      <View style={[styles.wheelBox, {width: size, height: size}]}>
        <View style={styles.needle} />
        <Animated.View style={{transform: [{rotate: spin}]}}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <G>
              {segs.map((s, i) => (
                <Path
                  key={`w${i}`}
                  d={wedge(i)}
                  fill={s.rare ? GAME.gold : i % 2 ? GAME.brand : GAME.brandLight}
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth="0.6"
                />
              ))}
              {segs.map((s, i) => {
                const p = labelPos(i);
                return (
                  <SvgText
                    key={`t${i}`}
                    x={p.x}
                    y={p.y}
                    fill={s.rare ? '#3A1E10' : '#F6E3CF'}
                    fontSize="8.5"
                    fontWeight="600"
                    textAnchor="middle"
                    transform={`rotate(${p.rot} ${p.x} ${p.y})`}>
                    {s.short}
                  </SvgText>
                );
              })}
              <Circle
                cx="100"
                cy="100"
                r="15"
                fill={GAME.card}
                stroke={GAME.gold}
                strokeWidth="2"
              />
            </G>
          </Svg>
        </Animated.View>
      </View>

      <View style={styles.prizeBox}>
        {busy ? (
          <ActivityIndicator size="small" color={GAME.brand} />
        ) : settled && resultText ? (
          <Text style={styles.prizeWin}>{resultText}</Text>
        ) : resultIndex !== null ? (
          <Text style={styles.prize}>The chakra turns…</Text>
        ) : (
          <Text style={styles.prize}>
            {available ? "Spin to see today's blessing" : 'A new spin unlocks at sunrise'}
          </Text>
        )}
      </View>

      <Pressable
        style={[styles.btn, (!available || busy) && styles.btnOff]}
        disabled={!available || busy || (resultIndex !== null && !settled)}
        onPress={onSpin}
        android_ripple={{color: GAME.tint}}>
        <Text style={styles.btnText}>
          {available ? 'Spin the chakra' : 'Come back tomorrow'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {alignItems: 'stretch'},
  kicker: {
    fontSize: moderateScale(10),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: GAME.textMuted,
    textAlign: 'center',
  },
  wheelBox: {alignSelf: 'center', marginTop: verticalScale(8), alignItems: 'center'},
  needle: {
    position: 'absolute',
    top: -moderateScale(3),
    zIndex: 2,
    width: 0,
    height: 0,
    borderLeftWidth: moderateScale(8),
    borderRightWidth: moderateScale(8),
    borderTopWidth: moderateScale(16),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: GAME.brand,
  },
  prizeBox: {
    minHeight: verticalScale(34),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: moderateScale(8),
  },
  prize: {fontSize: moderateScale(12), color: GAME.textSoft, textAlign: 'center'},
  prizeWin: {
    fontSize: moderateScale(13),
    color: GAME.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  btn: {
    backgroundColor: GAME.brand,
    borderRadius: 8,
    paddingVertical: verticalScale(10),
    alignItems: 'center',
  },
  btnOff: {opacity: 0.45},
  btnText: {color: '#FBF1E6', fontSize: moderateScale(12.5), fontWeight: '700'},
});
