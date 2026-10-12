// ─────────────────────────────────────────────────────────────────────────────
// Chat image composer — turns a picked photo plus an EDIT SPEC into the final
// flattened JPEG that gets stored and shown in the chat.
//
// WHY THE COMPOSITING HAPPENS HERE AND NOT IN THE APP
//
// The obvious React Native way to "send an edited image" is to draw the crop,
// the strokes and the text in a view and rasterise it with
// react-native-view-shot. That would have meant a NEW NATIVE DEPENDENCY in both
// apps — i.e. a Play Store / App Store build before a single user could attach a
// photo, and no OTA path at all (CLAUDE.md: "OTA bundles ship the whole JS bundle
// … check whether a native dependency changed"). It would also have produced a
// SCREEN-RESOLUTION screenshot: an astrologer zooming into a photographed horoscope
// would be looking at ~1080px of a 2000px original.
//
// So the apps send the ORIGINAL picked photo plus a small JSON description of what
// the person did to it, and sharp — already a backend dependency, used by
// uploadRoutes for AVIF/HEIC normalisation — replays those edits at full
// resolution. Consequences worth knowing:
//   * The feature ships by OTA. react-native-image-picker is already autolinked in
//     both apps, and both already hold CAMERA + photo-library permissions, so
//     nothing native changes.
//   * The apps' editor preview is a FAITHFUL PREVIEW, not the artefact itself.
//     Geometry matches exactly (everything below is in normalised units), text
//     metrics are close but not identical — see TEXT_TOP_CORRECTION.
//
// COORDINATE SYSTEM (the thing to not get wrong)
//
// Every number in the edit spec is normalised 0..1 against the ORIENTED image —
// the photo after EXIF auto-rotation and after the user's own 90° rotations, but
// BEFORE the crop. Annotations are therefore anchored to the PHOTO, not to the
// crop frame, which is why the editor lets you go back and re-crop after drawing
// without the drawing sliding around (and why a stroke outside the final crop is
// correctly cut off). x/width normalise against the oriented WIDTH, y/height
// against the oriented HEIGHT; stroke width against the width, text size against
// the height.
//
// MARKUP INJECTION: colours are matched against a strict 6-digit hex regex and
// text is XML-escaped before it reaches an SVG string or pango markup. Same class
// of rule as src/pgrstFilter.js — a request value that lands inside a markup
// string is a structural risk, not just a rendering one.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Bundled rather than relying on whatever fonts the VPS happens to have installed:
// a caption that renders on the dev machine and silently comes out blank in
// production is exactly the kind of failure this project has been bitten by before.
// Poppins is the customer app's own display font AND covers Devanagari, so Hindi
// annotations work (verified: "नमस्ते कुंडली" rasterises to real glyphs).
const FONT_FILE = path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-Bold.ttf');
const FONT_FAMILY = 'Poppins';

// Output ceiling. 1600px on the long edge is plenty to pinch-zoom a photographed
// kundali chart and keeps a typical annotated photo at 150-400 KB, which matters on
// a single-core backend serving phones on Indian mobile data.
const MAX_OUTPUT_EDGE = 1600;
const JPEG_QUALITY = 84;

