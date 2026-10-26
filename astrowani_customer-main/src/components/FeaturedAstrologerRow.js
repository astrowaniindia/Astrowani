import React, {useEffect, useMemo, useState} from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {scale} from '../utils/Scaling';
import FEATURED_ASTROLOGERS from '../constants/featuredAstrologers';
import {
  getLiveAstrologers,
  subscribeLiveAstrologers,
} from '../utils/featuredAstrologersLive';

/**
 * The overlapping row of astrologer faces, in place of the illustrated guide that used
 * to stand on both of these screens (owner, 2026-10-26).
 *
 * Two modes, and the difference is deliberate:
 *   <FeaturedAstrologerRow />             the bundled five, always, never fetched.
 *                                         This is the GIFT screen.
 *   <FeaturedAstrologerRow live />        the centre stays pinned; the other four are
 *                                         replaced by astrologers who are reachable
 *                                         right now. This is the free-call LOGIN screen.
 *
 * Even in live mode the bundled five are the floor -- they are what renders on the
 * first frame, and what stays in any slot the live list cannot fill. There is no
 * loading state here on purpose: there is never a moment with nothing to draw.
 *
 * The middle face is drawn larger and last so it sits ON TOP of both its neighbours.
 * The others overlap outward from it, which is what makes the row read as a group
 * standing together rather than a list of thumbnails.
 */
const FeaturedAstrologerRow = ({size = scale(54), live = false, style}) => {
  // Seeded from the cache rather than from empty, so a row mounting AFTER the prefetch
  // has landed is correct on its first frame and never visibly shuffles.
  const [liveList, setLiveList] = useState(() => (live ? getLiveAstrologers() : []));

  useEffect(() => {
    if (!live) {
      return undefined;
    }
    // Covers the other order: mounted while the prefetch was still in the air.
    return subscribeLiveAstrologers(setLiveList);
  }, [live]);

  const people = useMemo(() => {
    const base = FEATURED_ASTROLOGERS;
    const mid = Math.floor(base.length / 2);
    if (!live || !liveList.length) {
      return base;
    }

    // Anyone already being shown live must not also appear as their bundled self.
    const liveIds = new Set(liveList.map((a) => a.id));
    const spares = base.filter((p, i) => i !== mid && !liveIds.has(p.id));

    // Slots are filled from the centre outwards, so when only one or two astrologers
    // are reachable they stand next to the pinned face instead of at the far edges
    // with bundled faces between them.
    const order = [];
    for (let step = 1; step <= mid; step += 1) {
      order.push(mid - step, mid + step);
    }

    const out = base.slice();
    const queue = liveList.slice();
    const spare = spares.slice();
    order.forEach((slot) => {
      if (slot < 0 || slot >= out.length) {
        return;
      }
      // A live astrologer if there is one left, otherwise a bundled face that is not
      // already on screen. Never a gap: every slot ends up with somebody.
      out[slot] = queue.shift() || spare.shift() || out[slot];
    });
    return out;
  }, [live, liveList]);

  const [failed, setFailed] = useState({});

  if (!people.length) {
    return null;
  }
  const mid = Math.floor(people.length / 2);
  const overlap = size * 0.28;
  const leadSize = size * 1.18;

  return (
    <View style={[styles.row, style]} accessibilityRole="image">
      {people.map((p, i) => {
        const isLead = i === mid;
        const d = isLead ? leadSize : size;
        // A remote photo that will not load falls back to the bundled face for that
        // slot, so a dead URL costs one familiar face rather than an empty ring.
        const src =
          p.uri && !failed[p.key]
            ? {uri: p.uri}
            : p.image || FEATURED_ASTROLOGERS[i]?.image;
        if (!src) {
          return null;
        }
        return (
          <View
            key={p.key}
            style={[
              styles.slot,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                // Pull every circle toward its neighbour. The first one keeps its full
                // left edge so the whole row stays optically centred.
                marginLeft: i === 0 ? 0 : -overlap,
                // The centre face overlaps BOTH sides, so it has to paint above them;
                // the rest step down away from it. On Android elevation is the one that
                // decides this, zIndex alone is not enough.
                zIndex: isLead ? people.length : people.length - Math.abs(i - mid),
                elevation: isLead ? people.length : people.length - Math.abs(i - mid),
              },
            ]}>
            <Image
              source={src}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={p.name}
              onError={() => setFailed((f) => ({...f, [p.key]: true}))}
            />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The ring is drawn by the WRAPPER, not the Image. An Image with its own borderRadius
  // and border hairlines on Android -- a thin seam of the photo bleeds past the radius
  // at the corners. Clipping the photo inside a plain rounded View avoids it entirely.
  slot: {
    overflow: 'hidden',
    borderWidth: scale(2),
    borderColor: '#FFF6EA',
    backgroundColor: '#FFF6EA',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});

export default FeaturedAstrologerRow;
