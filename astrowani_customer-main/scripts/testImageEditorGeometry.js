#!/usr/bin/env node
/**
 * The image editor's arithmetic, checked under plain Node.
 *
 *   node scripts/testImageEditorGeometry.js
 *
 * This is where a photo would come out cropped to the wrong part of itself, or a
 * stroke would land an inch from where the finger was, or "1:1" would quietly
 * produce a rectangle. None of that needs a phone to detect, and none of it throws
 * an error when it is wrong — it just sends a slightly wrong picture, which is the
 * kind of defect that survives manual testing.
 *
 * The file under test is shared verbatim with the astrologer app, so one run
 * covers both. Normalisation convention: 0..1 against the ORIENTED photo (after
 * the user's 90° taps, before the crop) — identical to what
 * astrowani-backend/src/chatImageComposer.js reads.
 */
const g = require('../src/components/chatImage/imageEditorGeometry');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); } else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function near(name, a, b, tol = 1e-6) {
  ok(name, Math.abs(a - b) <= tol, `got ${a}, expected ${b}`);
}
function eq(name, a, b) { ok(name, a === b, `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }

console.log('\n── oriented size ────────────────────────────────────────────');
{
  eq('no rotation keeps the shape', JSON.stringify(g.orientedSize(1000, 500, 0)), JSON.stringify({ w: 1000, h: 500 }));
  eq('180° keeps the shape', JSON.stringify(g.orientedSize(1000, 500, 180)), JSON.stringify({ w: 1000, h: 500 }));
  eq('90° swaps it', JSON.stringify(g.orientedSize(1000, 500, 90)), JSON.stringify({ w: 500, h: 1000 }));
  eq('270° swaps it', JSON.stringify(g.orientedSize(1000, 500, 270)), JSON.stringify({ w: 500, h: 1000 }));
}

console.log('\n── fitInside ────────────────────────────────────────────────');
{
  const a = g.fitInside(2, 400, 400);
  ok('a wide photo in a square box is limited by width', a.w === 400 && a.h === 200, JSON.stringify(a));
  const b = g.fitInside(0.5, 400, 400);
  ok('a tall photo in a square box is limited by height', b.h === 400 && b.w === 200, JSON.stringify(b));
  const c = g.fitInside(1, 300, 500);
  ok('a square photo in a tall box touches the sides', c.w === 300 && c.h === 300, JSON.stringify(c));
  eq('a zero box does not produce NaN', JSON.stringify(g.fitInside(1, 0, 0)), JSON.stringify({ w: 0, h: 0 }));
}

console.log('\n── rotation carries the annotations round ───────────────────');
{
  // Clockwise: the top-left corner of the photo becomes its top-right.
  const tl = g.rotatePoint90({ x: 0, y: 0 });
  ok('top-left -> top-right', Math.abs(tl.x - 1) < 1e-9 && Math.abs(tl.y) < 1e-9, JSON.stringify(tl));
  const tr = g.rotatePoint90({ x: 1, y: 0 });
  ok('top-right -> bottom-right', Math.abs(tr.x - 1) < 1e-9 && Math.abs(tr.y - 1) < 1e-9, JSON.stringify(tr));
  const br = g.rotatePoint90({ x: 1, y: 1 });
  ok('bottom-right -> bottom-left', Math.abs(br.x) < 1e-9 && Math.abs(br.y - 1) < 1e-9, JSON.stringify(br));
  const c = g.rotatePoint90({ x: 0.5, y: 0.5 });
  ok('the centre stays the centre', Math.abs(c.x - 0.5) < 1e-9 && Math.abs(c.y - 0.5) < 1e-9, JSON.stringify(c));
}
{
  // Four turns must be the identity. If the mapping were subtly wrong, this is
  // where the drift shows up rather than in any single turn.
  let p = { x: 0.23, y: 0.71 };
  for (let i = 0; i < 4; i += 1) p = g.rotatePoint90(p);
  near('four quarter turns return a point exactly where it started (x)', p.x, 0.23, 1e-9);
  near('…and (y)', p.y, 0.71, 1e-9);
}
{
  const start = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  let r = { ...start };
  for (let i = 0; i < 4; i += 1) r = g.rotateRect90(r);
  // Compared with a tolerance, not for equality: `1 - (y + h)` applied four times
  // accumulates about 1e-16 of ordinary double-precision error. The point of the
  // check is that the mapping is its own inverse after four turns, not that IEEE
  //754 is exact.
  ok('four turns return a RECT to where it started',
    Math.abs(r.x - start.x) < 1e-12 && Math.abs(r.y - start.y) < 1e-12
    && Math.abs(r.w - start.w) < 1e-12 && Math.abs(r.h - start.h) < 1e-12, JSON.stringify(r));
}
{
  const r = g.rotateRect90({ x: 0, y: 0, w: 0.5, h: 1 });
  // The left half of a photo becomes its top half.
  ok('the left half becomes the top half',
    Math.abs(r.x) < 1e-9 && Math.abs(r.y) < 1e-9 && Math.abs(r.w - 1) < 1e-9 && Math.abs(r.h - 0.5) < 1e-9,
    JSON.stringify(r));
}
{
  // Brush width is a fraction of the WIDTH and font size a fraction of the HEIGHT,
  // so a turn that swaps those sides has to rescale both or a line visibly changes
  // thickness as the photo is straightened.
  const before = {
    crop: { x: 0, y: 0, w: 1, h: 1 },
    strokes: [{ points: [{ x: 0.5, y: 0.5 }], width: 0.02, color: '#fff' }],
    texts: [{ x: 0.5, y: 0.5, size: 0.1, text: 'hi', color: '#fff' }],
  };
  const W = 1000;
  const H = 500;
  const after = g.rotateEditsClockwise(before, W, H);
  // Absolute thickness in pixels must not change: 0.02*1000 = 20px, and after the
  // turn the width base is 500, so the fraction must be 20/500 = 0.04.
  near('a brush keeps its real thickness through a turn', after.strokes[0].width * H, before.strokes[0].width * W, 1e-6);
  near('…which means the fraction doubled on a 2:1 photo', after.strokes[0].width, 0.04, 1e-9);
  near('a caption keeps its real size through a turn', after.texts[0].size * W, before.texts[0].size * H, 1e-6);
}

console.log('\n── crop presets ─────────────────────────────────────────────');
{
  // THE ONE THAT MATTERS: a square crop of a non-square photo is NOT w === h in
  // normalised units. Forgetting to divide by the photo's own aspect is what makes
  // "1:1" come out rectangular.
  const c = g.cropForAspect(1, 1000, 500);
  near('a 1:1 crop of a 2:1 photo takes half the width', c.w, 0.5);
  near('…and all of the height', c.h, 1);
  const outW = c.w * 1000;
  const outH = c.h * 500;
  near('…so the OUTPUT really is square', outW / outH, 1);
  ok('…and it is centred', Math.abs(c.x - 0.25) < 1e-9, JSON.stringify(c));
}
{
  const c = g.cropForAspect(1, 500, 1000);
  near('a 1:1 crop of a tall photo takes all the width', c.w, 1);
  near('…and half the height', c.h, 0.5);
  near('…output square', (c.w * 500) / (c.h * 1000), 1);
}
{
  const c = g.cropForAspect(16 / 9, 1000, 1000);
  near('a 16:9 crop of a square photo is 16:9 in output pixels', (c.w * 1000) / (c.h * 1000), 16 / 9, 1e-9);
  ok('…and stays inside the photo', c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.000001 && c.y + c.h <= 1.000001, JSON.stringify(c));
}
{
  const c = g.cropForAspect(4 / 5, 900, 1600);
  near('a 4:5 crop of a 9:16 photo is 4:5 in output pixels', (c.w * 900) / (c.h * 1600), 4 / 5, 1e-9);
}
eq('"Free" means the whole photo', JSON.stringify(g.cropForAspect(null, 800, 600)), JSON.stringify({ x: 0, y: 0, w: 1, h: 1 }));

console.log('\n── dragging the crop ────────────────────────────────────────');
{
  const full = { x: 0, y: 0, w: 1, h: 1 };
  const r = g.applyCropDrag(full, 'tl', 0.2, 0.3, null, 1000, 1000);
  ok('dragging the top-left corner in moves that corner only',
    Math.abs(r.x - 0.2) < 1e-9 && Math.abs(r.y - 0.3) < 1e-9
    && Math.abs(r.x + r.w - 1) < 1e-9 && Math.abs(r.y + r.h - 1) < 1e-9, JSON.stringify(r));
}
{
  const r = g.applyCropDrag({ x: 0, y: 0, w: 1, h: 1 }, 'tl', -0.5, -0.5, null, 1000, 1000);
  ok('dragging a corner off the edge of the photo stops at the edge', r.x === 0 && r.y === 0, JSON.stringify(r));
}
{
  const r = g.applyCropDrag({ x: 0, y: 0, w: 1, h: 1 }, 'tl', 0.99, 0.99, null, 1000, 1000);
  ok('a corner cannot be dragged past the opposite one',
    r.w >= g.MIN_CROP - 1e-9 && r.h >= g.MIN_CROP - 1e-9, JSON.stringify(r));
}
{
  const r = g.applyCropDrag({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'move', 0.1, -0.05, null, 1000, 1000);
  ok('the frame slides without changing size',
    Math.abs(r.w - 0.5) < 1e-9 && Math.abs(r.h - 0.5) < 1e-9
    && Math.abs(r.x - 0.3) < 1e-9 && Math.abs(r.y - 0.15) < 1e-9, JSON.stringify(r));
}
{
  const r = g.applyCropDrag({ x: 0.6, y: 0.6, w: 0.4, h: 0.4 }, 'move', 0.5, 0.5, null, 1000, 1000);
  ok('sliding into the corner stops rather than shrinking',
    Math.abs(r.w - 0.4) < 1e-9 && Math.abs(r.h - 0.4) < 1e-9
    && Math.abs(r.x - 0.6) < 1e-9 && Math.abs(r.y - 0.6) < 1e-9, JSON.stringify(r));
}
{
  // A locked ratio must stay locked while being dragged, on a non-square photo —
  // the case where the normalised numbers and the visible shape disagree.
  const start = g.cropForAspect(1, 1600, 900);
  const r = g.applyCropDrag(start, 'br', -0.2, 0, 1, 1600, 900);
  near('a square lock stays square after a drag', (r.w * 1600) / (r.h * 900), 1, 1e-6);
  ok('…and got smaller, not bigger', r.w < start.w, `${r.w} vs ${start.w}`);
  ok('…and stayed inside the photo', r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1.000001 && r.y + r.h <= 1.000001, JSON.stringify(r));
}
{
  // Many small drags in a row must not let a locked ratio creep.
  let r = g.cropForAspect(4 / 5, 1200, 900);
  for (let i = 0; i < 25; i += 1) r = g.applyCropDrag(r, 'br', -0.01, 0.004, 4 / 5, 1200, 900);
  near('a ratio lock does not drift over 25 drags', (r.w * 1200) / (r.h * 900), 4 / 5, 1e-6);
  ok('…and never escapes the photo', r.x + r.w <= 1.000001 && r.y + r.h <= 1.000001 && r.w >= g.MIN_CROP, JSON.stringify(r));
}
{
  // Fuzz: no sequence of drags may ever produce a crop that is off the photo, or
  // NaN. A NaN here renders an invisible frame and sends a 400 from the server.
  let bad = null;
  let r = { x: 0, y: 0, w: 1, h: 1 };
  const handles = ['tl', 'tr', 'bl', 'br', 'move'];
  const ratios = [null, 1, 4 / 5, 16 / 9];
  for (let i = 0; i < 4000; i += 1) {
    const h = handles[i % handles.length];
    const ra = ratios[i % ratios.length];
    r = g.applyCropDrag(r, h, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, ra, 1234, 777);
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)
      || r.x < -1e-6 || r.y < -1e-6 || r.x + r.w > 1 + 1e-6 || r.y + r.h > 1 + 1e-6
      || r.w < g.MIN_CROP - 1e-6 || r.h < g.MIN_CROP - 1e-6) { bad = { i, h, ra, r }; break; }
  }
  ok('4000 random drags never leave the photo, go inside-out or produce NaN', !bad, JSON.stringify(bad));
}

console.log('\n── canvas <-> photo coordinates ─────────────────────────────');
{
  const crop = { x: 0.25, y: 0.1, w: 0.5, h: 0.4 };
  const box = { w: 300, h: 200, left: 0, top: 0 };
  const topLeft = g.canvasToOriented(0, 0, crop, box);
  ok('the top-left of the window is the top-left of the crop',
    Math.abs(topLeft.x - 0.25) < 1e-9 && Math.abs(topLeft.y - 0.1) < 1e-9, JSON.stringify(topLeft));
  const bottomRight = g.canvasToOriented(300, 200, crop, box);
  ok('the bottom-right of the window is the bottom-right of the crop',
    Math.abs(bottomRight.x - 0.75) < 1e-9 && Math.abs(bottomRight.y - 0.5) < 1e-9, JSON.stringify(bottomRight));
}
{
  // The round trip is what guarantees a stroke appears under the finger that drew
  // it: the touch is converted one way to be stored and the other way to be drawn.
  const crop = { x: 0.13, y: 0.41, w: 0.6, h: 0.22 };
  const box = { w: 412, h: 333, left: 0, top: 0 };
  let worst = 0;
  for (let i = 0; i < 500; i += 1) {
    const px = Math.random() * box.w;
    const py = Math.random() * box.h;
    const o = g.canvasToOriented(px, py, crop, box);
    const back = g.orientedToCanvas(o.x, o.y, crop, box);
    worst = Math.max(worst, Math.abs(back.x - px), Math.abs(back.y - py));
  }
  ok('canvas -> photo -> canvas returns the same pixel', worst < 1e-6, `worst drift ${worst}`);
}
{
  const orientedW = 2000;
  const orientedH = 1000;
  const crop = { x: 0.5, y: 0, w: 0.5, h: 1 };
  const box = { w: 300, h: 300, left: 0, top: 0 };
  const p = g.annotateImagePlacement(orientedW, orientedH, crop, box);
  near('the photo is scaled so the crop fills the window', p.width * crop.w, box.w, 1e-6);
  near('…and slid so the crop starts at the left edge', p.left, -300, 1e-6);
  near('…with no vertical offset for a crop that starts at the top', p.top, 0);
}

console.log('\n── point thinning ───────────────────────────────────────────');
{
  const box = { w: 400, h: 400 };
  ok('the first point is always kept', g.shouldKeepPoint(null, { x: 0.5, y: 0.5 }, box));
  ok('a point a pixel away is dropped', !g.shouldKeepPoint({ x: 0.5, y: 0.5 }, { x: 0.5025, y: 0.5 }, box));
  ok('a point well clear is kept', g.shouldKeepPoint({ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.5 }, box));
  // A slow, deliberate finger must still draw: thinning that is too aggressive
  // turns a careful circle into a polygon.
  let kept = 0;
  let prev = null;
  for (let i = 0; i < 200; i += 1) {
    const p = { x: 0.2 + (i * 0.6) / 200, y: 0.5 };
    if (g.shouldKeepPoint(prev, p, box)) { kept += 1; prev = p; }
  }
  ok('a 240px line across the photo keeps enough points to look smooth', kept >= 50 && kept <= 70, `${kept} kept`);
}

console.log('\n── the payload sent to the server ───────────────────────────');
{
  const spec = g.buildEditSpec({
    rotate: 90,
    crop: { x: 0.123456789, y: 0.2, w: 0.5, h: 0.5 },
    strokes: [{ id: 's1', color: '#ff0000', width: 0.0123456789, points: [{ x: 0.111111111, y: 0.2 }] }],
    texts: [{ id: 't1', text: 'hello', x: 0.1, y: 0.2, size: 0.05, color: '#ffffff' }],
  });
  eq('rotation is carried', spec.rotate, 90);
  eq('coordinates are rounded to 6 places', spec.crop.x, 0.123457);
  ok('the internal stroke id is NOT sent', !('id' in spec.strokes[0]), JSON.stringify(spec.strokes[0]));
  ok('the internal text id is NOT sent', !('id' in spec.texts[0]), JSON.stringify(spec.texts[0]));
  eq('the text itself survives', spec.texts[0].text, 'hello');
}
{
  const spec = g.buildEditSpec({
    rotate: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    strokes: [],
    texts: [{ id: 'a', text: '   ', x: 0, y: 0, size: 0.05, color: '#fff' }, { id: 'b', text: 'real', x: 0, y: 0, size: 0.05, color: '#fff' }],
  });
  eq('an empty caption is not sent', spec.texts.length, 1);
  eq('…the real one is', spec.texts[0].text, 'real');
}
{
  const clean = { rotate: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, strokes: [], texts: [] };
  eq('an untouched photo reports no edits', g.hasEdits(clean), false);
  eq('a rotation counts', g.hasEdits({ ...clean, rotate: 90 }), true);
  eq('a crop counts', g.hasEdits({ ...clean, crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }), true);
  eq('a stroke counts', g.hasEdits({ ...clean, strokes: [{ points: [] }] }), true);
  eq('a caption counts', g.hasEdits({ ...clean, texts: [{ text: 'x' }] }), true);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