// Guard rails on the spec itself. Generous for a human, bounded for a script.
const LIMITS = {
  strokes: 120,
  pointsPerStroke: 800,
  texts: 20,
  textChars: 160,
  minStrokeWidth: 0.002, // of the oriented image width
  maxStrokeWidth: 0.09,
  minTextSize: 0.015, // of the oriented image height
  maxTextSize: 0.25,
  minCropSize: 0.05,
  // 50 MP. A 2000x2000 pick is 4 MP; this only exists so a crafted file cannot
  // make sharp allocate unbounded memory.
  inputPixels: 50e6,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

// sharp's text output is cropped tight to the INK, so its top edge is the top of
// the tallest glyph on the first line. React Native's <Text> box top is the LINE
// BOX top, which sits above that by the font's internal leading. The editor records
// the line-box top, so the rendered block is nudged down by this fraction of the
// font size to line the two up. Derived from Poppins' own metrics; it is a constant
// because a per-content measurement would move the anchor depending on whether the
// first line happens to contain a capital or an ascender — far worse than a fixed
// sub-pixel-scale offset.
const TEXT_TOP_CORRECTION = 0.15;

// Does this libvips build render text at all? sharp's prebuilt binaries ship pango,
// but that is a property of the deployed binary, not of this file — so it is probed
// once and cached rather than assumed. A false answer must degrade (drawings still
// sent, caller told the writing was dropped), never throw at request time.
let textSupport = null;
async function textRenderingWorks() {
  if (textSupport !== null) return textSupport;
  try {
    if (!fs.existsSync(FONT_FILE)) throw new Error(`font file missing at ${FONT_FILE}`);
    const probe = await sharp({
      text: { text: 'Aa', font: `${FONT_FAMILY} 24`, fontfile: FONT_FILE, rgba: true, dpi: 72 },
    }).png().toBuffer();
    textSupport = probe.length > 0;
  } catch (e) {
    console.error('[chatImage] text rendering unavailable, annotations will be dropped:', e.message);
    textSupport = false;
  }
  return textSupport;
}

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function safeColor(value, fallback) {
  return HEX.test(String(value || '')) ? String(value) : fallback;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Accepts whatever the app sent and returns a spec that is safe to render, or
 * throws for the handful of things that are not a clamping question (a crop that
 * is not a crop). Exported so it can be unit-tested without sharp or a network.
 */
function normaliseEdits(raw) {
  const edits = raw && typeof raw === 'object' ? raw : {};

  // Only right angles. An arbitrary-angle rotation would need the canvas resized
  // and the annotation transform inverted, and the editor does not offer it.
  const r = Number(edits.rotate) || 0;
  const rotate = [0, 90, 180, 270].includes(((r % 360) + 360) % 360) ? ((r % 360) + 360) % 360 : 0;

  const c = edits.crop && typeof edits.crop === 'object' ? edits.crop : {};
  let cx = clamp(c.x != null ? c.x : 0, 0, 1 - LIMITS.minCropSize);
  let cy = clamp(c.y != null ? c.y : 0, 0, 1 - LIMITS.minCropSize);
  let cw = clamp(c.w != null ? c.w : 1, LIMITS.minCropSize, 1);
  let ch = clamp(c.h != null ? c.h : 1, LIMITS.minCropSize, 1);
  // Keep the rect inside the image rather than rejecting it — a rounding error at
  // the edge of a pinch gesture is not a reason to refuse someone's photo.
  if (cx + cw > 1) cw = 1 - cx;
  if (cy + ch > 1) ch = 1 - cy;

  const strokes = (Array.isArray(edits.strokes) ? edits.strokes : [])
    .slice(0, LIMITS.strokes)
    .map((s) => {
      const pts = (Array.isArray(s && s.points) ? s.points : [])
        .slice(0, LIMITS.pointsPerStroke)
        .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
        // Clamped, not dropped: a stroke drawn partly off the edge of the canvas
        // should run to the edge, which is what the person saw.
        .map((p) => ({ x: clamp(p.x, -0.5, 1.5), y: clamp(p.y, -0.5, 1.5) }));
      return {
        points: pts,
        color: safeColor(s && s.color, '#ff3b30'),
        width: clamp((s && s.width) || 0.01, LIMITS.minStrokeWidth, LIMITS.maxStrokeWidth),
      };
    })
    // A "stroke" of one point is a tap; it is still drawn (as a dot) because a tap
    // with the pen is how people put a mark on a specific house in a chart.
    .filter((s) => s.points.length >= 1);

  const texts = (Array.isArray(edits.texts) ? edits.texts : [])
    .slice(0, LIMITS.texts)
    .map((tItem) => ({
      text: String((tItem && tItem.text) || '').slice(0, LIMITS.textChars),
      x: clamp(tItem && tItem.x, 0, 1),
      y: clamp(tItem && tItem.y, 0, 1),
      size: clamp((tItem && tItem.size) || 0.06, LIMITS.minTextSize, LIMITS.maxTextSize),
      color: safeColor(tItem && tItem.color, '#ffffff'),
    }))
    .filter((tItem) => tItem.text.trim().length > 0);

  return { rotate, crop: { x: cx, y: cy, w: cw, h: ch }, strokes, texts };
}

/** `data:image/jpeg;base64,…` -> buffer. Images only — this is not the voice-note path. */
function parseImageDataUri(dataUri) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUri || ''));
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) return null;
  return { mime: m[1], buffer };
}

