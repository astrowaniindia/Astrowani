// ─────────────────────────────────────────────────────────────────────────────
// ImageEditorModal — crop, straighten, draw on and write on a photo before it is
// sent into a consultation chat.
//
// Identical in the customer app and the astrologer app (same file, duplicated the
// way every other cross-app helper in this project is), and it adds NO native
// dependency: the gestures are React Native's own PanResponder, the strokes are
// views (StrokeCanvas), and the flattening happens on the server. So the whole
// feature reaches installed builds over the air.
//
// WHAT IS SHOWN HERE IS A PREVIEW. Nothing is rasterised on the phone. The editor
// produces a small description of the edits — see imageEditorGeometry.buildEditSpec
// — which astrowani-backend/src/chatImageComposer.js replays with sharp at full
// resolution. Geometry therefore matches exactly; text metrics are close but not
// identical, since the astrologer app has no Poppins to preview with and the
// server renders with it (documented in the composer's TEXT_TOP_CORRECTION).
//
// THE COORDINATE RULE, because every bug in here is a coordinate bug: state is
// normalised 0..1 against the ORIENTED photo (after the user's 90° taps, before the
// crop). Nothing stores pixels. imageEditorGeometry.js converts to and from the
// on-screen box, and rotating transforms the existing strokes and captions rather
// than discarding them.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  PanResponder,
  ActivityIndicator,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import StrokeCanvas from './StrokeCanvas';
import OrientedImage from './OrientedImage';
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
  hasEdits,
  orientedSize,
  orientedToCanvas,
  rotateEditsClockwise,
  shouldKeepPoint,
} from './imageEditorGeometry';

const MODES = ['crop', 'draw', 'text'];
const HANDLE = 34; // touch target for a crop corner — fingers, not cursors

