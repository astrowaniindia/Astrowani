import React from 'react';
import {View, Image, StyleSheet} from 'react-native';
import {scale} from '../utils/Scaling';
import FEATURED_ASTROLOGERS from '../constants/featuredAstrologers';

/**
 * The overlapping row of real astrologer faces on the free-call login screen, in place
 * of the illustrated guide that used to stand there (owner, 2026-10-26).
 *
 * Everything it draws is bundled -- see src/constants/featuredAstrologers.js for why it
 * must never be fetched. There is no loading state and no error state here for exactly
 * that reason: a `require`d image cannot fail to arrive.
 *
 * The middle face is drawn larger and last so it sits ON TOP of both its neighbours.
 * The others overlap outward from it, which is what makes the row read as a group
 * standing together rather than a list of thumbnails.
 */
const FeaturedAstrologerRow = ({size = scale(54), style}) => {
  const people = FEATURED_ASTROLOGERS;
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
              source={p.image}
              style={styles.photo}
              resizeMode="cover"
              accessibilityLabel={p.name}
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