/**
 * One SVG holding every stroke, sized to the oriented image. Paths need no fonts,
 * so this layer is the part that can always be rendered.
 */
function buildStrokeSvg(strokes, W, H) {
  if (!strokes.length) return null;
  const paths = strokes.map((s) => {
    const pts = s.points.map((p) => `${(p.x * W).toFixed(2)},${(p.y * H).toFixed(2)}`);
    const w = Math.max(1, s.width * W);
    if (pts.length === 1) {
      const [x, y] = pts[0].split(',');
      // A single tap: a filled dot of the brush's own diameter.
      return `<circle cx="${x}" cy="${y}" r="${(w / 2).toFixed(2)}" fill="${s.color}"/>`;
    }
    const d = `M ${pts.join(' L ')}`;
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${w.toFixed(2)}"`
      + ' stroke-linecap="round" stroke-linejoin="round"/>';
  });
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + paths.join('')
    + '</svg>',
  );
}

/**
 * One text item -> a transparent PNG plus where to put it.
 *
 * Rendered as its own layer (not inside the stroke SVG) because SVG <text> depends
 * on fontconfig finding a family by NAME, while sharp's text input takes an
 * explicit `fontfile`. The second is the only one that cannot be broken by the
 * host's font configuration, which is the whole reason the .ttf is in the repo.
 */
async function renderTextLayer(item, W, H) {
  const sizePx = Math.max(8, Math.round(item.size * H));
  const left = Math.round(item.x * W);
  const top = Math.round(item.y * H + sizePx * TEXT_TOP_CORRECTION);
  // Wrap at the remaining width so a long caption folds onto the next line exactly
  // as it did in the editor, instead of running off the side of the photo.
  const wrapWidth = Math.max(sizePx * 3, W - left - Math.round(W * 0.01));

  const render = async (color) => sharp({
    text: {
      text: `<span foreground="${color}">${xmlEscape(item.text)}</span>`,
      font: `${FONT_FAMILY} ${sizePx}`,
      fontfile: FONT_FILE,
      rgba: true,
      dpi: 72,
      align: 'left',
      width: wrapWidth,
      wrap: 'word-char',
    },
  }).png().toBuffer();

  const fill = await render(item.color);
  // A drop shadow, because annotation text lands on photographs: white on a bright
  // sky and black on a dark chart are both invisible without it. The editor shows
  // the same offset via textShadow, so the preview matches.
  const shadowOffset = Math.max(1, Math.round(sizePx * 0.05));
  let shadow = null;
  try {
    shadow = await render('#000000');
  } catch (_) {
    shadow = null;
  }

  const layers = [];
  if (shadow) layers.push({ input: shadow, left: left + shadowOffset, top: top + shadowOffset });
  layers.push({ input: fill, left, top });
  return layers;
}

/**
 * Replay an edit spec onto a picked photo.
 *
 * Order is deliberate: auto-orient -> user rotation -> ANNOTATE -> crop -> downscale.
 * Annotating before the crop is what makes the normalised coordinates mean "a place
 * on the photo"; cropping afterwards clips a stroke that runs off the frame, which
 * is what the editor showed.
 *
 * Resolves `{ buffer, contentType, width, height, textDropped }`. `textDropped` is
 * true when this libvips cannot render text — the image is still produced with its
 * drawings, and the caller is expected to TELL the sender rather than quietly losing
 * their writing.
 */
