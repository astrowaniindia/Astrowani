// Call-only astrologer carousel shown just above the Blogs section on Home —
// same astrologers as "India's Best Astrologers" above (shuffled into a
// different order). Exactly one big, full-opacity card sits centered at a
// time, with the next/previous cards peeking in small and dimmed on either
// side. Every few seconds it auto-advances one card to the left (the next
// card slides into center and grows/brightens) — still fully swipeable
// manually at any time, which pauses the auto-advance until the swipe ends.
import React, { useRef, useEffect, useMemo } from 'react';
import { Animated, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Center card + its two peeking neighbors span nearly the full screen width —
// CARD_MARGIN is the only gap between adjacent cards, so they stay visually
// separated without touching.
const CARD_MARGIN = scale(8);
const ITEM_WIDTH = Math.round(SCREEN_WIDTH * 0.62);
const CARD_WIDTH = ITEM_WIDTH - CARD_MARGIN * 2;
const SIDE_INSET = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const ADVANCE_INTERVAL_MS = 2800;
// A large, finite, repeated copy of the shuffled list — not truly infinite
// data, but once the scroll position gets deep into it we silently snap back
// to the equivalent early position with no animation. Since that position
// holds identical content (same shuffled order repeating), the reset is
// imperceptible, so it behaves as an endless loop: the last astrologer is
// immediately followed by the first again, forever.
const LOOP_COUNT = 40;

function shuffledCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function AnimatedAstrologerMarquee({ astrologers, onCallPress }) {
  const shuffled = useMemo(() => shuffledCopy(astrologers || []), [astrologers]);
  const looped = useMemo(
    () => (shuffled.length ? Array(LOOP_COUNT).fill(shuffled).flat() : []),
    [shuffled],
  );
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const pausedRef = useRef(false);

  // Once within the last full cycle of the buffer, wrap back to the
  // equivalent low index — content there is identical, so this is invisible.
  const maybeWrap = () => {
    const n = shuffled.length;
    if (!n) return;
    const safeCeiling = n * (LOOP_COUNT - 1);
    if (indexRef.current >= safeCeiling) {
      indexRef.current = indexRef.current % n;
      try {
        listRef.current?.scrollToOffset({ offset: indexRef.current * ITEM_WIDTH, animated: false });
      } catch (_) {}
    }
  };

  useEffect(() => {
    if (!looped.length) return undefined;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      indexRef.current += 1;
      maybeWrap();
      try {
        listRef.current?.scrollToOffset({ offset: indexRef.current * ITEM_WIDTH, animated: true });
      } catch (_) {}
    }, ADVANCE_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looped.length]);

  if (!looped.length) return null;

  const renderItem = ({ item, index }) => {
    const inputRange = [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH];
    const cardScale = scrollX.interpolate({
      inputRange, outputRange: [0.72, 1, 0.72], extrapolate: 'clamp',
    });
    const opacity = scrollX.interpolate({
      inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.card, { transform: [{ scale: cardScale }], opacity }]}>
        <Image
          resizeMode="cover"
          source={{ uri: item.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
          style={styles.avatar}
        />
        <Text style={styles.name} numberOfLines={1}>{item.name || 'Astrologer'}</Text>
        <Text style={styles.specialty} numberOfLines={1}>
          {item.specialties?.[0]?.name || 'Vedic Astrology'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>Exp: {item.experience || '0'} years</Text>
        <Text style={styles.meta} numberOfLines={1}>{item.language?.join(', ') || 'Hindi'}</Text>
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.85} onPress={() => onCallPress(item)}>
          <MaterialIcons name="call" size={moderateScale(16)} color="#fff" style={{ marginRight: scale(6) }} />
          <Text style={styles.callBtnText}>Call</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Animated.FlatList
      ref={listRef}
      data={looped}
      keyExtractor={(item, index) => `marquee-${item._id}-${index}`}
      renderItem={renderItem}
      horizontal
      showsHorizontalScrollIndicator={false}
      removeClippedSubviews={false}
      snapToInterval={ITEM_WIDTH}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: SIDE_INSET, paddingVertical: verticalScale(14) }}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: false },
      )}
      onScrollBeginDrag={() => { pausedRef.current = true; }}
      onMomentumScrollEnd={(e) => {
        pausedRef.current = false;
        indexRef.current = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH);
        maybeWrap();
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(18),
    paddingHorizontal: scale(14),
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatar: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    borderWidth: 2.5,
    borderColor: COLORS.AstroGold,
    marginBottom: verticalScale(10),
  },
  name: {
    fontSize: moderateScale(15.5),
    fontWeight: '700',
    color: COLORS.textDark,
  },
  specialty: {
    fontSize: moderateScale(12.5),
    color: '#888',
    marginTop: verticalScale(3),
  },
  meta: {
    fontSize: moderateScale(11.5),
    color: '#999',
    marginTop: verticalScale(2),
  },
  callBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(28),
    alignItems: 'center',
    marginTop: verticalScale(12),
  },
  callBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
});
