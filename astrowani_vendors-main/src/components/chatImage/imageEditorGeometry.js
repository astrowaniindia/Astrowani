// ─────────────────────────────────────────────────────────────────────────────
// The arithmetic behind the image editor, with no React in it.
//
// Pulled out of the component on purpose: this is where a photo ends up cropped to
// the wrong part of itself or a drawing ends up half an inch from where the finger
// was, and none of it needs a screen to be checked. scripts/testImageEditorGeometry.js
// exercises it directly.
//
// THE ONE CONVENTION EVERYTHING ELSE FOLLOWS: every coordinate here is normalised
// 0..1 against the ORIENTED image — the photo after the user's 90° taps, before the
// crop. x and widths divide by the oriented WIDTH, y and heights by the oriented
// HEIGHT, a brush width by the WIDTH and a font size by the HEIGHT. The server
// reads exactly the same convention, which is what makes the preview and the sent
// photo agree.
// ─────────────────────────────────────────────────────────────────────────────

/** Smallest crop we will allow, as a fraction of each side. */
const MIN_CROP = 0.08;

const ASPECTS = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 4 / 5 },
  { id: 'wide', label: '16:9', ratio: 16 / 9 },
];

const BRUSHES = [0.006, 0.013, 0.024];
const TEXT_SIZES = [0.045, 0.07, 0.11];
const PALETTE = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#1c1c1e'];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** The oriented pixel size of a photo after `rotate` degrees of quarter turns. */
function orientedSize(width, height, rotate) {
  return (rotate === 90 || rotate === 270) ? { w: height, h: width } : { w: width, h: height };
}

/** Largest w×h with the given aspect ratio that fits inside a box. */
function fitInside(aspect, boxW, boxH) {
  if (!(aspect > 0) || !(boxW > 0) || !(boxH > 0)) return { w: 0, h: 0 };
  let w = boxW;
  let h = boxW / aspect;
  if (h > boxH) { h = boxH; w = boxH * aspect; }
  return { w, h };
}

/**
 * One clockwise quarter turn, applied to a normalised POINT.
 *
 * Because annotations live in oriented space, turning the photo has to carry them
 * with it — otherwise a stroke drawn on someone's forehead ends up on their
 * shoulder the moment they straighten the picture. Top-left (0,0) becomes
 * top-right (1,0), which is the whole of the mapping below.
 */
function rotatePoint90(p) {
  return { x: 1 - p.y, y: p.x };
}

/** The same turn applied to a normalised RECT. */
function rotateRect90(r) {
  return { x: 1 - (r.y + r.h), y: r.x, w: r.h, h: r.w };
}

/**
 * Everything in the edit spec, turned one quarter clockwise.
 *
 * Brush widths and font sizes are rescaled as well, because they are normalised
 * against sides that have just swapped: a brush is a fraction of the width, so
 * after the turn the same fraction would mean a different number of real pixels
 * and a line would visibly change thickness as the photo was straightened.
 * `orientedW`/`orientedH` are the dimensions BEFORE this turn.
 */
function rotateEditsClockwise({ crop, strokes, texts }, orientedW, orientedH) {
  const widthScale = orientedH > 0 ? orientedW / orientedH : 1;
  const sizeScale = orientedW > 0 ? orientedH / orientedW : 1;
  return {
    crop: rotateRect90(crop),
    strokes: strokes.map((s) => ({
      ...s,
      points: s.points.map(rotatePoint90),
      width: s.width * widthScale,
    })),
    texts: texts.map((t) => {
      const p = rotatePoint90({ x: t.x, y: t.y });
      return { ...t, x: p.x, y: p.y, size: t.size * sizeScale };
    }),
  };
}

/**
 * The on-screen box for CROP mode: the whole oriented photo, letterboxed into the
 * available area with a margin so the corner handles are not against the edge of
 * the screen where a thumb cannot reach them.
 */
function cropStageBox(orientedW, orientedH, areaW, areaH, pad = 28) {
  const { w, h } = fitInside(orientedW / orientedH, Math.max(1, areaW - pad * 2), Math.max(1, areaH - pad * 2));
  return { w, h, left: (areaW - w) / 2, top: (areaH - h) / 2 };
}

/**
 * The on-screen box for DRAW / TEXT mode: the CROPPED region, filling the area.
 * Drawing on the cropped result rather than on the whole photo is what makes the
 * preview honest — ink put near the edge stays near the edge of what gets sent.
 */
function annotateStageBox(orientedW, orientedH, crop, areaW, areaH, pad = 10) {
  const aspect = (crop.w * orientedW) / (crop.h * orientedH);
  const { w, h } = fitInside(aspect, Math.max(1, areaW - pad * 2), Math.max(1, areaH - pad * 2));
  return { w, h, left: (areaW - w) / 2, top: (areaH - h) / 2 };
}

/**
 * How to place the full photo inside the crop-sized window so that exactly the
 * cropped part shows: scaled up until the crop fills the window, then slid so the
 * crop's top-left corner sits at the window's top-left.
 */
function annotateImagePlacement(orientedW, orientedH, crop, box) {
  const scale = box.w / Math.max(1, crop.w * orientedW);
  return {
    width: orientedW * scale,
    height: orientedH * scale,
    left: -crop.x * orientedW * scale,
    top: -crop.y * orientedH * scale,
    scale,
  };
}

/** A touch inside the annotate window -> a normalised point on the oriented photo. */
function canvasToOriented(px, py, crop, box) {
  return {
    x: crop.x + (px / Math.max(1, box.w)) * crop.w,
    y: crop.y + (py / Math.max(1, box.h)) * crop.h,
  };
}

