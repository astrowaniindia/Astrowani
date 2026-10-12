// ─────────────────────────────────────────────────────────────────────────────
// StrokeCanvas — draws freehand strokes using nothing but <View>s.
//
// WHY NOT SVG (OR SKIA)
//   react-native-svg is in the CUSTOMER app and NOT in the astrologer app, and
//   adding it there would be a new native dependency — a Play Store / App Store
//   build before either side could annotate a photo, and no OTA path. A segment of
//   a line is a rotated rectangle with rounded ends, which plain views do perfectly
//   well, so the two apps can share this file byte-for-byte and the whole feature
//   ships over the air. See src/utils/chatImage.js for the same reasoning applied
//   to the compositing.
//
// WHAT IT IS AND IS NOT
//   This is the PREVIEW. The artefact that actually gets sent is composited
//   server-side at full resolution from the same normalised coordinates
//   (astrowani-backend/src/chatImageComposer.js), with round caps and joins to
//   match. So this does not need to be pixel-perfect; it needs to be fast and to
//   put the ink under the finger.
//
// PERFORMANCE
//   Every finished stroke is its own React.memo'd component, so dragging a finger
//   re-renders ONLY the stroke being drawn — not the dozen already on the photo.
//   This matters: the phones this app runs on are budget Androids, and a naive
//   version re-renders every segment of every stroke on every touch move.
// ─────────────────────────────────────────────────────────────────────────────
import React, { memo } from 'react';
import { View } from 'react-native';

/**
 * One straight piece of a stroke: a rectangle as long as the gap between two
 * points, as thick as the brush, rotated to point from one to the other.
 *
 * It is positioned by its CENTRE and rotated about its own centre — React Native's
 * default transform origin — so no transformOrigin is needed (that property's
 * support varies by version, and this needs none of it).
 */
function segmentStyle(x1, y1, x2, y2, width, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    position: 'absolute',
    left: (x1 + x2) / 2 - len / 2,
    top: (y1 + y2) / 2 - width / 2,
    width: len,
    height: width,
    // Round ends, which also fills the wedge at every joint — the reason a chain of
    // straight segments reads as one smooth line rather than a jointed worm.
    borderRadius: width / 2,
    backgroundColor: color,
    transform: [{ rotate: `${angle}deg` }],
  };
}

/** A dot, for a tap — how you mark one house on a chart. */
function dotStyle(x, y, width, color) {
  return {
    position: 'absolute',
    left: x - width / 2,
    top: y - width / 2,
    width,
    height: width,
    borderRadius: width / 2,
    backgroundColor: color,
  };
}

/**
 * `points` are normalised 0..1 against the oriented image; `w`/`h` are the pixel
 * size of the box they are being drawn into. Keeping the geometry normalised is
 * what lets the same numbers drive this preview and the server's render.
 */
const Stroke = memo(({ stroke, w, h }) => {
  const width = Math.max(1.5, stroke.width * w);
  const pts = stroke.points;
  if (pts.length === 1) {
    return <View pointerEvents="none" style={dotStyle(pts[0].x * w, pts[0].y * h, width, stroke.color)} />;
  }
  const out = [];
  for (let i = 1; i < pts.length; i += 1) {
    out.push(
      <View
        pointerEvents="none"
        key={i}
        style={segmentStyle(pts[i - 1].x * w, pts[i - 1].y * h, pts[i].x * w, pts[i].y * h, width, stroke.color)}
      />,
    );
  }
  // A dot at the start too, so a stroke that begins with a tap-and-flick is not
  // visibly blunt at its first point.
  out.unshift(<View pointerEvents="none" key="cap" style={dotStyle(pts[0].x * w, pts[0].y * h, width, stroke.color)} />);
  return <>{out}</>;
});

const StrokeCanvas = ({ strokes, live, width, height }) => (
  <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
    {strokes.map((s) => <Stroke key={s.id} stroke={s} w={width} h={height} />)}
    {/* The stroke under the finger, kept separate so the finished ones stay memoised. */}
    {live && live.points.length > 0 && <Stroke stroke={live} w={width} h={height} />}
  </View>
);

export default StrokeCanvas;
