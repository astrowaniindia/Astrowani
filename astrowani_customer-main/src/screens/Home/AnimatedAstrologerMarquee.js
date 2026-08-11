// A second, independently-animated row of astrologer cards shown below the
// main "India's Best Astrologers" list on Home — same astrologers, shuffled
// into a different order, Call-only (the main list above already covers
// Chat/Call/Video via its own buttons). Continuously drifts sideways forever
// (same imperative scrollToOffset-per-frame technique as the list above),
// but each card also scales up/brightens as it nears the horizontal center
// and shrinks/dims toward the edges — a lightweight depth/coverflow feel.
// Still swipeable: touching pauses the auto-drift, matching the list above.
import React, { useRef, useEffect, useMemo } from 'react';
import { Animated, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const CARD_WIDTH = scale(120);
const CARD_MARGIN = scale(8);
const ITEM_WIDTH = CARD_WIDTH + CARD_MARGIN * 2;
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
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!looped.length) return undefined;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      offsetRef.current += 0.9;
      scrollX.setValue(offsetRef.current);
      try {
        listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
      } catch (_) {}
    }, 16);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looped.length]);

  if (!looped.length) return null;

  const renderItem = ({ item, index }) => {
    const inputRange = [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH];
    const cardScale = scrollX.interpolate({
      inputRange, outputRange: [0.82, 1.1, 0.82], extrapolate: 'clamp',
    });
    const opacity = scrollX.interpolate({
      inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp',
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
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.85} onPress={() => onCallPress(item)}>
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
      contentContainerStyle={styles.list}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        {
          useNativeDriver: false,
          listener: (e) => {
            if (pausedRef.current) offsetRef.current = e.nativeEvent.contentOffset.x;
          },
        },
      )}
      onTouchStart={() => { pausedRef.current = true; }}
      onTouchEnd={() => { pausedRef.current = false; }}
      onScrollBeginDrag={() => { pausedRef.current = true; }}
      onScrollEndDrag={() => { pausedRef.current = false; }}
      onMomentumScrollBegin={() => { pausedRef.current = true; }}
      onMomentumScrollEnd={() => { pausedRef.current = false; }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
  },
  card: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(8),
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  avatar: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    borderWidth: 2,
    borderColor: COLORS.AstroGold,
    marginBottom: verticalScale(6),
  },
  name: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: COLORS.textDark,
  },
  specialty: {
    fontSize: moderateScale(10.5),
    color: '#888',
    marginTop: verticalScale(2),
    marginBottom: verticalScale(8),
  },
  callBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(18),
  },
  callBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: moderateScale(11.5),
  },
});
