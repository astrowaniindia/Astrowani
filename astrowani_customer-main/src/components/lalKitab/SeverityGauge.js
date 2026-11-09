// SeverityGauge.js — the little speedometer on a Lal Kitab finding.
//
// A half-circle arc running green -> amber -> red with a needle, which is how
// astrology apps in this market show "how bad is this one" and reads instantly
// without the person having to parse a word like "medium".
//
// Drawn with react-native-svg, which the app already ships (AstroUI.js,
// ChartCompleteness.js and the chart viewer all use it), so this adds no
// dependency and goes out over the air.
//
// The needle angle comes from a SEVERITY BAND, not from a made-up score. The
// backend classifies a finding as high/medium/low from the chart itself; turning
// that into a precise-looking number would be inventing a precision Lal Kitab
// does not give us.

import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { moderateScale } from '../../utils/Scaling';

// Where the needle sits for each band, in degrees across a 180° sweep
// (0° = far left / mild, 180° = far right / severe).
const ANGLE = { low: 34, medium: 90, high: 148 };

/** Point on the arc, in the 100x56 user space the paths below are drawn in. */
function polar(cx, cy, r, deg) {
  const rad = (Math.PI * (180 - deg)) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arc(cx, cy, r, from, to) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  // Sweep flag 1: the arc is drawn clockwise in SVG's y-down space, which is
  // left-to-right on screen.
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export default function SeverityGauge({ severity = 'medium', size = 74 }) {
  const w = size;
  const h = size * 0.62;
  const CX = 50;
  const CY = 48;
  const R = 38;
  const deg = ANGLE[severity] ?? ANGLE.medium;
  const tip = polar(CX, CY, R - 9, deg);

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 100 56">
        <Defs>
          <LinearGradient id="sev" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#3C8C52" />
            <Stop offset="0.5" stopColor="#E0A93A" />
            <Stop offset="1" stopColor="#C0392B" />
          </LinearGradient>
        </Defs>

        {/* The band itself. One stroked arc with a gradient reads as a single
            meter; three separate coloured arcs read as a pie chart. */}
        <Path
          d={arc(CX, CY, R, 0, 180)}
          stroke="url(#sev)"
          strokeWidth={11}
          strokeLinecap="round"
          fill="none"
        />

        {/* Needle. */}
        <G>
          <Path
            d={`M ${CX} ${CY} L ${tip.x} ${tip.y}`}
            stroke="#3A2318"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <Circle cx={CX} cy={CY} r={4.6} fill="#3A2318" />
          <Circle cx={CX} cy={CY} r={1.9} fill="#fff" />
        </G>
      </Svg>
    </View>
  );
}

export const severityAngle = ANGLE;
export const gaugeHeight = (size) => moderateScale(size * 0.62);
