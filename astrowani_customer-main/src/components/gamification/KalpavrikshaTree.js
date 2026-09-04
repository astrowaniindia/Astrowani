// The referral counter, drawn as a kalpavriksha (wish-fulfilling tree).
//
// One leaf per friend who actually joined; a fruit at each milestone. The economics are
// unchanged — this is a different rendering of `totalReferred`, which ReferAndEarnScreen
// already fetches from /api/customer/referral-info. No new endpoint, no new table.
//
// WHY IT COUNTS ONLY `rewarded` REFERRALS: a leaf that appears when somebody installs and
// then vanishes when they never complete a session is worse than a leaf that arrives late.
// The caller passes the same number it already shows as "friends referred".
//
// THE BRANCHES AND THE LEAF POSITIONS COME FROM ONE GENERATOR. The first version of this
// file drew six hand-authored branch paths and kept a separate hand-authored list of leaf
// coordinates; past about six friends the two lists stopped agreeing and leaves floated in
// empty space with no twig under them. Now a small deterministic recursion produces the
// branches AND returns its own tip positions, so a leaf physically cannot detach from the
// tree — add a level and both grow together.
//
// WHY THE LEAVES ARE VIEWS AND NOT SVG: animating react-native-svg element props can't use
// the native driver, so a dozen leaves growing at once drops frames on a mid-range Android.
// The trunk is SVG (it never moves); every leaf and fruit is an absolutely-positioned
// Animated.View over it, so growth runs entirely on the UI thread.

import React, {useEffect, useMemo, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Easing} from 'react-native';
import Svg, {Line} from 'react-native-svg';
import {GAME, GAME_MS} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

// Everything is authored in this coordinate space and scaled to the measured width, so the
// tree keeps its proportions on a 5" phone and a tablet alike.
const VB_W = 240;
const VB_H = 190;

const DEPTH = 5; // 2^5 = 32 tips — comfortably more than MAX_LEAVES
const MAX_LEAVES = 25;

// Tuned, not guessed. These three were picked by sweeping the parameter space against two
// constraints: the whole tree must stay inside the viewBox at every count, and the 25 tips
// actually used must stay far enough apart that leaves read as foliage rather than merging
// into one green mass. This combination keeps the canopy roughly 210x161 — an upright tree
// silhouette rather than the wide flat fan that maximising separation alone produces.
const TRUNK_LEN = 40;
const BRANCH_RATIO = 0.86;
const BRANCH_ANGLE = 28;

// A fruit instead of a leaf at these counts. The whole point of the tree over a plain
// number: a flat per-head bounty gives nobody a reason to push past their second referral.
const MILESTONES = [5, 10, 25];

/**
 * Deterministic binary tree. Returns the branch segments to draw and, separately, the tip
 * of every terminal twig — which is the ONLY place a leaf is ever placed.
 */
function buildTree() {
  const branches = [];
  const tips = [];

  // Each tip records the branch indices leading back to the trunk, so the component can
  // draw only the wood that actually supports the leaves grown so far. Drawing the whole
  // skeleton at every count made one referral look like a bare winter tree with a single
  // leaf on it — dying rather than growing, which is the opposite of the point.
  const grow = (x, y, angleDeg, len, width, depth, path) => {
    const rad = (angleDeg * Math.PI) / 180;
    const x2 = x + len * Math.cos(rad);
    const y2 = y - len * Math.sin(rad); // SVG y grows downward
    const idx = branches.push({x1: x, y1: y, x2, y2, width}) - 1;
    const here = [...path, idx];

    if (depth === 0) {
      tips.push({x: x2, y: y2, angle: angleDeg, path: here});
      return;
    }
    grow(x2, y2, angleDeg - BRANCH_ANGLE, len * BRANCH_RATIO, width * 0.66, depth - 1, here);
    grow(x2, y2, angleDeg + BRANCH_ANGLE, len * BRANCH_RATIO, width * 0.66, depth - 1, here);
  };

  grow(120, 188, 90, TRUNK_LEN, 7.5, DEPTH, []);
  return {branches, tips};
}

const {branches: BRANCHES, tips: TIPS} = buildTree();

