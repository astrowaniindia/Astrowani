// ─────────────────────────────────────────────────────────────────────────────
// Chat image composer checks. No network, no database, no index.js — sharp only.
//
//   node scripts/testChatImageComposer.js
//
// The assertions that matter here are the POSITIVE ones: that a stroke actually
// lands where the spec put it, and that the crop really does cut away what it says
// it cuts away. "It didn't crash" proves nothing about an image pipeline — the
// failure mode this is guarding against is a picture that is produced successfully
// and is simply wrong (annotation in the wrong corner, the crop ignored, the
// writing missing), which no exception would ever reveal.
// ─────────────────────────────────────────────────────────────────────────────
const sharp = require('sharp');
const {
  composeChatImage,
  normaliseEdits,
  parseImageDataUri,
  buildStrokeSvg,
  textRenderingWorks,
  LIMITS,
} = require('../src/chatImageComposer');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

/** A plain white JPEG of a known size, as a data URI. */
async function whiteJpeg(w, h) {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** A four-quadrant image, so a crop can be checked by WHICH COLOUR survives. */
async function quadrantJpeg(w, h) {
  const half = Math.round(w / 2);
  const halfH = Math.round(h / 2);
  const block = (color) => sharp({ create: { width: half, height: halfH, channels: 3, background: color } }).png().toBuffer();
  const [tl, tr, bl, br] = await Promise.all([block('#ff0000'), block('#00ff00'), block('#0000ff'), block('#ffff00')]);
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: '#000000' } })
    .composite([
      { input: tl, left: 0, top: 0 },
      { input: tr, left: half, top: 0 },
      { input: bl, left: 0, top: halfH },
      { input: br, left: half, top: halfH },
    ])
    .jpeg({ quality: 100 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** Average colour of a fractional region, so assertions read in spec coordinates. */
async function regionMean(buffer, fx, fy, fw, fh) {
  const meta = await sharp(buffer).metadata();
  const left = Math.round(fx * meta.width);
  const top = Math.round(fy * meta.height);
  const width = Math.max(1, Math.round(fw * meta.width));
  const height = Math.max(1, Math.round(fh * meta.height));
  // Materialised to a buffer BEFORE stats(): sharp's stats() reads the input image
  // and ignores pipeline operations, so stats() chained after extract() silently
  // reports the mean of the WHOLE image — which looked like three failing geometry
  // assertions until the region was cut out for real.
  const region = await sharp(buffer)
    .extract({ left, top, width: Math.min(width, meta.width - left), height: Math.min(height, meta.height - top) })
    .toBuffer();
  const { channels } = await sharp(region).stats();
  return { r: channels[0].mean, g: channels[1].mean, b: channels[2].mean };
}

/** How many pixels in the whole image are close to `rgb`. */
async function countNear(buffer, [tr, tg, tb], tol = 60) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.abs(data[i] - tr) < tol && Math.abs(data[i + 1] - tg) < tol && Math.abs(data[i + 2] - tb) < tol) n += 1;
  }
  return n;
}