const ImageEditorModal = ({ visible, source, sending, onCancel, onSend }) => {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState('crop');
  const [rotate, setRotate] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [aspect, setAspect] = useState('free');
  const [strokes, setStrokes] = useState([]);
  const [live, setLive] = useState(null);
  const [texts, setTexts] = useState([]);
  const [brush, setBrush] = useState(1);
  const [colorIdx, setColorIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [area, setArea] = useState({ w: 0, h: 0 });
  // The caption being typed in the overlay, and which existing one it belongs to.
  const [editing, setEditing] = useState(null);

  // Extracted rather than written inline in the dependency array below, so the
  // lint rule can actually check it.
  const sourceUri = source ? source.uri : null;

  // Every fresh photo starts from nothing. Without this, opening the editor a
  // second time inherits the previous photo's crop — which, on a differently
  // shaped picture, is a crop of the wrong part of it.
  useEffect(() => {
    if (!visible) return;
    setMode('crop');
    setRotate(0);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setAspect('free');
    setStrokes([]);
    setLive(null);
    setTexts([]);
    setBrush(1);
    setColorIdx(0);
    setCaption('');
    setEditing(null);
  }, [visible, sourceUri]);

  const srcW = (source && source.width) || 1;
  const srcH = (source && source.height) || 1;
  const oriented = useMemo(() => orientedSize(srcW, srcH, rotate), [srcW, srcH, rotate]);

  const box = useMemo(() => (
    mode === 'crop'
      ? cropStageBox(oriented.w, oriented.h, area.w, area.h)
      : annotateStageBox(oriented.w, oriented.h, crop, area.w, area.h)
  ), [mode, oriented.w, oriented.h, area.w, area.h, crop]);

  const placement = useMemo(
    () => annotateImagePlacement(oriented.w, oriented.h, crop, box),
    [oriented.w, oriented.h, crop, box],
  );

  const color = PALETTE[colorIdx];
  const ratio = (ASPECTS.find((a) => a.id === aspect) || {}).ratio || null;

  // ─── Rotate ───────────────────────────────────────────────────────────────
  // Carries the crop, the strokes and the captions round with the photo, so
  // straightening a sideways picture never costs the person their annotations.
  const onRotate = () => {
    const next = rotateEditsClockwise({ crop, strokes, texts }, oriented.w, oriented.h);
    setCrop(next.crop);
    setStrokes(next.strokes);
    setTexts(next.texts);
    setRotate((r) => (r + 90) % 360);
    // A locked ratio is about the OUTPUT shape; after a quarter turn the old rect
    // no longer has it, so the lock is released rather than silently lying.
    setAspect('free');
  };

  const onReset = () => {
    setRotate(0);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    setAspect('free');
    setStrokes([]);
    setTexts([]);
    setLive(null);
  };

  // ─── Drawing ──────────────────────────────────────────────────────────────
  // Refs, not state, inside the responder: a PanResponder is created once and
  // would otherwise capture the first render's values and draw with a stale brush
  // and a stale crop for the rest of the session.
  const drawRef = useRef({ points: [], color, width: BRUSHES[brush], box, crop });
  drawRef.current.color = color;
  drawRef.current.width = BRUSHES[brush];
  drawRef.current.box = box;
  drawRef.current.crop = crop;

  const drawResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Claim the gesture outright: the editor sits inside a Modal over a chat
    // screen, and without this a stroke can be stolen mid-draw by an ancestor
    // scroll view and simply stop.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const d = drawRef.current;
      const p = canvasToOriented(locationX, locationY, d.crop, d.box);
      d.points = [p];
      setLive({ id: 'live', points: [p], color: d.color, width: d.width });
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const d = drawRef.current;
      const p = canvasToOriented(locationX, locationY, d.crop, d.box);
      const prev = d.points[d.points.length - 1];
      if (!shouldKeepPoint(prev, p, d.box)) return;
      d.points = [...d.points, p];
      setLive({ id: 'live', points: d.points, color: d.color, width: d.width });
    },
    onPanResponderRelease: () => {
      const d = drawRef.current;
      if (d.points.length) {
        const finished = {
          id: `s${Date.now()}${Math.floor(Math.random() * 1000)}`,
          points: d.points,
          color: d.color,
          width: d.width,
        };
        setStrokes((prev) => [...prev, finished]);
      }
      d.points = [];
      setLive(null);
    },
    // A cancelled gesture (an incoming call, a system sheet) still keeps the ink
    // that was already drawn, rather than dropping it on the floor.
    onPanResponderTerminate: () => {
      const d = drawRef.current;
      if (d.points.length > 1) {
        setStrokes((prev) => [...prev, {
          id: `s${Date.now()}`, points: d.points, color: d.color, width: d.width,
        }]);
      }
      d.points = [];
      setLive(null);
    },
  }), []);

  const undoStroke = () => setStrokes((prev) => prev.slice(0, -1));

  // ─── Crop handles ─────────────────────────────────────────────────────────
  const cropRef = useRef({ crop, box, ratio, oriented });
  cropRef.current = { crop, box, ratio, oriented };

  const makeCropResponder = useCallback((handle) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { cropRef.current.start = cropRef.current.crop; },
    onPanResponderMove: (evt, gesture) => {
      const c = cropRef.current;
      const base = c.start || c.crop;
      // Measured from where the gesture BEGAN, not accumulated per frame: adding up
      // deltas drifts, and drift in a crop handle is a handle that slowly stops
      // following the finger.
      const dx = gesture.dx / Math.max(1, c.box.w);
      const dy = gesture.dy / Math.max(1, c.box.h);
      setCrop(applyCropDrag(base, handle, dx, dy, c.ratio, c.oriented.w, c.oriented.h));
    },
    onPanResponderRelease: () => { cropRef.current.start = null; },
    onPanResponderTerminate: () => { cropRef.current.start = null; },
  }), []);

  const moveResponder = useMemo(() => makeCropResponder('move'), [makeCropResponder]);
  const tlResponder = useMemo(() => makeCropResponder('tl'), [makeCropResponder]);
  const trResponder = useMemo(() => makeCropResponder('tr'), [makeCropResponder]);
  const blResponder = useMemo(() => makeCropResponder('bl'), [makeCropResponder]);
  const brResponder = useMemo(() => makeCropResponder('br'), [makeCropResponder]);

  const pickAspect = (a) => {
    setAspect(a.id);
    if (a.ratio) setCrop(cropForAspect(a.ratio, oriented.w, oriented.h));
  };

  // ─── Captions on the photo ────────────────────────────────────────────────
  const addText = () => {
    // Placed a little above the middle of the crop so it does not land under the
    // keyboard the moment it appears.
    const id = `t${Date.now()}`;
    setEditing({ id, text: '', x: crop.x + crop.w * 0.1, y: crop.y + crop.h * 0.4, size: TEXT_SIZES[1], color: PALETTE[4], isNew: true });
  };

  const commitText = () => {
    if (!editing) return;
    const value = (editing.text || '').trim();
    setTexts((prev) => {
      const without = prev.filter((item) => item.id !== editing.id);
      if (!value) return without; // empty = cancelled, and an empty box is not a caption
      return [...without, { ...editing, text: value, isNew: undefined }];
    });
    setEditing(null);
  };

  const deleteEditing = () => {
    if (!editing) return;
    setTexts((prev) => prev.filter((item) => item.id !== editing.id));
    setEditing(null);
  };

  const textDragRef = useRef({});
  const makeTextResponder = (item) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { textDragRef.current[item.id] = { x: item.x, y: item.y, moved: false }; },
    onPanResponderMove: (_e, gesture) => {
      const start = textDragRef.current[item.id];
      if (!start) return;
      if (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2) start.moved = true;
      const nx = start.x + (gesture.dx / Math.max(1, box.w)) * crop.w;
      const ny = start.y + (gesture.dy / Math.max(1, box.h)) * crop.h;
      setTexts((prev) => prev.map((it) => (it.id === item.id
        ? { ...it, x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) }
        : it)));
    },
    onPanResponderRelease: () => {
      const start = textDragRef.current[item.id];
      // A tap, not a drag, re-opens it for editing — the obvious gesture for
      // fixing a typo, and it must not fire at the end of every move.
      if (start && !start.moved) setEditing({ ...texts.find((it) => it.id === item.id) });
      delete textDragRef.current[item.id];
    },
  });

  // ─── Send ─────────────────────────────────────────────────────────────────
  const submit = () => {
    if (sending) return;
    onSend(buildEditSpec({ rotate, crop, strokes, texts }), caption.trim());
  };

  if (!visible || !source) return null;

  const edited = hasEdits({ rotate, crop, strokes, texts });
  const cropPx = {
    left: box.left + crop.x * box.w,
    top: box.top + crop.y * box.h,
    width: crop.w * box.w,
    height: crop.h * box.h,
  };

  const renderCropStage = () => (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: box.left, top: box.top }}>
        <OrientedImage uri={source.uri} rotate={rotate} displayW={box.w} displayH={box.h} />
      </View>

      {/* Four bands of shade around the kept area. Four views rather than one
          cut-out because React Native has no "hole" — and an <Image> dimmed by an
          overlay with a gap is exactly what a crop frame looks like. */}
      <View pointerEvents="none" style={[styles.shade, { left: box.left, top: box.top, width: box.w, height: cropPx.top - box.top }]} />
      <View pointerEvents="none" style={[styles.shade, { left: box.left, top: cropPx.top + cropPx.height, width: box.w, height: (box.top + box.h) - (cropPx.top + cropPx.height) }]} />
      <View pointerEvents="none" style={[styles.shade, { left: box.left, top: cropPx.top, width: cropPx.left - box.left, height: cropPx.height }]} />
      <View pointerEvents="none" style={[styles.shade, { left: cropPx.left + cropPx.width, top: cropPx.top, width: (box.left + box.w) - (cropPx.left + cropPx.width), height: cropPx.height }]} />

      <View style={[styles.cropFrame, cropPx]} {...moveResponder.panHandlers}>
        <View pointerEvents="none" style={styles.thirdV1} />
        <View pointerEvents="none" style={styles.thirdV2} />
        <View pointerEvents="none" style={styles.thirdH1} />
        <View pointerEvents="none" style={styles.thirdH2} />
      </View>

      {[
        { r: tlResponder, s: { left: cropPx.left - HANDLE / 2, top: cropPx.top - HANDLE / 2 }, c: styles.cornerTL },
        { r: trResponder, s: { left: cropPx.left + cropPx.width - HANDLE / 2, top: cropPx.top - HANDLE / 2 }, c: styles.cornerTR },
        { r: blResponder, s: { left: cropPx.left - HANDLE / 2, top: cropPx.top + cropPx.height - HANDLE / 2 }, c: styles.cornerBL },
        { r: brResponder, s: { left: cropPx.left + cropPx.width - HANDLE / 2, top: cropPx.top + cropPx.height - HANDLE / 2 }, c: styles.cornerBR },
      ].map((hd, i) => (
        <View key={i} style={[styles.handleHit, hd.s]} {...hd.r.panHandlers}>
          <View style={[styles.handleMark, hd.c]} />
        </View>
      ))}
    </View>
  );

  const renderAnnotateStage = () => (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', left: box.left, top: box.top, width: box.w, height: box.h, overflow: 'hidden', borderRadius: 6 }}>
        <View style={{ position: 'absolute', left: placement.left, top: placement.top }}>
          <OrientedImage uri={source.uri} rotate={rotate} displayW={placement.width} displayH={placement.height} />
        </View>

        <StrokeCanvas strokes={strokes} live={live} width={box.w} height={box.h} />

        {texts.map((item) => {
          const pos = orientedToCanvas(item.x, item.y, crop, box);
          const fontSize = Math.max(8, (item.size * box.h) / Math.max(1e-6, crop.h));
          const shadow = Math.max(1, fontSize * 0.05);
          return (
            <View
              key={item.id}
              style={{ position: 'absolute', left: pos.x, top: pos.y, maxWidth: Math.max(40, box.w - pos.x) }}
              {...(mode === 'text' ? makeTextResponder(item).panHandlers : {})}
            >
              <Text
                style={{
                  color: item.color,
                  fontSize,
                  // Set explicitly so the preview's line box matches the one the
                  // server's TEXT_TOP_CORRECTION is calibrated against.
                  lineHeight: fontSize * 1.33,
                  fontWeight: '700',
                  textShadowColor: 'rgba(0,0,0,0.85)',
                  textShadowOffset: { width: shadow, height: shadow },
                  textShadowRadius: 1,
                }}
              >
                {item.text}
              </Text>
              {mode === 'text' && <View pointerEvents="none" style={styles.textChrome} />}
            </View>
          );
        })}

        {/* The drawing surface goes LAST so it is on top of the ink, and only in
            draw mode — in text mode the captions need the touches. */}
        {mode === 'draw' && (
          <View style={[StyleSheet.absoluteFill, { width: box.w, height: box.h }]} {...drawResponder.panHandlers} />
        )}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent transparent={false}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onCancel} style={styles.topBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>{t('chatImage.editorTitle')}</Text>
          {edited ? (
            <TouchableOpacity onPress={onReset} style={styles.topBtn}>
              <Text style={styles.resetTxt}>{t('chatImage.reset')}</Text>
            </TouchableOpacity>
          ) : <View style={styles.topBtn} />}
          <TouchableOpacity onPress={onRotate} style={styles.topBtn}>
            <Ionicons name="refresh" size={22} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
          </TouchableOpacity>
        </View>

        {/* ── Stage ── */}
        <View
          style={styles.stage}
          onLayout={(e) => {
            const l = e.nativeEvent.layout;
            const w = Math.round(l.width);
            const h = Math.round(l.height);
            if (w !== area.w || h !== area.h) setArea({ w, h });
          }}
        >
          {area.w > 0 && (mode === 'crop' ? renderCropStage() : renderAnnotateStage())}
        </View>

        {/* ── Tool options ── */}
        <View style={styles.toolRow}>
          {mode === 'crop' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRowInner}>
              {ASPECTS.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => pickAspect(a)}
                  style={[styles.chip, aspect === a.id && styles.chipOn]}
                >
                  <Text style={[styles.chipTxt, aspect === a.id && styles.chipTxtOn]}>
                    {a.id === 'free' ? t('chatImage.aspectFree') : a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {mode === 'draw' && (
            <View style={styles.toolRowInner}>
              {PALETTE.map((c, i) => (
                <TouchableOpacity key={c} onPress={() => setColorIdx(i)} style={[styles.swatch, { backgroundColor: c }, colorIdx === i && styles.swatchOn]} />
              ))}
              <View style={styles.toolDivider} />
              {BRUSHES.map((b, i) => (
                <TouchableOpacity key={b} onPress={() => setBrush(i)} style={[styles.brushBtn, brush === i && styles.brushBtnOn]}>
                  <View style={{ width: 6 + i * 5, height: 6 + i * 5, borderRadius: 20, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              ))}
              <View style={styles.toolDivider} />
              <TouchableOpacity onPress={undoStroke} disabled={!strokes.length} style={[styles.iconBtn, !strokes.length && { opacity: 0.35 }]}>
                <Ionicons name="arrow-undo" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {mode === 'text' && (
            <View style={styles.toolRowInner}>
              <TouchableOpacity onPress={addText} style={styles.addTextBtn}>
                <Ionicons name="add" size={18} color={COLORS.AstroMaroon} />
                <Text style={styles.addTextTxt}>{t('chatImage.addText')}</Text>
              </TouchableOpacity>
              <Text style={styles.hintTxt} numberOfLines={2}>
                {texts.length ? t('chatImage.textHint') : t('chatImage.textEmptyHint')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Mode tabs ── */}
        <View style={styles.tabRow}>
          {MODES.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
              <Ionicons
                name={m === 'crop' ? 'crop' : m === 'draw' ? 'brush' : 'text'}
                size={18}
                color={mode === m ? COLORS.AstroMaroon : '#fff'}
              />
              <Text style={[styles.tabTxt, mode === m && styles.tabTxtOn]}>{t(`chatImage.tab_${m}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Caption + send ── */}
        <View style={[styles.sendRow, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder={t('chatImage.captionPlaceholder')}
            placeholderTextColor="#8a8a8e"
            maxLength={300}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={21} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* ── The caption-on-photo editor ── */}
        {editing && (
          <View style={[StyleSheet.absoluteFill, styles.textOverlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.textOverlayTop}>
              <TouchableOpacity onPress={editing.isNew ? () => setEditing(null) : deleteEditing} style={styles.topBtn}>
                <Ionicons name={editing.isNew ? 'close' : 'trash'} size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={commitText} style={styles.doneBtn}>
                <Text style={styles.doneTxt}>{t('chatImage.done')}</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.textOverlayInput, { color: editing.color, fontSize: 28 }]}
              value={editing.text}
              onChangeText={(v) => setEditing((p) => ({ ...p, text: v }))}
              placeholder={t('chatImage.typeOnPhoto')}
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoFocus
              multiline
              maxLength={160}
            />

            <View style={styles.textOverlayTools}>
              <View style={styles.toolRowInner}>
                {PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setEditing((p) => ({ ...p, color: c }))}
                    style={[styles.swatch, { backgroundColor: c }, editing.color === c && styles.swatchOn]}
                  />
                ))}
              </View>
              <View style={styles.toolRowInner}>
                {TEXT_SIZES.map((s, i) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setEditing((p) => ({ ...p, size: s }))}
                    style={[styles.sizeBtn, editing.size === s && styles.sizeBtnOn]}
                  >
                    <Text style={[styles.sizeTxt, { fontSize: 13 + i * 4 }, editing.size === s && { color: COLORS.AstroMaroon }]}>A</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0d' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  topBtn: { minWidth: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 4 },
  resetTxt: { color: COLORS.AstroGold, fontSize: 13, fontWeight: '700' },

  stage: { flex: 1, margin: 4 },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  cropFrame: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' },
  // Rule-of-thirds guides, the standard cue for "this is a crop frame".
  thirdV1: { position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  thirdV2: { position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  thirdH1: { position: 'absolute', top: '33.33%', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  thirdH2: { position: 'absolute', top: '66.66%', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)' },
  handleHit: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  handleMark: { width: 22, height: 22, borderColor: '#fff' },
  cornerTL: { borderLeftWidth: 4, borderTopWidth: 4, marginRight: 6, marginBottom: 6 },
  cornerTR: { borderRightWidth: 4, borderTopWidth: 4, marginLeft: 6, marginBottom: 6 },
  cornerBL: { borderLeftWidth: 4, borderBottomWidth: 4, marginRight: 6, marginTop: 6 },
  cornerBR: { borderRightWidth: 4, borderBottomWidth: 4, marginLeft: 6, marginTop: 6 },
  textChrome: { ...StyleSheet.absoluteFillObject, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 4, margin: -4 },

  toolRow: { minHeight: 52, justifyContent: 'center', paddingVertical: 4 },
  // WRAPS. Six colours + three brush sizes + Undo measure wider than a 360dp
  // phone, and without this the Undo button is simply off the right-hand edge
  // with no way to reach it. A second row is better than a missing control.
  toolRowInner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 12, gap: 7 },
  toolDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipOn: { backgroundColor: COLORS.AstroGold },
  chipTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: COLORS.AstroMaroon },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  swatchOn: { borderWidth: 3, borderColor: COLORS.AstroGold, transform: [{ scale: 1.12 }] },
  brushBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  brushBtnOn: { backgroundColor: 'rgba(255,255,255,0.3)' },
  iconBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  addTextBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.AstroGold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 3 },
  addTextTxt: { color: COLORS.AstroMaroon, fontWeight: '700', fontSize: 13 },
  hintTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, flex: 1 },

  tabRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabOn: { backgroundColor: COLORS.AstroGold },
  tabTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabTxtOn: { color: COLORS.AstroMaroon },

  sendRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)' },
  captionInput: { flex: 1, color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 11 : 8, fontSize: 15, maxHeight: 96 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center' },

  textOverlay: { backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'space-between' },
  textOverlayTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  doneBtn: { backgroundColor: COLORS.AstroGold, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 18 },
  doneTxt: { color: COLORS.AstroMaroon, fontWeight: '800', fontSize: 14 },
  textOverlayInput: { textAlign: 'center', fontWeight: '700', paddingHorizontal: 24, maxHeight: 220 },
  textOverlayTools: { gap: 14, alignItems: 'center' },
  sizeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  sizeBtnOn: { backgroundColor: COLORS.AstroGold },
  sizeTxt: { color: '#fff', fontWeight: '800' },
});

export default ImageEditorModal;
