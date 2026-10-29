import { api, ApiError } from './api.js?v=48';
import { toast } from './ui.js?v=48';
import {
  ASPECTS,
  BRUSHES,
  PALETTE,
  TEXT_SIZES,
  annotateImagePlacement,
  annotateStageBox,
  applyCropDrag,
  buildEditSpec,
  canvasToOriented,
  cropForAspect,
  cropStageBox,
  orientedSize,
  orientedToCanvas,
  rotateEditsClockwise,
  shouldKeepPoint,
} from './chat-image-geometry.js?v=48';

/**
 * Attaching a photo to a website chat — pick, crop, draw, write, send.
 *
 * THE SAME FEATURE AS THE APPS, AND DELIBERATELY THE SAME MECHANISM. The editor
 * produces a normalised edit spec and POSTs it with the original photo to
 * /api/chat/image; the backend replays the crop, the rotation, the strokes and
 * the captions with sharp (astrowani-backend/src/chatImageComposer.js) and stores
 * one flattened JPEG. The arithmetic in chat-image-geometry.js is generated from
 * the apps' own unit-tested copy (aw/sync-chat-image-geometry.js), so a photo
 * cropped here comes out exactly as it would from a phone.
 *
 * Compositing on the canvas here instead would have been easy — the browser has
 * one — and it is still the wrong call: it would be a SECOND implementation of
 * the same edits, free to disagree with the phones about the thing the customer
 * and the astrologer are both looking at, and it would hand the server a photo it
 * had no part in building. The canvas is used for the PREVIEW only.
 *
 * COORDINATES: 0..1 against the ORIENTED photo (after the user's rotations,
 * before the crop) — the same convention as the apps and the backend.
 */

const MAX_EDGE = 2000; // what the apps ask their picker for; keeps the body ~1 MB

/** Read a File into an <img>, downscaled to MAX_EDGE, oriented, as a data URI. */
async function loadPickedFile(file) {
  if (!file) return null;
  if (!/^image\//.test(file.type || '')) return { error: 'type' };
  // 25 MB of raw camera file, before any downscale. Past this the browser tab is
  // the thing at risk, so it is refused rather than attempted.
  if (file.size > 25 * 1024 * 1024) return { error: 'size' };

  const bitmap = await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    // The browser applies the EXIF orientation when decoding, so naturalWidth /
    // naturalHeight are already the dimensions the person sees — the same frame
    // the backend's auto-orient produces, which is what keeps the two in step.
    img.src = url;
  });
  if (!bitmap || !bitmap.naturalWidth) return { error: 'decode' };

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
  const w = Math.max(1, Math.round(bitmap.naturalWidth * scale));
  const h = Math.max(1, Math.round(bitmap.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // White behind it, so a transparent PNG does not arrive as a black rectangle
  // once the server flattens it into a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  return {
    dataUri: canvas.toDataURL('image/jpeg', 0.85),
    width: w,
    height: h,
    // Kept for the preview; drawing the <img> is cheaper than the data URI.
    element: bitmap,
  };
}

const ERRORS = {
  TOO_FAST: 'Please wait a moment before sending another photo.',
  TOO_MANY: 'Too many photos in this consultation.',
  IMAGE_TOO_LARGE: 'That photo is too large. Please pick a smaller one.',
  PAYLOAD_TOO_LARGE: 'That photo is too large. Please pick a smaller one.',
  BAD_IMAGE: 'That photo could not be read. Please pick another one.',
  NOT_CONNECTED: 'Your photo was not sent. Try again once the connection is back.',
  SESSION_ENDED: 'This chat has ended.',
  type: 'Please choose a photo — other kinds of file cannot be sent.',
  size: 'That file is too large. Please pick a smaller photo.',
  decode: 'That photo could not be opened. Please pick another one.',
};
const errorText = (code) => ERRORS[code] || 'The photo could not be sent. Please try again.';

/**
 * Open the editor for one photo.
 *
 * Resolves with the saved chat_messages row once it has been sent, or `null` if
 * the person closed the editor. Rejects nothing: every failure is reported in the
 * editor, which STAYS OPEN with the crop and annotations intact — a dropped
 * request must not cost someone the circle they just drew round a chart.
 */