(async () => {
  console.log('\n── spec normalisation (pure) ─────────────────────────────────');
  {
    const n = normaliseEdits(undefined);
    eq('missing spec -> full frame, no rotation', `${n.rotate}|${n.crop.x},${n.crop.y},${n.crop.w},${n.crop.h}`, '0|0,0,1,1');
    eq('missing spec -> no strokes', n.strokes.length, 0);
    eq('missing spec -> no texts', n.texts.length, 0);
  }
  {
    eq('rotate 90 kept', normaliseEdits({ rotate: 90 }).rotate, 90);
    eq('rotate -90 normalised to 270', normaliseEdits({ rotate: -90 }).rotate, 270);
    eq('rotate 450 normalised to 90', normaliseEdits({ rotate: 450 }).rotate, 90);
    eq('rotate 37 (not a right angle) rejected to 0', normaliseEdits({ rotate: 37 }).rotate, 0);
    eq('rotate "banana" rejected to 0', normaliseEdits({ rotate: 'banana' }).rotate, 0);
  }
  {
    const n = normaliseEdits({ crop: { x: 0.8, y: 0.9, w: 0.9, h: 0.9 } });
    ok('crop running past the edge is pulled inside, not rejected',
      n.crop.x + n.crop.w <= 1.0000001 && n.crop.y + n.crop.h <= 1.0000001,
      JSON.stringify(n.crop));
  }
  {
    const n = normaliseEdits({ crop: { x: -5, y: -5, w: 0.0001, h: 99 } });
    ok('absurd crop clamped to the legal range',
      n.crop.x === 0 && n.crop.y === 0 && n.crop.w >= LIMITS.minCropSize && n.crop.h <= 1,
      JSON.stringify(n.crop));
  }
  {
    // THE INJECTION GUARD. Both of these end up inside a markup string.
    const n = normaliseEdits({
      strokes: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '"/><script>x</script>', width: 0.01 }],
      texts: [{ text: '<b>bold</b> & "quoted"', x: 0.1, y: 0.1, size: 0.05, color: 'red; url(#x)' }],
    });
    eq('a non-hex stroke colour falls back to the default', n.strokes[0].color, '#ff3b30');
    eq('a non-hex text colour falls back to the default', n.texts[0].color, '#ffffff');
    const svg = buildStrokeSvg(n.strokes, 100, 100).toString();
    ok('no script tag survives into the stroke SVG', !svg.includes('<script'), svg.slice(0, 120));
  }
  {
    const n = normaliseEdits({ strokes: [{ points: [{ x: 0.5, y: 0.5 }], color: '#00ff00', width: 0.02 }] });
    eq('a single-point stroke (a tap) is kept', n.strokes.length, 1);
    const svg = buildStrokeSvg(n.strokes, 200, 200).toString();
    ok('a tap renders as a dot', svg.includes('<circle'), svg);
  }
  {
    const n = normaliseEdits({ strokes: [{ points: [], color: '#00ff00' }, { points: null }] });
    eq('an empty stroke is dropped', n.strokes.length, 0);
  }
  {
    const n = normaliseEdits({ texts: [{ text: '   ', x: 0.1, y: 0.1 }, { text: 'real', x: 0.1, y: 0.1 }] });
    eq('whitespace-only text is dropped, real text kept', n.texts.length, 1);
    eq('…and it is the real one', n.texts[0].text, 'real');
  }
  {
    const many = Array.from({ length: LIMITS.strokes + 50 }, () => ({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
    eq('stroke count capped', normaliseEdits({ strokes: many }).strokes.length, LIMITS.strokes);
    const longStroke = [{ points: Array.from({ length: LIMITS.pointsPerStroke + 500 }, (_, i) => ({ x: i / 2000, y: 0.5 })) }];
    eq('points per stroke capped', normaliseEdits({ strokes: longStroke }).strokes[0].points.length, LIMITS.pointsPerStroke);
    const longText = [{ text: 'x'.repeat(LIMITS.textChars + 100), x: 0.1, y: 0.1 }];
    eq('text length capped', normaliseEdits({ texts: longText }).texts[0].text.length, LIMITS.textChars);
  }
  {
    eq('an audio data URI is refused', parseImageDataUri('data:audio/mp4;base64,AAAA'), null);
    eq('a bare URL is refused', parseImageDataUri('https://example.com/a.jpg'), null);
    eq('garbage is refused', parseImageDataUri('not a uri'), null);
    ok('an image data URI parses', !!parseImageDataUri('data:image/png;base64,iVBORw0KGgo='));
  }

  console.log('\n── geometry: does the crop actually crop? ────────────────────');
  {
    const src = await quadrantJpeg(800, 800);
    // POSITIVE CONTROL FIRST: with no crop, all four quadrant colours are present.
    const full = await composeChatImage({ dataUri: src, edits: {} });
    const tl = await regionMean(full.buffer, 0.1, 0.1, 0.2, 0.2);
    const br = await regionMean(full.buffer, 0.7, 0.7, 0.2, 0.2);
    ok('uncropped: top-left is still red', tl.r > 200 && tl.g < 60, JSON.stringify(tl));
    ok('uncropped: bottom-right is still yellow', br.r > 200 && br.g > 200 && br.b < 60, JSON.stringify(br));

    // Now crop to the top-right quadrant only. Green must fill the frame and red
    // must be gone — the exact thing a silently-ignored crop would not do.
    const cropped = await composeChatImage({ dataUri: src, edits: { crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } } });
    const mid = await regionMean(cropped.buffer, 0.3, 0.3, 0.4, 0.4);
    ok('cropped to the green quadrant: the frame is green', mid.g > 200 && mid.r < 60, JSON.stringify(mid));
    const redLeft = await countNear(cropped.buffer, [255, 0, 0]);
    ok('cropped: the red quadrant is gone', redLeft < 500, `${redLeft} red-ish px left`);
    eq('cropped output is square-ish (400x400 of an 800x800 source)', `${cropped.width}x${cropped.height}`, '400x400');
  }
  {
    const src = await whiteJpeg(1200, 600);
    const out = await composeChatImage({ dataUri: src, edits: { rotate: 90 } });
    eq('a 90° rotation swaps the output dimensions', `${out.width}x${out.height}`, '600x1200');
  }
  {
    const src = await whiteJpeg(4000, 3000);
    const out = await composeChatImage({ dataUri: src, edits: {} });
    ok('a large photo is downscaled to the 1600px ceiling', out.width === 1600 && out.height === 1200, `${out.width}x${out.height}`);
  }
  {
    const src = await whiteJpeg(300, 200);
    const out = await composeChatImage({ dataUri: src, edits: {} });
    eq('a small photo is NOT enlarged', `${out.width}x${out.height}`, '300x200');
  }

  console.log('\n── drawing: does a stroke land where it was drawn? ───────────');
  {
    const src = await whiteJpeg(1000, 1000);
    // A thick horizontal line across the TOP FIFTH only.
    const out = await composeChatImage({
      dataUri: src,
      edits: { strokes: [{ points: [{ x: 0.05, y: 0.1 }, { x: 0.95, y: 0.1 }], color: '#ff0000', width: 0.04 }] },
    });
    const onLine = await regionMean(out.buffer, 0.3, 0.085, 0.4, 0.03);
    const below = await regionMean(out.buffer, 0.3, 0.6, 0.4, 0.2);
    ok('the pixels where the stroke was drawn are red', onLine.r > 150 && onLine.g < 120, JSON.stringify(onLine));
    ok('the rest of the photo is untouched white', below.r > 245 && below.g > 245 && below.b > 245, JSON.stringify(below));
  }
  {
    // Annotations are anchored to the PHOTO, not the crop frame: a stroke drawn in
    // the top-left must disappear when the crop keeps only the bottom-right.
    const src = await whiteJpeg(1000, 1000);
    const strokes = [{ points: [{ x: 0.05, y: 0.05 }, { x: 0.25, y: 0.25 }], color: '#ff0000', width: 0.03 }];
    const kept = await composeChatImage({ dataUri: src, edits: { strokes, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } } });
    const cut = await composeChatImage({ dataUri: src, edits: { strokes, crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } } });
    const keptRed = await countNear(kept.buffer, [255, 0, 0]);
    const cutRed = await countNear(cut.buffer, [255, 0, 0]);
    ok('a stroke inside the crop survives it', keptRed > 1000, `${keptRed} red px`);
    ok('a stroke outside the crop is cut away', cutRed < 200, `${cutRed} red px`);
  }
  {
    // Coordinates are normalised against the ORIENTED image — the canvas the editor
    // was showing when the stroke was drawn, i.e. AFTER the user's 90° taps. So a
    // line drawn across the top of the rotated (portrait) canvas must come back
    // across the top of the portrait output, NOT rotated along with the photo. If
    // the composer annotated before rotating instead, this stroke would land down
    // one side and this is the assertion that would catch it.
    const src = await whiteJpeg(1000, 500);
    const strokes = [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], color: '#ff0000', width: 0.05 }];
    const out = await composeChatImage({ dataUri: src, edits: { rotate: 90, strokes } });
    eq('rotated canvas', `${out.width}x${out.height}`, '500x1000');
    const onLine = await regionMean(out.buffer, 0.3, 0.09, 0.4, 0.02);
    const sideStrip = await regionMean(out.buffer, 0, 0.4, 0.2, 0.3);
    ok('the stroke sits across the top of the ROTATED canvas, where it was drawn',
      onLine.r > 150 && onLine.g < 150, JSON.stringify(onLine));
    ok('…and nowhere down the side (which is where a pre-rotation anchor would put it)',
      sideStrip.r > 245 && sideStrip.g > 245, JSON.stringify(sideStrip));
  }

  console.log('\n── writing: text, Hindi text, and the drop path ─────────────');
  const canRenderText = await textRenderingWorks();
  ok('this libvips can render text (otherwise annotations degrade, see textDropped)', canRenderText);
  if (canRenderText) {
    {
      const src = await whiteJpeg(1000, 1000);
      const plain = await composeChatImage({ dataUri: src, edits: {} });
      const withText = await composeChatImage({
        dataUri: src,
        edits: { texts: [{ text: 'Namaste', x: 0.1, y: 0.4, size: 0.1, color: '#0000ff' }] },
      });
      // Compared against a positive control: ink appears only when text was asked for.
      const plainInk = await countNear(plain.buffer, [0, 0, 255], 80);
      const textInk = await countNear(withText.buffer, [0, 0, 255], 80);
      ok('no blue ink on the un-annotated control', plainInk < 100, `${plainInk} px`);
      ok('text is actually drawn', textInk > 500, `${textInk} px`);
      eq('text did not get dropped', withText.textDropped, false);
    }
    {
      const src = await whiteJpeg(1000, 1000);
      const out = await composeChatImage({
        dataUri: src,
        edits: { texts: [{ text: 'नमस्ते कुंडली', x: 0.1, y: 0.4, size: 0.1, color: '#0000ff' }] },
      });
      const ink = await countNear(out.buffer, [0, 0, 255], 80);
      // The reason the font is bundled rather than taken from the host: Hindi must
      // render to real glyphs, not tofu boxes and not nothing.
      ok('Devanagari text renders to real glyphs', ink > 500, `${ink} px`);
    }
    {
      // Vertical placement: the same string low down must put its ink low down.
      const src = await whiteJpeg(1000, 1000);
      const out = await composeChatImage({
        dataUri: src,
        edits: { texts: [{ text: 'LOW', x: 0.1, y: 0.8, size: 0.1, color: '#0000ff' }] },
      });
      // Counted, not averaged: a caption's ink is a small share of any band it sits
      // in, so a mean over the band is diluted to within a point or two of the
      // background and cannot tell "low down" from "nowhere".
      const { data, info } = await sharp(out.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let upper = 0;
      let lower = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const i = (y * info.width + x) * info.channels;
          if (data[i + 2] > 120 && data[i] < 120) {
            if (y < info.height / 2) upper += 1; else lower += 1;
          }
        }
      }
      ok('text placed at y=0.8 inks the lower half only', lower > 300 && upper === 0, `upper=${upper} lower=${lower}`);
    }
    {
      // A shadow is what makes white text readable on a bright photo. White text on
      // white must therefore still leave dark ink behind.
      const src = await whiteJpeg(800, 800);
      const out = await composeChatImage({
        dataUri: src,
        edits: { texts: [{ text: 'WHITE', x: 0.1, y: 0.4, size: 0.12, color: '#ffffff' }] },
      });
      const dark = await countNear(out.buffer, [0, 0, 0], 70);
      ok('white text still carries a dark shadow', dark > 200, `${dark} dark px`);
    }
  }

  console.log('\n── bad input ────────────────────────────────────────────────');
  {
    let code = null;
    try { await composeChatImage({ dataUri: 'data:text/plain;base64,aGk=' }); } catch (e) { code = e.code; }
    eq('a non-image data URI is refused with BAD_IMAGE', code, 'BAD_IMAGE');
  }
  {
    let code = null;
    try { await composeChatImage({ dataUri: 'data:image/jpeg;base64,bm90YW5pbWFnZQ==' }); } catch (e) { code = e.code; }
    eq('bytes that are not really an image are refused with BAD_IMAGE', code, 'BAD_IMAGE');
  }
  {
    let code = null;
    try { await composeChatImage({}); } catch (e) { code = e.code; }
    eq('a missing image is refused', code, 'BAD_IMAGE');
  }
  {
    // Everything at once, as a last check that the layers do not fight each other.
    const src = await quadrantJpeg(1600, 1200);
    const out = await composeChatImage({
      dataUri: src,
      edits: {
        rotate: 180,
        crop: { x: 0.1, y: 0.1, w: 0.7, h: 0.7 },
        strokes: [
          { points: Array.from({ length: 200 }, (_, i) => ({ x: 0.2 + i / 500, y: 0.3 + Math.sin(i / 20) / 20 })), color: '#ff00ff', width: 0.012 },
          { points: [{ x: 0.5, y: 0.5 }], color: '#000000', width: 0.03 },
        ],
        texts: [
          { text: 'Rahu in 7th राहु', x: 0.15, y: 0.2, size: 0.05, color: '#ffffff' },
          { text: 'remedy: Tuesday', x: 0.15, y: 0.7, size: 0.04, color: '#ffff00' },
        ],
      },
    });
    ok('crop + rotate + strokes + text together produce a real JPEG',
      out.buffer.length > 2000 && out.contentType === 'image/jpeg', `${out.buffer.length} bytes`);
    const magenta = await countNear(out.buffer, [255, 0, 255], 70);
    ok('…and the drawn line is in it', magenta > 300, `${magenta} px`);
    const meta = await sharp(out.buffer).metadata();
    ok('…with no EXIF carried over from the original', !meta.exif, 'exif present');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nHARNESS CRASHED:', e);
  process.exit(1);
});
