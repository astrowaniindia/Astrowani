// The post-session scratch card.
//
// WHY IT EXISTS: the end of a paid session is the weakest emotional moment in the product.
// The timer stops, the money is gone, and the app immediately asks for a rating. A small
// guaranteed reward changes the shape of that moment, and the review prompt lands better
// for following a gift rather than a bill.
//
// EVERY CARD WINS SOMETHING. The variability is in the size, never in whether. "Better luck
// next time" after somebody spent ₹540 is insulting, and the parent must never pass a
// reward that reads as nothing.
//
// NEVER SHOW THIS AFTER A MISSED OR CANCELLED SESSION — a reward for a call that did not
// happen reads as mockery. That gate belongs to the caller, which already knows whether the
// session connected (the same `connected` flag ReviewPrompt is gated on).
//
// IMPLEMENTATION NOTE: React Native has no canvas, so the foil is a grid of small tiles
// that disappear as the finger crosses them, not a real erase mask. At this tile size the
// difference is not visible, and it avoids pulling in a native drawing dependency for one
// component.

import React, {useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Pressable,
} from 'react-native';
import {GAME, GAME_MS} from './gamificationTheme';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const COLS = 10;
const ROWS = 7;
const TOTAL = COLS * ROWS;
// Below this the reward is still half-covered and the reveal feels unearned; much above it
// and people give up scratching. Two thirds tested as the point where it reads as "opened".
const REVEAL_AT = 0.55;

export default function PrasadCard({
  amountLabel = '',
  caption = '',
  kicker = 'Your prasad',
  height = verticalScale(132),
  onRevealed,
}) {
  const [cleared, setCleared] = useState(() => new Set());
  const [revealed, setRevealed] = useState(false);
  const boxRef = useRef({w: 0, h: 0});
  const clearedRef = useRef(new Set());
  const fade = useRef(new Animated.Value(1)).current;

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    Animated.timing(fade, {
      toValue: 0,
      duration: GAME_MS.reveal,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    onRevealed && onRevealed();
  };

  const mark = (x, y) => {
    const {w, h} = boxRef.current;
    if (!w || !h) return;
    const c = Math.floor((x / w) * COLS);
    const r = Math.floor((y / h) * ROWS);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;

    // A finger is wider than one tile. Clearing the neighbours too makes the stroke read as
    // a fingertip rather than a one-pixel pen.
    let added = false;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
        const key = rr * COLS + cc;
        if (!clearedRef.current.has(key)) {
          clearedRef.current.add(key);
          added = true;
        }
      }
    }
    if (!added) return;

    setCleared(new Set(clearedRef.current));
    if (clearedRef.current.size / TOTAL >= REVEAL_AT) reveal();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => mark(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: e => mark(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    // mark() reads only refs and setState, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View
      style={[styles.wrap, {height}]}
      onLayout={e => {
        boxRef.current = {
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        };
      }}>
      <View style={styles.under}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.amount}>{amountLabel}</Text>
        {!!caption && <Text style={styles.caption}>{caption}</Text>}
      </View>

      <Animated.View
        style={[styles.foilLayer, {opacity: fade}]}
        pointerEvents={revealed ? 'none' : 'auto'}
        {...pan.panHandlers}>
          {/* Explicit rows of flex:1 tiles. Percentage widths inside a wrapping row rounded
            up just enough that the last column wrapped, leaving a visible uncovered strip
            down the right-hand edge of the card. */}
        {Array.from({length: ROWS}).map((_, r) => (
            <View key={r} style={styles.foilRow}>
              {Array.from({length: COLS}).map((__, c) => (
                <View
                  key={c}
                  style={[
                    styles.tile,
                    {opacity: cleared.has(r * COLS + c) ? 0 : 1},
                  ]}
                />
              ))}
            </View>
          ))}
          {clearedRef.current.size === 0 && (
            <View style={styles.foilLabelWrap} pointerEvents="none">
              <Text style={styles.foilLabel}>SCRATCH HERE</Text>
            </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GAME.gold,
  },
  under: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GAME.goldFaint,
    gap: verticalScale(2),
  },
  kicker: {
    fontSize: moderateScale(10),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: GAME.textMuted,
  },
  amount: {
    fontSize: moderateScale(26),
    fontWeight: '700',
    color: GAME.brand,
    textAlign: 'center',
    paddingHorizontal: moderateScale(14),
  },
  caption: {
    fontSize: moderateScale(11),
    color: GAME.textSoft,
    textAlign: 'center',
    paddingHorizontal: moderateScale(18),
  },
  foilLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  foilRow: {flex: 1, flexDirection: 'row'},
  // No border. A 1px outline on every tile drew a graph-paper grid over the card, which
  // reads as a table rather than as foil — and its width is what pushed the last column
  // out of the row in the first place.
  tile: {flex: 1, backgroundColor: GAME.brandLight},
  foilLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foilLabel: {
    color: '#F6E3CF',
    fontSize: moderateScale(12),
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
