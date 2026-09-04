// Profile completion, drawn as the customer's own kundli with unlit houses.
//
// WHY NOT A PROGRESS BAR: "complete your profile" bars get ignored. The same number drawn
// as a birth chart with dark houses is not ignored, because the incompleteness now looks
// like it is costing the customer something — and it genuinely is. A missing birth time is
// the single biggest cause of a vague reading, which is what produces refund requests and
// one-star reviews.
//
// This is a METER, not a field-to-house mapping. Houses lit = round(weight% x 12). Pretending
// that "your 7th house is dark because you didn't give us your email" would be astrological
// nonsense, and the astrologers would rightly object to the app inventing readings.
//
// The weights below say what actually matters to a chart. Birth date, time and place carry
// 60 of the 100 points between them because without those three there is no chart at all.

import React, {useEffect, useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Easing} from 'react-native';
import Svg, {Path, Rect, G} from 'react-native-svg';
import {GAME, GAME_MS} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

// field key -> [weight, human label, alias keys]. Order is the order they are asked for.
//
// The aliases matter: /api/users/profile and UserProfileScreen's own state do not use
// identical names for the same value (name/firstName, city/placeOfBirth), and a field that
// is actually filled but read under the wrong key would tell a customer their chart is
// incomplete when it is not — which is the one thing this component must never do.
export const CHART_FIELDS = [
  ['dateOfBirth', 20, 'Date of birth', ['dob', 'birthDate']],
  ['timeOfBirth', 20, 'Exact birth time', ['tob', 'birthTime']],
  ['city', 20, 'Place of birth', ['placeOfBirth', 'birthPlace']],
  ['firstName', 10, 'Your name', ['name', 'fullName']],
  ['gender', 10, 'Gender', []],
  ['state', 5, 'State', []],
  ['maritalStatus', 5, 'Marital status', ['marital_status']],
  ['email', 5, 'Email', []],
  ['profilePic', 5, 'Photo', ['profileImage', 'profile_pic_url']],
];

const isFilled = v => {
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return !isNaN(v.getTime());
  return String(v).trim().length > 0;
};

/**
 * Pure helper — usable anywhere that needs the number without drawing the chart
 * (e.g. the Home nudge card, or deciding whether to show the nudge at all).
 *
 * @returns {{percent:number, missing:Array<{key,label,weight}>, filledCount:number}}
 */
export function getChartCompleteness(profile) {
  if (!profile) {
    return {
      percent: 0,
      missing: CHART_FIELDS.map(([key, weight, label]) => ({key, label, weight})),
      filledCount: 0,
    };
  }

  let earned = 0;
  const missing = [];
  CHART_FIELDS.forEach(([key, weight, label, aliases = []]) => {
    const present = [key, ...aliases].some(k => isFilled(profile[k]));
    if (present) earned += weight;
    else missing.push({key, label, weight});
  });

  return {
    percent: Math.round(earned),
    missing, // already ordered by importance, since CHART_FIELDS is
    filledCount: CHART_FIELDS.length - missing.length,
  };
}

// North Indian diamond, in a 200x200 box. House 1 is the top centre diamond and the rest
// run anticlockwise, which is the conventional layout — the same geometry the report
// screens already draw in components/astro/.
const HOUSES = [
  'M100 10 L145 55 L100 100 L55 55 Z',
  'M10 10 L100 10 L55 55 Z',
  'M10 10 L55 55 L10 100 Z',
  'M10 100 L55 55 L100 100 L55 145 Z',
  'M10 100 L55 145 L10 190 Z',
  'M10 190 L55 145 L100 190 Z',
  'M100 190 L55 145 L100 100 L145 145 Z',
  'M190 190 L100 190 L145 145 Z',
  'M190 190 L145 145 L190 100 Z',
  'M190 100 L145 145 L100 100 L145 55 Z',
  'M190 100 L145 55 L190 10 Z',
  'M190 10 L145 55 L100 10 Z',
];

// Which houses light up first. NOT 1..12 in order: the house paths above are spatially
// adjacent in sequence, so filling them in order produced one solid wedge of colour across
// half the chart instead of twelve readable houses. This order scatters each new house away
// from the last, so any count still reads as a chart.
const FILL_ORDER = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11];

const AnimatedPath = Animated.createAnimatedComponent(Path);

function House({d, delay, lit}) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!lit) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, {
      // Full strength. Maroon at a low opacity over white turns a washed-out mauve-grey,
      // which reads as "disabled" — the opposite of the lit/dark metaphor. The fill colour
      // below is the warm brand tint instead, so it can sit at full opacity and look lit.
      toValue: 1,
      duration: GAME_MS.reveal,
      delay,
      easing: Easing.out(Easing.ease),
      // SVG props can't run on the native driver. Acceptable here: at most twelve
      // one-shot fades that run once when the card appears, not a loop.
      useNativeDriver: false,
    }).start();
  }, [fade, delay, lit]);

  return <AnimatedPath d={d} fill={GAME.tint} opacity={fade} />;
}

/**
 * @param {object} profile   the same shape UserProfileScreen holds in state
 * @param {number} size      rendered square size in px
 * @param {boolean} animate  false paints the finished state immediately
 */
export default function ChartCompleteness({profile, size = 200, animate = true}) {
  const {percent, missing} = useMemo(() => getChartCompleteness(profile), [profile]);
  const litCount = Math.round((percent / 100) * 12);

  const bar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bar, {
      toValue: percent,
      duration: animate ? 1400 : 0,
      delay: animate ? 200 : 0,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false, // animating width
    }).start();
  }, [bar, percent, animate]);

  const barWidth = bar.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View>
      <View style={styles.headRow}>
        <Text style={styles.label}>Chart completeness</Text>
        <Text style={styles.pct}>{percent}%</Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, {width: barWidth}]} />
      </View>

      <View style={{alignSelf: 'center', marginTop: verticalScale(12)}}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <G>
            {HOUSES.map((d, i) => {
              const rank = FILL_ORDER.indexOf(i); // when this house lights up
              return (
                <House
                  key={i}
                  d={d}
                  lit={rank < litCount}
                  delay={animate ? 300 + rank * GAME_MS.stagger : 0}
                />
              );
            })}
          </G>
          <Rect
            x="10"
            y="10"
            width="180"
            height="180"
            stroke={GAME.borderStrong}
            strokeWidth="1.4"
            fill="none"
          />
          <Path
            d="M10 10 L190 190 M190 10 L10 190"
            stroke={GAME.borderStrong}
            strokeWidth="1.4"
            fill="none"
          />
          <Path
            d="M100 10 L10 100 L100 190 L190 100 Z"
            stroke={GAME.borderStrong}
            strokeWidth="1.4"
            fill="none"
          />
        </Svg>
      </View>

      {missing.length > 0 && (
        <Text style={styles.caption}>
          {12 - litCount} {12 - litCount === 1 ? 'house is' : 'houses are'} still dark
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: moderateScale(11),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: GAME.textMuted,
  },
  pct: {
    fontSize: moderateScale(22),
    fontWeight: '700',
    color: GAME.brand,
  },
  track: {
    height: verticalScale(6),
    borderRadius: 4,
    backgroundColor: GAME.dimSoft,
    overflow: 'hidden',
    marginTop: verticalScale(6),
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: GAME.gold,
  },
  caption: {
    marginTop: verticalScale(8),
    textAlign: 'center',
    fontSize: moderateScale(11),
    color: GAME.textMuted,
  },
});