async function composeChatImage({ dataUri, edits } = {}) {
  const parsed = parseImageDataUri(dataUri);
  if (!parsed) {
    const err = new Error('Expected an image/* base64 data URI');
    err.code = 'BAD_IMAGE';
    throw err;
  }
  const spec = normaliseEdits(edits);

  // Two passes rather than one chained pipeline: sharp's rotate() applies the EXIF
  // orientation only when called with no angle, and a second rotate(angle) replaces
  // the first rather than composing with it. Materialising the oriented image means
  // the dimensions the annotations are normalised against are the real ones.
  const openOpts = { failOn: 'none', limitInputPixels: LIMITS.inputPixels };
  let oriented;
  try {
    oriented = await sharp(parsed.buffer, openOpts)
      .rotate() // EXIF only
      .rotate(spec.rotate) // the user's own 90° taps
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    const err = new Error('That image could not be read');
    err.code = 'BAD_IMAGE';
    throw err;
  }

  const W = oriented.info.width;
  const H = oriented.info.height;

  const composites = [];
  const strokeSvg = buildStrokeSvg(spec.strokes, W, H);
  if (strokeSvg) composites.push({ input: strokeSvg, left: 0, top: 0 });

  let textDropped = false;
  if (spec.texts.length) {
    if (await textRenderingWorks()) {
      for (const item of spec.texts) {
        try {
          /* eslint-disable no-await-in-loop */
          const layers = await renderTextLayer(item, W, H);
          /* eslint-enable no-await-in-loop */
          composites.push(...layers);
        } catch (e) {
          console.error('[chatImage] one text layer failed:', e.message);
          textDropped = true;
        }
      }
    } else {
      textDropped = true;
    }
  }

  // Pixel crop, clamped so rounding can never ask sharp for a region one pixel
  // outside the image (which is a hard error, not a warning).
  const cropLeft = Math.min(W - 1, Math.max(0, Math.round(spec.crop.x * W)));
  const cropTop = Math.min(H - 1, Math.max(0, Math.round(spec.crop.y * H)));
  const cropW = Math.max(1, Math.min(W - cropLeft, Math.round(spec.crop.w * W)));
  const cropH = Math.max(1, Math.min(H - cropTop, Math.round(spec.crop.h * H)));

  // ANNOTATE AND CROP IN SEPARATE PASSES. sharp applies a pipeline in a FIXED
  // internal order — rotate, extract, resize, composite — NOT in the order the
  // methods were called. Chaining .composite() before .extract() therefore still
  // crops first and then tries to lay a full-size overlay over the smaller crop,
  // which fails outright with "Image to composite must have same dimensions or
  // smaller" (caught by scripts/testChatImageComposer.js, and on a full-frame crop
  // it would instead have silently resized the annotations). Materialising the
  // annotated image makes the order explicit and immune to that.
  let annotated = oriented.data;
  if (composites.length) {
    annotated = await sharp(oriented.data, openOpts).composite(composites).toBuffer();
  }

  const pipeline = sharp(annotated, openOpts)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize({
      width: MAX_OUTPUT_EDGE,
      height: MAX_OUTPUT_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    // A transparent PNG would otherwise go black when flattened into JPEG.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

  const out = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    contentType: 'image/jpeg',
    width: out.info.width,
    height: out.info.height,
    textDropped,
  };
}

module.exports = {
  composeChatImage,
  normaliseEdits,
  parseImageDataUri,
  buildStrokeSvg,
  textRenderingWorks,
  LIMITS,
  MAX_OUTPUT_EDGE,
  TEXT_TOP_CORRECTION,
  FONT_FILE,
};
