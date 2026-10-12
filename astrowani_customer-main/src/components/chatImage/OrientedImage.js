// ─────────────────────────────────────────────────────────────────────────────
// OrientedImage — shows a photo as if the user's 90° taps had already been baked
// into the file, filling a box whose shape is the ORIENTED shape.
//
// The editor works entirely in "oriented" space: every crop, stroke and caption is
// normalised against the photo AFTER rotation, because that is the canvas the
// person is looking at and it is also the order the server composites in (rotate,
// then annotate, then crop — see astrowani-backend/src/chatImageComposer.js). This
// component is the one place that knows the difference between that space and the
// unrotated pixels the file actually contains.
//
// The trick for a quarter turn: a rotation happens about a view's CENTRE, so to
// land exactly on a `displayW × displayH` box the image element is given those two
// numbers SWAPPED and is offset by half their difference before being turned. Give
// it the box's own width and height instead and the picture comes out stretched —
// the classic rotated-image bug.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { View } from 'react-native';
import FastImage from 'react-native-fast-image';

const OrientedImage = ({ uri, rotate, displayW, displayH, style }) => {
  const quarter = rotate === 90 || rotate === 270;
  const w = quarter ? displayH : displayW;
  const h = quarter ? displayW : displayH;

  return (
    <View style={[{ width: displayW, height: displayH, overflow: 'hidden' }, style]}>
      <FastImage
        source={{ uri, priority: FastImage.priority.high }}
        // `stretch`, deliberately: the box has already been computed from the
        // photo's own aspect ratio, so `contain` would only add its own letterbox
        // on top and shrink the picture away from the frame the crop maths assumes.
        resizeMode={FastImage.resizeMode.stretch}
        style={{
          position: 'absolute',
          left: (displayW - w) / 2,
          top: (displayH - h) / 2,
          width: w,
          height: h,
          transform: rotate ? [{ rotate: `${rotate}deg` }] : undefined,
        }}
      />
    </View>
  );
};

export default OrientedImage;
