// The screen folding itself into the gift bubble and dropping it in the corner.
//
// WHAT IT IS FOR. Leaving the free-call panel without taking the call must not look
// like the prize was thrown away. Everything on screen drops out while a maroon circle
// shrinks from covering the whole display down to the small floating gift in the
// bottom-right — the exact spot PendingGiftBubbleHost then keeps it on, through Login,
// OTP and the name step. The customer does not have to be told the offer is still
// theirs; they watched it get put somewhere.
//
// WHY IT IS ITS OWN FILE. This geometry has to agree with THREE other components
// (FreeCallGiftBubble's size, PendingGiftBubbleHost's label width and resting bottom)
// or the gift visibly jumps at the hand-off — and it used to be written out inside
// screens/FreeCall/CampaignGiftReveal.js, where the second screen that needed it
// (InstantAstrologers, 2026-10-14) would have had to copy all of it. A copy is a
// mismatch waiting for whichever of the four is edited next.
//
// Everything animates transform/opacity only, so the whole thing runs on the native
// driver. `onLanded` fires when the bubble has arrived — that is the moment to call
// showPendingGift() and hand it over.
import React, { useContext, useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

import { COLORS } from '../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BUBBLE = scale(52);              // FreeCallGiftBubble SIZE
const LABEL_W = scale(126);            // PendingGiftBubbleHost GIFT_LABEL_W
// The host centres the circle over its (wider) hint pill, so the circle itself sits
// further in from the screen edge than the pill does. Land on that same spot.
const BUBBLE_RIGHT = scale(14) + (LABEL_W - BUBBLE) / 2;
// WHERE IT LANDS DEPENDS ON WHERE IT IS GOING, and getting this wrong is visible.
// The bubble this one hands over to rests at two different heights: the pre-login
// host's (no tab bar on Login/OTP/name, so it sits low) and Home's own
// FreeCallGiftBubble (higher, clear of the bottom tab bar). Landing on one and being
// replaced by the other makes the gift jump up the screen at the hand-off, which is
// precisely what the whole collapse exists to avoid.
const BUBBLE_BOTTOM = { prelogin: verticalScale(48), home: verticalScale(86) };
// Big enough that the circle covers the screen at the start of the collapse.
const COLLAPSE_SCALE = (Math.max(SCREEN_W, SCREEN_H) * 1.3) / BUBBLE;
// Offset from the bubble's resting centre to the screen's centre, i.e. how far it
// travels on the way down to the corner.
const COLLAPSE_DX = SCREEN_W / 2 - (SCREEN_W - BUBBLE_RIGHT - BUBBLE / 2);
const collapseDy = (bottom) => SCREEN_H / 2 - (SCREEN_H - bottom - BUBBLE / 2);

export const COLLAPSE_MS = 880;

/**
 * `contentOpacity` is the value a caller should apply to everything it is folding
 * away, so the screen's own content fades on the same curve this bubble shrinks on.
 * Exported as a hook rather than built in, because the two screens that collapse wrap
 * different things and neither can be wrapped generically without another layer.
 */
export function useCollapseAnimation(active, onLanded) {
  const collapse = useRef(new Animated.Value(0)).current;
  const landed = useRef(false);

  useEffect(() => {
    if (!active || landed.current) return undefined;
    landed.current = true;
    Animated.timing(collapse, {
      toValue: 1,
      duration: COLLAPSE_MS,
      easing: Easing.bezier(0.45, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => onLanded?.());
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return {
    collapse,
    contentOpacity: collapse.interpolate({
      inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp',
    }),
  };
}

export default function CollapseIntoGiftBubble({ collapse, placement = 'prelogin' }) {
  const { t } = useContext(LanguageContext);

  const bottom = BUBBLE_BOTTOM[placement] || BUBBLE_BOTTOM.prelogin;
  const bubbleScale = collapse.interpolate({ inputRange: [0, 1], outputRange: [COLLAPSE_SCALE, 1] });
  const bubbleX = collapse.interpolate({ inputRange: [0, 1], outputRange: [COLLAPSE_DX, 0] });
  const bubbleY = collapse.interpolate({ inputRange: [0, 1], outputRange: [collapseDy(bottom), 0] });
  // The icon and label appear only once the circle is small enough to read as a
  // bubble rather than as a wall of maroon.
  const iconFade = collapse.interpolate({ inputRange: [0, 0.68, 0.9], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const labelFade = collapse.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View
        style={[
          styles.bubble,
          { bottom },
          { transform: [{ translateX: bubbleX }, { translateY: bubbleY }, { scale: bubbleScale }] },
        ]}
      >
        <Animated.View style={{ opacity: iconFade }}>
          <Icon name="card-giftcard" size={moderateScale(24)} color={COLORS.AstroGold} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.label, { bottom: bottom - verticalScale(39) }, { opacity: labelFade }]}>
        <Text style={styles.labelText} numberOfLines={2}>{t('freeCall.giftHint')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  bubble: {
    position: 'absolute',
    right: BUBBLE_RIGHT,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  // Same cream pill FreeCallGiftBubble puts under its icon, in the same place.
  label: {
    position: 'absolute',
    right: scale(14),
    width: LABEL_W,
    alignItems: 'stretch',
  },
  labelText: {
    backgroundColor: '#FFF9F3',
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E9D9C9',
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    fontSize: moderateScale(9),
    lineHeight: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: '700',
    textAlign: 'center',
  },
});
