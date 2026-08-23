// Video-call astrologer carousel shown under "India's Best Astrologers" on Home —
// same astrologers as "India's Best Astrologers" above (shuffled into a
// different order). Exactly one big, full-opacity card sits centered at a
// time, with the next/previous cards peeking in small and dimmed on either
// side. Every few seconds it auto-advances one card to the left (the next
// card slides into center and grows/brightens) — still fully swipeable
// manually at any time, which pauses the auto-advance until the swipe ends.
import React, { useRef, useEffect, useMemo } from 'react';
import { Animated, View, Text, Image, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Dimensions } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { captureEvent } from '../../utils/Analytics';
import AstrologerBadge from '../../components/AstrologerBadge';
import { LanguageContext } from '../../context/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Center card + its two peeking neighbors span nearly the full screen width —
// CARD_MARGIN is the only gap between adjacent cards, so they stay visually
// separated without touching.
const CARD_MARGIN = scale(8);
const ITEM_WIDTH = Math.round(SCREEN_WIDTH * 0.62);
const CARD_WIDTH = ITEM_WIDTH - CARD_MARGIN * 2;
const SIDE_INSET = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const ADVANCE_INTERVAL_MS = 2800;
// The list is repeated so the carousel can loop endlessly: once the scroll gets
// deep into the copies we silently snap back to the equivalent early position.
// Every copy holds identical content, so the reset is imperceptible and the last
// astrologer is followed straight back into the first, forever.
//
// The count ADAPTS to the list length instead of being fixed, because this list
// is no longer virtualized (see the ScrollView note below) -- every copy is a
// real mounted view now, so a fixed multiplier would mean 8x a long astrologer
// list all held in memory at once. Bounding the TOTAL instead keeps memory flat
// regardless of how many astrologers exist, while still giving short lists
// enough copies that one copy is comfortably wider than the screen (with only
// 2-3 astrologers, two copies could be narrower than the viewport, which makes
// the wrap visible or leaves the list barely scrollable):
//
//   2 astrologers  -> 6 copies -> 12 cards
//   5 astrologers  -> 3 copies -> 15 cards
//   10 astrologers -> 2 copies -> 20 cards
//   20 astrologers -> 2 copies -> 40 cards
const MIN_LOOP_COUNT = 2;
const TARGET_TOTAL_CARDS = 12;
const loopCountFor = (n) =>
  n > 0 ? Math.max(MIN_LOOP_COUNT, Math.ceil(TARGET_TOTAL_CARDS / n)) : MIN_LOOP_COUNT;

function shuffledCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// One card = one mount = one set of native animated nodes.
//
// Creating the interpolations here (inside the item, memoized on index) is the
// only lifecycle that is actually correct. The two alternatives both crash:
//
//   * Calling scrollX.interpolate() inline in renderItem mints TWO NEW native
//     nodes on every render and attaches them to a recycled view. The superseded
//     nodes are dropped natively while views still reference them, so the queued
//     teardown hits tags that no longer exist:
//       disconnectAnimatedNodeFromView: Animated node with tag [N] does not exist
//       disconnectAnimatedNodes: Animated node with tag (parent) [N] does not exist
//     and the same churn desyncs the shadow tree into
//       IllegalViewOperationException: Trying to add unknown view tag: N
//
//   * Caching the interpolations for the PARENT's lifetime (keyed by index) fixes
//     those but breaks the other direction: RN destroys a native animated node
//     when its last attached view unmounts, and FlatList virtualization unmounts
//     offscreen items constantly. Scrolling a recycled index back into view then
//     reconnects an already-dead node:
//       connectAnimatedNodes: Animated node with tag (child) [N] does not exist
//
// Owning them per mounted item means node lifetime == view lifetime: created on
// mount, destroyed on unmount, never recreated mid-life and never reused after
// death. React.memo keeps a mounted card from re-rendering (and so from
// rebuilding its nodes) when only its siblings change.
//
// NOTE: ReanimatedUIManager appears in all of those stack traces purely because
// react-native-reanimated installs a global UIManager wrapper when present. This
// is RN's own Animated API - nothing on Home imports reanimated.
const MarqueeCard = React.memo(function MarqueeCard({ item, index, scrollX, onCallPress, t }) {
  const { cardScale, opacity } = React.useMemo(() => {
    const inputRange = [
      (index - 1) * ITEM_WIDTH,
      index * ITEM_WIDTH,
      (index + 1) * ITEM_WIDTH,
    ];
    return {
      cardScale: scrollX.interpolate({
        inputRange, outputRange: [0.72, 1, 0.72], extrapolate: 'clamp',
      }),
      opacity: scrollX.interpolate({
        inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp',
      }),
    };
  }, [index, scrollX]);


    return (
      <Animated.View style={[styles.card, { transform: [{ scale: cardScale }], opacity }]}>
        {/* Tap-tracking only — no navigation added here (that would be a UI/UX
            change beyond what was asked for). Separate from the Video Call button
            below on purpose: that one already fires call_initiated once the
            call actually goes through, tracked independently. */}
        <TouchableWithoutFeedback onPress={() => captureEvent('home_screen_click', {section: 'call_astrologer_card', label: item.name})}>
          <View style={styles.infoBlock}>
            <View style={styles.avatarWrap}>
              <Image
                resizeMode="cover"
                source={{ uri: item.profileImage || 'https://cdn-icons-png.flaticon.com/128/3135/3135715.png' }}
                style={styles.avatar}
              />
              <AstrologerBadge type={item.badgeType} size={scale(84)} />
            </View>
            <Text style={styles.name} numberOfLines={1}>{item.name || 'Astrologer'}</Text>
            <Text style={styles.specialty} numberOfLines={1}>
              {item.specialties?.[0]?.name || 'Vedic Astrology'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>{t('common.expYears', {count: item.experience || '0'})}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.language?.join(', ') || 'Hindi'}</Text>
          </View>
        </TouchableWithoutFeedback>
        {/* Video, not audio — this carousel was converted to video calling on
            2026-08-20. The "India's Best Astrologers" cards above now carry the
            audio Call button, so an identical audio action here was duplicated
            reach for one service and no reach at all for the other. */}
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.85} onPress={() => onCallPress(item)}>
          <MaterialIcons name="videocam" size={moderateScale(16)} color="#fff" style={{ marginRight: scale(6) }} />
          <Text style={styles.callBtnText}>{t('common.videoCall')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
});

export default function AnimatedAstrologerMarquee({ astrologers, onCallPress }) {
  const { t } = React.useContext(LanguageContext);
  // Stable across refetches: Home re-fetches astrologerToShow on focus/Realtime
  // signal, handing this a NEW array reference every time even when the actual
  // set of astrologers hasn't changed — re-shuffling on every one of those was
  // silently reordering the carousel out from under whoever was mid-view.
  // Only re-shuffle when the underlying set of ids actually changes; otherwise
  // keep the previous order and just refresh each item's data in place (price/
  // online-status/etc. may have updated even though who's in the list hasn't).
  const prevIdsRef = useRef('');
  const shuffledRef = useRef([]);
  const shuffled = useMemo(() => {
    const list = astrologers || [];
    const idsSignature = list.map((a) => a._id).sort().join(',');
    if (idsSignature === prevIdsRef.current && shuffledRef.current.length) {
      const byId = new Map(list.map((a) => [a._id, a]));
      const refreshed = shuffledRef.current.map((a) => byId.get(a._id) || a);
      shuffledRef.current = refreshed;
      return refreshed;
    }
    prevIdsRef.current = idsSignature;
    const fresh = shuffledCopy(list);
    shuffledRef.current = fresh;
    return fresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astrologers]);
  const loopCount = loopCountFor(shuffled.length);
  const looped = useMemo(
    () => (shuffled.length ? Array(loopCount).fill(shuffled).flat() : []),
    [shuffled, loopCount],
  );
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const pausedRef = useRef(false);


  // Once within the last full cycle of the buffer, wrap back to the
  // equivalent low index — content there is identical, so this is invisible.
  // Returns whether a wrap happened, so the caller doesn't ALSO animate to
  // the pre-wrap offset on the same tick (that produced a visible double-move:
  // an instant jump immediately followed by an animated scroll on top of it).
  const maybeWrap = () => {
    const n = shuffled.length;
    if (!n) return false;
    const safeCeiling = n * (loopCount - 1);
    if (indexRef.current >= safeCeiling) {
      indexRef.current = indexRef.current % n;
      try {
        listRef.current?.scrollToOffset({ offset: indexRef.current * ITEM_WIDTH, animated: false });
      } catch (_) {}
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!looped.length) return undefined;
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      indexRef.current += 1;
      const wrapped = maybeWrap();
      if (!wrapped) {
        try {
          listRef.current?.scrollToOffset({ offset: indexRef.current * ITEM_WIDTH, animated: true });
        } catch (_) {}
      }
    }, ADVANCE_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looped.length]);

  if (!looped.length) return null;

  const renderItem = ({ item, index }) => (
    <MarqueeCard
      item={item}
      index={index}
      scrollX={scrollX}
      onCallPress={onCallPress}
      t={t}
    />
  );

  return (
    <Animated.FlatList
      ref={listRef}
      data={looped}
      keyExtractor={(item, index) => `marquee-${item._id}-${index}`}
      renderItem={renderItem}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Stays false: this horizontal list is nested in the outer vertical
      // ScrollView, a combination that hits a documented Android crash in RN's
      // clipping/view-recycling path.
      //
      // NOTE (2026-08-23): converting this list to a non-virtualized ScrollView was
      // tried as a fix for
      //   IllegalViewOperationException: Trying to add unknown view tag: N
      // on the theory that view recycling was the cause. It is NOT -- the crash
      // still reproduced (74s) with recycling removed entirely, so that change was
      // reverted. The cause of that exception is still unidentified; do not spend
      // time re-testing virtualization. What IS fixed is the separate family of
      // NativeAnimatedNodesManager crashes, via useNativeDriver:false below.
      removeClippedSubviews={false}
      snapToInterval={ITEM_WIDTH}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: SIDE_INSET, paddingVertical: verticalScale(14) }}
      scrollEventThrottle={16}
      // useNativeDriver MUST stay false here. This is not a performance
      // preference -- it is the only configuration of this list that does not
      // crash.
      //
      // A native-driven scroll event feeding PER-ITEM interpolations inside a
      // VIRTUALIZED list is unsafe, because virtualization mounts and unmounts
      // item views continuously while the auto-advance interval above is
      // programmatically scrolling. Every mount/unmount has to connect or
      // disconnect that item's native animated nodes, and those operations are
      // queued and executed asynchronously (NativeAnimatedModule's
      // ConcurrentOperationQueue) -- so they routinely execute against a node
      // or view the other side of the race has already dropped. On 2026-08-23
      // this produced FIVE different fatal exceptions, all from
      // NativeAnimatedNodesManager, all on this one list:
      //
      //   disconnectAnimatedNodeFromView: node with tag [N] does not exist
      //   disconnectAnimatedNodes:        node with tag (parent) [N] does not exist
      //   connectAnimatedNodes:           node with tag (child) [N] does not exist
      //   connectAnimatedNodeToView:      node with tag [N] does not exist
      //   IllegalViewOperationException:  Trying to add unknown view tag: N
      //
      // Two structural fixes were tried first and BOTH failed, from opposite
      // directions -- recording them so nobody burns the time again:
      //
      //   1. Caching the interpolations for the parent's lifetime (keyed by
      //      index) stopped the per-render node churn and the disconnect
      //      crashes, but RN destroys a native node when its last attached view
      //      unmounts, so scrolling a recycled index back into view reconnected
      //      an already-dead node -> connectAnimatedNodes (child).
      //   2. Owning them per mounted item (a React.memo'd card with useMemo, so
      //      node lifetime == view lifetime) is the textbook-correct ownership
      //      and still crashed at ~13 min -> connectAnimatedNodeToView. The
      //      race is in the queue, not in the ownership.
      //
      // With useNativeDriver false the interpolation is computed in JS and NO
      // native animated nodes exist for this list at all, which removes the
      // entire failure class rather than moving it. The documented cost is real
      // and accepted: under heavy JS-thread load the scale/opacity can lag the
      // true scroll position for a frame or two. A briefly imprecise transition
      // is not comparable to a fatal crash on the app's first screen.
      //
      // Do not "optimise" this back to true. If the UI-thread smoothness is
      // ever genuinely needed, the list itself has to stop being virtualized
      // (or stop being programmatically auto-scrolled) first.
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
        { useNativeDriver: false },
      )}
      onScrollBeginDrag={() => { pausedRef.current = true; }}
      onScrollEndDrag={() => {
        // A drag doesn't always end in momentum (a short flick, or the touch
        // getting partly absorbed by the Video Call button inside the card) — if
        // un-pausing only happened in onMomentumScrollEnd below, a drag that
        // never triggers momentum left auto-advance paused forever. This
        // guarantees it always resumes; onMomentumScrollEnd (when it does
        // fire) still owns re-syncing indexRef to the settled position.
        pausedRef.current = false;
      }}
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
  infoBlock: {
    width: '100%',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: verticalScale(10),
  },
  avatar: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    borderWidth: 2.5,
    borderColor: COLORS.AstroGold,
  },
  name: {
    fontSize: moderateScale(15.5),
    fontWeight: '700',
    color: COLORS.textDark,
    textAlign: 'center',
  },
  specialty: {
    fontSize: moderateScale(12.5),
    color: '#888',
    marginTop: verticalScale(3),
    textAlign: 'center',
  },
  meta: {
    fontSize: moderateScale(11.5),
    color: '#999',
    marginTop: verticalScale(2),
    textAlign: 'center',
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
