// KundliDiamond.js — the North Indian birth chart, drawn from the house data we
// already hold.
//
// WHY IT IS DRAWN RATHER THAN FETCHED. JyotishamAstroAPI will render a chart as
// an SVG, and src/components/astro/ZoomableChart.js displays exactly that — but
// it is a SEPARATE paid endpoint (/api/chart_image/d1). The Lal Kitab screen has
// already paid for the chart it is showing: the house grid comes back inside the
// findings response at no extra cost. Drawing it here keeps that at one request
// instead of two and keeps the credit pool (which has run dry once before) out of
// the picture entirely.
//
// The layout is the standard North Indian square: an outer box, both diagonals,
// and an inner diamond through the midpoints. House 1 is the top-centre diamond
// and the rest run anticlockwise, which is the convention every Indian reader
// expects — getting it the other way round silently mislabels every house.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../../Theme/Colors';
import { moderateScale } from '../../utils/Scaling';

// Centres for houses 1..12 in a 100x100 box, anticlockwise from the top-centre.
const SLOTS = [
  { x: 50, y: 26 },   // 1  top centre
  { x: 26, y: 13 },   // 2  top left
  { x: 13, y: 26 },   // 3  left top
  { x: 26, y: 50 },   // 4  left centre
  { x: 13, y: 74 },   // 5  left bottom
  { x: 26, y: 87 },   // 6  bottom left
  { x: 50, y: 74 },   // 7  bottom centre
  { x: 74, y: 87 },   // 8  bottom right
  { x: 87, y: 74 },   // 9  right bottom
  { x: 74, y: 50 },   // 10 right centre
  { x: 87, y: 26 },   // 11 right top
  { x: 74, y: 13 },   // 12 top right
];

// Two letters is all that fits in a house on a phone.
const SHORT = {
  sun: 'Su', moon: 'Mo', mars: 'Ma', mercury: 'Me', jupiter: 'Ju',
  venus: 'Ve', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke', uranus: 'Ur',
  neptune: 'Ne', pluto: 'Pl',
};
const short = (p) => SHORT[String(p || '').trim().toLowerCase()] || String(p || '').slice(0, 2);

export default function KundliDiamond({ houses = [], size = 260, highlightHouse = null }) {
  // houses: [{ house, sign, planets: [] }] — exactly what the findings response
  // returns as `houses`.
  const byHouse = new Map();
  for (const h of houses) {
    if (!h || !h.house) continue;
    byHouse.set(Number(h.house), h);
  }

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x="1" y="1" width="98" height="98" fill="#FFFDF8" stroke={COLORS.AstroMaroon} strokeWidth="1" />
        {/* diagonals */}
        <Line x1="1" y1="1" x2="99" y2="99" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />
        <Line x1="99" y1="1" x2="1" y2="99" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />
        {/* inner diamond through the midpoints */}
        <Line x1="50" y1="1" x2="99" y2="50" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />
        <Line x1="99" y1="50" x2="50" y2="99" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />
        <Line x1="50" y1="99" x2="1" y2="50" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />
        <Line x1="1" y1="50" x2="50" y2="1" stroke={COLORS.AstroMaroon} strokeWidth="0.7" />

        {SLOTS.map((slot, i) => {
          const n = i + 1;
          const cell = byHouse.get(n);
          const planets = (cell && cell.planets) || [];
          const hot = highlightHouse === n;
          return (
            <React.Fragment key={n}>
              {/* house number, small and out of the way */}
              <SvgText
                x={slot.x}
                y={slot.y - 5}
                fontSize="4.6"
                fill={hot ? '#C0392B' : '#B9A99B'}
                fontWeight={hot ? 'bold' : 'normal'}
                textAnchor="middle">
                {n}
              </SvgText>
              {/* planets, stacked so three in a house still fit */}
              {planets.slice(0, 3).map((p, k) => (
                <SvgText
                  key={k}
                  x={slot.x}
                  y={slot.y + 2 + k * 5.4}
                  fontSize="5.2"
                  fontWeight="bold"
                  fill={hot ? '#C0392B' : COLORS.AstroMaroon}
                  textAnchor="middle">
                  {short(p)}
                </SvgText>
              ))}
              {planets.length > 3 && (
                <SvgText x={slot.x} y={slot.y + 2 + 3 * 5.4} fontSize="4.2" fill="#8A7A6D" textAnchor="middle">
                  {`+${planets.length - 3}`}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', borderRadius: moderateScale(10), overflow: 'hidden' },
});