function openEditor(picked, { onSend }) {
  return new Promise((resolve) => {
    const state = {
      mode: 'crop',
      rotate: 0,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      aspect: 'free',
      strokes: [],
      live: null,
      texts: [],
      brush: 1,
      color: PALETTE[0],
      sending: false,
    };

    const root = document.createElement('div');
    root.className = 'aw-imgedit';
    root.innerHTML = `
      <div class="aw-imgedit-bar">
        <button type="button" class="aw-imgedit-icon" data-act="close" aria-label="Cancel">&times;</button>
        <span class="aw-imgedit-title">Edit photo</span>
        <button type="button" class="aw-imgedit-text" data-act="reset">Reset</button>
        <button type="button" class="aw-imgedit-icon" data-act="rotate" aria-label="Rotate">&#8635;</button>
      </div>
      <div class="aw-imgedit-stage" data-el="stage">
        <canvas data-el="canvas"></canvas>
        <div class="aw-imgedit-overlay" data-el="overlay"></div>
      </div>
      <div class="aw-imgedit-tools" data-el="tools"></div>
      <div class="aw-imgedit-tabs">
        <button type="button" data-tab="crop">Crop</button>
        <button type="button" data-tab="draw">Draw</button>
        <button type="button" data-tab="text">Write</button>
      </div>
      <form class="aw-imgedit-send" data-el="sendform">
        <input type="text" data-el="caption" placeholder="Add a caption…" maxlength="300" autocomplete="off">
        <button type="submit" class="aw-btn aw-btn-gold" data-el="sendbtn">Send</button>
      </form>`;
    document.body.appendChild(root);
    document.body.classList.add('aw-imgedit-open');

    const q = (sel) => root.querySelector(sel);
    const stage = q('[data-el="stage"]');
    const canvas = q('[data-el="canvas"]');
    const overlay = q('[data-el="overlay"]');
    const tools = q('[data-el="tools"]');
    const captionInput = q('[data-el="caption"]');
    const sendBtn = q('[data-el="sendbtn"]');
    const ctx = canvas.getContext('2d');

    let box = { w: 0, h: 0, left: 0, top: 0 };

    const oriented = () => orientedSize(picked.width, picked.height, state.rotate);
    const ratio = () => (ASPECTS.find((a) => a.id === state.aspect) || {}).ratio || null;

    // Everything that has to be undone when the editor goes away, so a listener or
    // an observer cannot outlive the element it was watching.
    const cleanups = [];

    function close(result) {
      root.remove();
      document.body.classList.remove('aw-imgedit-open');
      window.removeEventListener('resize', layout);
      cleanups.forEach((fn) => { try { fn(); } catch (_) { /* nothing to salvage */ } });
      resolve(result);
    }

    // ── Painting ───────────────────────────────────────────────────────────
    // The photo and the strokes go on the canvas; the crop frame and the captions
    // are DOM on top of it, because both need to be dragged and a caption needs to
    // be editable.
    function drawStrokes(toCanvas) {
      const all = state.live ? [...state.strokes, state.live] : state.strokes;
      for (const s of all) {
        if (!s.points.length) continue;
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = Math.max(1, s.width * toCanvas.w);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (s.points.length === 1) {
          const p = toCanvas.map(s.points[0]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        s.points.forEach((pt, i) => {
          const p = toCanvas.map(pt);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    }

    /** The photo, drawn so the ORIENTED image fills (dw × dh) at (dx, dy). */
    function drawOriented(dx, dy, dw, dh) {
      ctx.save();
      ctx.translate(dx + dw / 2, dy + dh / 2);
      ctx.rotate((state.rotate * Math.PI) / 180);
      // Swapped for a quarter turn: after rotating the context, the photo's own
      // width runs along what is now the vertical axis.
      const quarter = state.rotate === 90 || state.rotate === 270;
      const w = quarter ? dh : dw;
      const h = quarter ? dw : dh;
      ctx.drawImage(picked.element, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    function paint() {
      const o = oriented();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const stageRect = stage.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(stageRect.width * dpr));
      canvas.height = Math.max(1, Math.round(stageRect.height * dpr));
      canvas.style.width = `${stageRect.width}px`;
      canvas.style.height = `${stageRect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, stageRect.width, stageRect.height);

      if (state.mode === 'crop') {
        box = cropStageBox(o.w, o.h, stageRect.width, stageRect.height);
        drawOriented(box.left, box.top, box.w, box.h);
        // Strokes are normalised to the whole photo, so in crop mode they are drawn
        // over the whole photo — which is what makes it obvious that re-cropping
        // will cut one off.
        drawStrokes({ w: box.w, map: (p) => ({ x: box.left + p.x * box.w, y: box.top + p.y * box.h }) });
        paintCropOverlay();
      } else {
        box = annotateStageBox(o.w, o.h, state.crop, stageRect.width, stageRect.height);
        const pl = annotateImagePlacement(o.w, o.h, state.crop, box);
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.left, box.top, box.w, box.h);
        ctx.clip();
        drawOriented(box.left + pl.left, box.top + pl.top, pl.width, pl.height);
        drawStrokes({
          w: pl.width,
          map: (p) => {
            const c = orientedToCanvas(p.x, p.y, state.crop, box);
            return { x: box.left + c.x, y: box.top + c.y };
          },
        });
        ctx.restore();
        paintTextOverlay();
      }
    }

    // ── Crop frame ─────────────────────────────────────────────────────────
    function paintCropOverlay() {
      const c = state.crop;
      const r = {
        left: box.left + c.x * box.w,
        top: box.top + c.y * box.h,
        width: c.w * box.w,
        height: c.h * box.h,
      };
      overlay.innerHTML = `
        <div class="aw-crop-shade" style="left:${box.left}px;top:${box.top}px;width:${box.w}px;height:${r.top - box.top}px"></div>
        <div class="aw-crop-shade" style="left:${box.left}px;top:${r.top + r.height}px;width:${box.w}px;height:${(box.top + box.h) - (r.top + r.height)}px"></div>
        <div class="aw-crop-shade" style="left:${box.left}px;top:${r.top}px;width:${r.left - box.left}px;height:${r.height}px"></div>
        <div class="aw-crop-shade" style="left:${r.left + r.width}px;top:${r.top}px;width:${(box.left + box.w) - (r.left + r.width)}px;height:${r.height}px"></div>
        <div class="aw-crop-frame" data-handle="move" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>
        <span class="aw-crop-h tl" data-handle="tl" style="left:${r.left}px;top:${r.top}px"></span>
        <span class="aw-crop-h tr" data-handle="tr" style="left:${r.left + r.width}px;top:${r.top}px"></span>
        <span class="aw-crop-h bl" data-handle="bl" style="left:${r.left}px;top:${r.top + r.height}px"></span>
        <span class="aw-crop-h br" data-handle="br" style="left:${r.left + r.width}px;top:${r.top + r.height}px"></span>`;
    }

    // ── Captions on the photo ──────────────────────────────────────────────
    function paintTextOverlay() {
      overlay.innerHTML = '';
      for (const item of state.texts) {
        const pos = orientedToCanvas(item.x, item.y, state.crop, box);
        const fontSize = Math.max(8, (item.size * box.h) / Math.max(1e-6, state.crop.h));
        const node = document.createElement('div');
        node.className = `aw-img-text${state.mode === 'text' ? ' is-editable' : ''}`;
        node.dataset.textId = item.id;
        node.style.left = `${box.left + pos.x}px`;
        node.style.top = `${box.top + pos.y}px`;
        node.style.color = item.color;
        node.style.fontSize = `${fontSize}px`;
        // Matches the line box the backend's TEXT_TOP_CORRECTION is calibrated
        // against, and the shadow the server composites under the glyphs.
        node.style.lineHeight = `${fontSize * 1.33}px`;
        node.style.textShadow = `${Math.max(1, fontSize * 0.05)}px ${Math.max(1, fontSize * 0.05)}px 1px rgba(0,0,0,.85)`;
        node.style.maxWidth = `${Math.max(40, box.w - pos.x)}px`;
        node.textContent = item.text;
        overlay.appendChild(node);
      }
    }

    function promptForText(existing) {
      const value = window.prompt('Write on the photo', existing ? existing.text : '');
      if (value === null) return; // cancelled
      const text = value.trim();
      if (existing) {
        state.texts = text
          ? state.texts.map((t) => (t.id === existing.id ? { ...t, text } : t))
          : state.texts.filter((t) => t.id !== existing.id); // cleared = removed
      } else if (text) {
        state.texts = [...state.texts, {
          id: `t${Date.now()}`,
          text,
          x: state.crop.x + state.crop.w * 0.1,
          y: state.crop.y + state.crop.h * 0.4,
          size: TEXT_SIZES[1],
          color: PALETTE[4],
        }];
      }
      paint();
    }

    // ── Tool strip, per mode ───────────────────────────────────────────────
    function paintTools() {
      if (state.mode === 'crop') {
        tools.innerHTML = ASPECTS
          .map((a) => `<button type="button" class="aw-imgedit-chip${state.aspect === a.id ? ' is-on' : ''}" data-aspect="${a.id}">${a.id === 'free' ? 'Free' : a.label}</button>`)
          .join('');
      } else if (state.mode === 'draw') {
        tools.innerHTML = `${PALETTE
          .map((c) => `<button type="button" class="aw-imgedit-swatch${state.color === c ? ' is-on' : ''}" data-color="${c}" style="background:${c}" aria-label="colour"></button>`)
          .join('')}<span class="aw-imgedit-div"></span>${BRUSHES
          .map((b, i) => `<button type="button" class="aw-imgedit-brush${state.brush === i ? ' is-on' : ''}" data-brush="${i}" aria-label="brush size"><i style="width:${6 + i * 5}px;height:${6 + i * 5}px"></i></button>`)
          .join('')}<span class="aw-imgedit-div"></span><button type="button" class="aw-imgedit-text" data-act="undo"${state.strokes.length ? '' : ' disabled'}>Undo</button>`;
      } else {
        tools.innerHTML = '<button type="button" class="aw-imgedit-chip is-on" data-act="addtext">+ Add text</button>'
          + `<span class="aw-imgedit-hint">${state.texts.length ? 'Drag to move it, click to change it.' : 'Add a note on the photo.'}</span>`;
      }
      root.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.tab === state.mode);
      });
    }

    function layout() { paint(); paintTools(); }

    // ── Pointer handling ───────────────────────────────────────────────────
    // One listener on the stage for everything, with pointer capture, so a gesture
    // that leaves the element still finishes properly instead of sticking.
    let drag = null;

    stage.addEventListener('pointerdown', (e) => {
      if (state.sending) return;
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (state.mode === 'crop') {
        const handleEl = e.target.closest('[data-handle]');
        if (!handleEl) return;
        drag = { kind: 'crop', handle: handleEl.dataset.handle, startCrop: { ...state.crop }, x: px, y: py };
      } else if (state.mode === 'draw') {
        if (px < box.left || px > box.left + box.w || py < box.top || py > box.top + box.h) return;
        const p = canvasToOriented(px - box.left, py - box.top, state.crop, box);
        drag = { kind: 'draw' };
        state.live = { id: 'live', points: [p], color: state.color, width: BRUSHES[state.brush] };
        paint();
      } else {
        // `dataset.textId` is written as the attribute `data-text-id`.
        const node = e.target.closest('[data-text-id]');
        if (!node) return;
        const item = state.texts.find((t) => t.id === node.dataset.textId);
        if (!item) return;
        drag = { kind: 'text', id: item.id, startX: item.x, startY: item.y, x: px, y: py, moved: false };
      }
      if (drag) {
        stage.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (drag.kind === 'crop') {
        // Measured from where the gesture began, not accumulated per event, so a
        // long drag cannot drift away from the pointer.
        const dx = (px - drag.x) / Math.max(1, box.w);
        const dy = (py - drag.y) / Math.max(1, box.h);
        const o = oriented();
        state.crop = applyCropDrag(drag.startCrop, drag.handle, dx, dy, ratio(), o.w, o.h);
        paint();
      } else if (drag.kind === 'draw') {
        const p = canvasToOriented(px - box.left, py - box.top, state.crop, box);
        const pts = state.live.points;
        if (!shouldKeepPoint(pts[pts.length - 1], p, box)) return;
        state.live = { ...state.live, points: [...pts, p] };
        paint();
      } else if (drag.kind === 'text') {
        if (Math.abs(px - drag.x) > 2 || Math.abs(py - drag.y) > 2) drag.moved = true;
        const nx = drag.startX + ((px - drag.x) / Math.max(1, box.w)) * state.crop.w;
        const ny = drag.startY + ((py - drag.y) / Math.max(1, box.h)) * state.crop.h;
        state.texts = state.texts.map((t) => (t.id === drag.id
          ? { ...t, x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) }
          : t));
        paint();
      }
    });

    const endDrag = () => {
      if (!drag) return;
      if (drag.kind === 'draw' && state.live) {
        state.strokes = [...state.strokes, { ...state.live, id: `s${Date.now()}${state.strokes.length}` }];
        state.live = null;
      }
      // A click rather than a drag re-opens the caption — the obvious way to fix a
      // typo, and it must not fire at the end of every move.
      if (drag.kind === 'text' && !drag.moved) {
        const item = state.texts.find((t) => t.id === drag.id);
        drag = null;
        if (item) promptForText(item);
        layout();
        return;
      }
      drag = null;
      layout();
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    // ── Buttons ────────────────────────────────────────────────────────────
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { state.mode = tab.dataset.tab; layout(); return; }

      const aspect = e.target.closest('[data-aspect]');
      if (aspect) {
        state.aspect = aspect.dataset.aspect;
        const r = ratio();
        if (r) { const o = oriented(); state.crop = cropForAspect(r, o.w, o.h); }
        layout();
        return;
      }
      const colorBtn = e.target.closest('[data-color]');
      if (colorBtn) { state.color = colorBtn.dataset.color; paintTools(); return; }
      const brushBtn = e.target.closest('[data-brush]');
      if (brushBtn) { state.brush = Number(brushBtn.dataset.brush); paintTools(); return; }

      const act = e.target.closest('[data-act]');
      if (!act) return;
      const what = act.dataset.act;
      if (what === 'close') { if (!state.sending) close(null); return; }
      if (what === 'undo') { state.strokes = state.strokes.slice(0, -1); layout(); return; }
      if (what === 'addtext') { promptForText(null); return; }
      if (what === 'reset') {
        state.rotate = 0;
        state.crop = { x: 0, y: 0, w: 1, h: 1 };
        state.aspect = 'free';
        state.strokes = [];
        state.texts = [];
        layout();
        return;
      }
      if (what === 'rotate') {
        // Carries the crop, the strokes and the captions round with the photo, so
        // straightening a sideways picture never costs the annotations.
        const o = oriented();
        const next = rotateEditsClockwise({ crop: state.crop, strokes: state.strokes, texts: state.texts }, o.w, o.h);
        state.crop = next.crop;
        state.strokes = next.strokes;
        state.texts = next.texts;
        state.rotate = (state.rotate + 90) % 360;
        // A locked ratio describes the OUTPUT shape, which a quarter turn changes.
        state.aspect = 'free';
        layout();
      }
    });

    q('[data-el="sendform"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.sending) return;
      state.sending = true;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      const result = await onSend(
        buildEditSpec({ rotate: state.rotate, crop: state.crop, strokes: state.strokes, texts: state.texts }),
        captionInput.value.trim(),
      );
      state.sending = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      if (result && result.ok) { close(result); return; }
      // Stays open with everything still in it.
      toast(errorText(result && result.code));
    });

    window.addEventListener('resize', layout);

    // PAINT IMMEDIATELY, and let a ResizeObserver handle the stage settling.
    //
    // This used to be a single `requestAnimationFrame(layout)`, on the reasoning
    // that the stage needs a layout pass before it has a real height. That is a
    // bad bet: rAF is not guaranteed to run promptly — it is throttled or deferred
    // whenever the document is not actively being painted (a background tab, a
    // hidden pane, a low-power mode, some embedded webviews), and when it does not
    // arrive the editor is simply BLANK with no error anywhere. Caught by
    // aw/chat-image-selftest.html, where rAF never fired at all while layout()
    // itself worked perfectly.
    //
    // layout() re-measures on every call and is idempotent, so calling it eagerly
    // costs nothing and the observer corrects it the moment the real size is known
    // — which also covers a late font load or a keyboard opening on a phone.
    layout();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
    if (ro) ro.observe(stage);
    cleanups.push(() => ro && ro.disconnect());
  });
}

/**
 * Wire an "attach a photo" button into a running chat.
 *
 * `canSend()` is asked immediately before the picker opens: the backend refuses a
 * disconnected participant (its SERVICE_PRESENCE_GRACE_MS), so there is no point
 * letting someone crop and annotate a photo that cannot be delivered.
 * `onMessage(row)` receives the saved row, exactly as the socket would.
 */
export function attachChatImages({ button, roomId, sessionId, receiverId, onMessage, onSystem, canSend }) {
  if (!button) return () => {};

  const picker = document.createElement('input');
  picker.type = 'file';
  // Images only — the chat accepts nothing else, and saying so in the file dialog
  // is better than letting someone choose a PDF and be refused afterwards.
  picker.accept = 'image/*';
  picker.hidden = true;
  button.parentNode.appendChild(picker);

  const onClick = () => {
    if (canSend && !canSend()) return;
    picker.value = ''; // so choosing the same file twice in a row still fires
    picker.click();
  };

  const onChange = async () => {
    const file = picker.files && picker.files[0];
    if (!file) return;
    button.disabled = true;
    const picked = await loadPickedFile(file);
    button.disabled = false;
    if (!picked) return;
    if (picked.error) { toast(errorText(picked.error)); return; }

    await openEditor(picked, {
      onSend: async (edits, caption) => {
        try {
          const res = await api.post('/api/chat/image', {
            roomId, sessionId, receiverId, image: picked.dataUri, edits, caption,
          }, {
            // A photo on a weak connection is a slow request, not a failed one;
            // the default 20s timeout bounces perfectly good uploads.
            timeoutMs: 60000,
          });
          if (!res || !res.data) return { ok: false, code: res && res.code };
          onMessage(res.data);
          if (res.masked && onSystem) {
            onSystem('Contact details are hidden. Please keep the conversation on Astrowani.');
          } else if (res.textDropped && onSystem) {
            onSystem('The photo was sent, but the text you added could not be placed on it.');
          }
          return { ok: true, row: res.data };
        } catch (err) {
          return { ok: false, code: err instanceof ApiError ? err.code : null };
        }
      },
    });
  };

  button.addEventListener('click', onClick);
  picker.addEventListener('change', onChange);

  return () => {
    button.removeEventListener('click', onClick);
    picker.removeEventListener('change', onChange);
    picker.remove();
  };
}

/** The caption on an image row. `message` is stored as "📷" or "📷 <caption>". */
export function captionOf(message) {
  const s = String(message || '');
  if (!s.startsWith('📷')) return '';
  const rest = s.slice(2).trim();
  // "Photo" is the server's placeholder when there is no caption — the bubble's
  // own label, not something the sender typed.
  return rest === 'Photo' ? '' : rest;
}

/** Full-screen view of one photo, closed by the backdrop, the button or Escape. */
export function openLightbox(url) {
  const box = document.createElement('div');
  box.className = 'aw-lightbox';
  box.innerHTML = `<button type="button" class="aw-lightbox-close" aria-label="Close">&times;</button><img alt="">`;
  box.querySelector('img').src = url;
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('aw-imgedit-open');
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  box.addEventListener('click', (e) => {
    // Anywhere except the photo itself, so the obvious tap-outside works.
    if (e.target.tagName !== 'IMG') close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  document.body.classList.add('aw-imgedit-open');
}