/** …and back, for drawing something at a normalised position. */
function orientedToCanvas(x, y, crop, box) {
  return {
    x: ((x - crop.x) / Math.max(1e-6, crop.w)) * box.w,
    y: ((y - crop.y) / Math.max(1e-6, crop.h)) * box.h,
  };
}

/**
 * Move or resize the crop rect.
 *
 * `handle` is 'tl' | 'tr' | 'bl' | 'br' | 'move'. `dx`/`dy` are normalised deltas.
 * `ratio` (output width / output height) locks the shape when an aspect preset is
 * on; because the photo itself is not square, that ratio has to be converted into
 * normalised units using the oriented dimensions, which is the step that is easy
 * to leave out and which makes "1:1" come out as a rectangle.
 */
function applyCropDrag(crop, handle, dx, dy, ratio, orientedW, orientedH) {
  let { x, y, w, h } = crop;

  if (handle === 'move') {
    // Slides, never resizes: running into the edge stops it rather than squashing it.
    x = clamp(x + dx, 0, 1 - w);
    y = clamp(y + dy, 0, 1 - h);
    return { x, y, w, h };
  }

  const right = x + w;
  const bottom = y + h;

  if (handle === 'tl' || handle === 'bl') {
    x = clamp(x + dx, 0, right - MIN_CROP);
    w = right - x;
  } else {
    w = clamp(w + dx, MIN_CROP, 1 - x);
  }
  if (handle === 'tl' || handle === 'tr') {
    y = clamp(y + dy, 0, bottom - MIN_CROP);
    h = bottom - y;
  } else {
    h = clamp(h + dy, MIN_CROP, 1 - y);
  }

  if (ratio) {
    // Width is authoritative and height follows, so dragging feels like one
    // continuous motion rather than fighting between the two axes.
    const wantH = (w * orientedW) / (ratio * orientedH);
    if (wantH >= MIN_CROP && wantH <= 1) {
      h = wantH;
    } else {
      h = clamp(wantH, MIN_CROP, 1);
      w = (ratio * h * orientedH) / orientedW;
    }
    // Anchor the side the gesture is NOT dragging, so the corner under the finger
    // is the one that moves.
    if (handle === 'tl' || handle === 'tr') y = clamp(bottom - h, 0, 1 - h);
    if (handle === 'tl' || handle === 'bl') x = clamp(right - w, 0, 1 - w);
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
  }

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    w: clamp(w, MIN_CROP, 1 - clamp(x, 0, 1)),
    h: clamp(h, MIN_CROP, 1 - clamp(y, 0, 1)),
  };
}

/** The largest rect of `ratio` centred in the photo — what tapping a preset gives. */
function cropForAspect(ratio, orientedW, orientedH) {
  if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
  const imageRatio = orientedW / orientedH;
  let w = 1;
  let h = 1;
  if (ratio > imageRatio) {
    h = imageRatio / ratio;
  } else {
    w = ratio / imageRatio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/**
 * Thin out a finger path. A touch stream delivers points a pixel or two apart,
 * which costs a view per pair for a line nobody can tell from a smooth one; a
 * minimum gap keeps the preview cheap and the request small without any visible
 * loss. Dropping points is safe because the server joins them with round caps.
 */
function shouldKeepPoint(prev, next, box, minPx = 4) {
  if (!prev) return true;
  const dx = (next.x - prev.x) * box.w;
  const dy = (next.y - prev.y) * box.h;
  return (dx * dx + dy * dy) >= minPx * minPx;
}

/**
 * The payload the backend receives. Rounded hard on the way out: six decimal
 * places is far finer than a pixel on any phone, and a request carrying 15
 * significant figures per point is several times larger for no benefit at all.
 */
function buildEditSpec({ rotate, crop, strokes, texts }) {
  const r = (n) => Math.round(n * 1e6) / 1e6;
  return {
    rotate,
    crop: { x: r(crop.x), y: r(crop.y), w: r(crop.w), h: r(crop.h) },
    strokes: strokes.map((s) => ({
      color: s.color,
      width: r(s.width),
      points: s.points.map((p) => ({ x: r(p.x), y: r(p.y) })),
    })),
    texts: texts
      .filter((t) => t.text && t.text.trim())
      .map((t) => ({ text: t.text, x: r(t.x), y: r(t.y), size: r(t.size), color: t.color })),
  };
}

/** Has the photo actually been changed? Decides whether "Reset" is offered. */
function hasEdits({ rotate, crop, strokes, texts }) {
  const cropped = crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;
  return !!rotate || cropped || strokes.length > 0 || texts.length > 0;
}

// CommonJS on purpose: this module is required directly by
// scripts/testImageEditorGeometry.js under plain Node, with no Metro and no babel
// in the way. Metro's interop imports the named bindings below exactly as if they
// were ES exports, so the component's `import { ... }` is unaffected.
module.exports = {
  MIN_CROP,
  ASPECTS,
  BRUSHES,
  TEXT_SIZES,
  PALETTE,
  clamp,
  orientedSize,
  fitInside,
  rotatePoint90,
  rotateRect90,
  rotateEditsClockwise,
  cropStageBox,
  annotateStageBox,
  annotateImagePlacement,
  canvasToOriented,
  orientedToCanvas,
  applyCropDrag,
  cropForAspect,
  shouldKeepPoint,
  buildEditSpec,
  hasEdits,
};