// Growth order. The generator emits tips depth-first, so tips 0..15 are the whole left half
// of the canopy — filling them in order would grow a lopsided tree that only becomes
// symmetrical at the very last referral. Reversing the bits of the index alternates sides
// at every step, so three leaves already read as a tree and so does twenty-three.
const GROWTH_ORDER = (() => {
  const n = TIPS.length;
  const bits = Math.round(Math.log2(n));
  return Array.from({length: n}, (_, i) => {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    return r;
  });
})();

function Leaf({x, y, angle, index, isFruit, delay, size}) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: GAME_MS.reveal,
      delay,
      easing: Easing.bezier(0.2, 1.5, 0.4, 1), // overshoots slightly — it "pops" open
      useNativeDriver: true,
    }).start();
  }, [grow, delay]);

  const w = size * (isFruit ? 10 : 12);
  const h = size * (isFruit ? 10 : 7);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.leaf,
        {
          left: x * size - w / 2,
          top: y * size - h / 2,
          width: w,
          height: h,
          borderRadius: Math.max(w, h),
          backgroundColor: isFruit ? GAME.goldLit : GAME.leaf,
          transform: [
            {scale: grow},
            // Lie along the twig that carries it, so a leaf reads as attached rather than
            // dropped on top. SVG angle is measured up-from-right; screen rotation is the
            // negative of it.
            {rotate: isFruit ? '0deg' : `${-(angle - 90)}deg`},
          ],
        },
      ]}
    />
  );
}

/**
 * @param {number} count      friends who actually joined (rewarded referrals)
 * @param {number} width      rendered width in px; height follows the aspect ratio
 * @param {boolean} animate   false renders the finished tree with no growth animation
 */
export default function KalpavrikshaTree({count = 0, width = 240, animate = true}) {
  const size = width / VB_W;
  const height = VB_H * size;

  const leaves = useMemo(() => {
    const n = Math.min(count, MAX_LEAVES);
    const out = [];
    for (let i = 0; i < n; i++) {
      const tip = TIPS[GROWTH_ORDER[i]];
      if (!tip) continue;
      out.push({
        x: tip.x,
        y: tip.y,
        angle: tip.angle,
        index: i,
        isFruit: MILESTONES.includes(i + 1),
      });
    }
    return out;
  }, [count]);

  // Only the wood under a leaf that exists. At count 0 that is the trunk alone — a sapling,
  // which is the honest picture of nobody having joined yet.
  const visibleBranches = useMemo(() => {
    const keep = new Set([0]); // branch 0 is the trunk; always present
    leaves.forEach(l => {
      const tip = TIPS[GROWTH_ORDER[l.index]];
      if (tip) tip.path.forEach(b => keep.add(b));
    });
    return BRANCHES.map((b, i) => (keep.has(i) ? b : null));
  }, [leaves]);

  const nextMilestone = MILESTONES.find(m => m > count);

  return (
    <View style={{alignItems: 'center'}}>
      <View style={{width, height}}>
        <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
          {visibleBranches.map((b, i) =>
            b ? (
              <Line
                key={i}
                x1={b.x1}
                y1={b.y1}
                x2={b.x2}
                y2={b.y2}
                stroke={GAME.brandLight}
                strokeWidth={b.width}
                strokeLinecap="round"
              />
            ) : null,
          )}
        </Svg>

        {leaves.map(l => (
          <Leaf
            key={`${l.index}-${count}`}
            x={l.x}
            y={l.y}
            angle={l.angle}
            index={l.index}
            isFruit={l.isFruit}
            size={size}
            delay={animate ? l.index * GAME_MS.stagger : 0}
          />
        ))}
      </View>

      {/* In normal flow, not absolutely positioned over the canvas — the old version sat
          on top of the lower branches and collided with the caption underneath it. */}
      {count === 0 ? (
        <Text style={styles.caption}>
          Your tree is bare. Invite a friend to grow the first leaf.
        </Text>
      ) : nextMilestone ? (
        <Text style={styles.caption}>
          {nextMilestone - count} more{' '}
          {nextMilestone - count === 1 ? 'friend' : 'friends'} to the next fruit
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leaf: {
    position: 'absolute',
  },
  caption: {
    marginTop: verticalScale(6),
    textAlign: 'center',
    fontSize: moderateScale(11),
    color: GAME.textMuted,
    paddingHorizontal: moderateScale(24),
  },
});
