// ─────────────────────────────────────────────────────────────────────────────
// ChatImageBubble — one received or sent photo in the chat, plus the full-screen
// viewer behind a tap. Shared verbatim with the astrologer app.
//
// TWO THINGS HERE ARE LOAD-BEARING
//
// 1. THE BUBBLE RESERVES ITS SHAPE BEFORE THE PHOTO ARRIVES. The row carries
//    image_width/image_height, so the space is computed from those rather than from
//    the decoded bitmap. Without it, every photo loading mid-conversation shoves the
//    message list up or down and whatever the other person was reading jumps off the
//    screen — on a billed-by-the-minute consultation.
//
// 2. A FAILED LOAD IS SHOWN, NOT HIDDEN. A photo that will not load (dead
//    connection, pruned object) leaves a tappable "tap to retry" tile instead of an
//    invisible gap that reads as "they never sent anything".
//
// The viewer's zoom is PanResponder arithmetic rather than a gesture library: this
// file has to compile in the astrologer app too, which has no react-native-svg and
// where every added native module means a store release instead of an OTA.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useContext, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Animated,
  StatusBar,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageContext } from '../../context/LanguageContext';
import { COLORS } from '../../Theme/Colors';

// A photo takes most of the bubble width but is not allowed to become a tall
// ribbon: a 9:16 phone screenshot at full width would push the whole conversation
// off the screen, so its height is capped and the width follows.
const MAX_W_FRACTION = 0.68;
const MAX_H = 320;
const MIN_W = 120;

function bubbleSize(imageWidth, imageHeight) {
  const screenW = Dimensions.get('window').width;
  const maxW = Math.max(MIN_W, screenW * MAX_W_FRACTION);
  const aspect = (imageWidth > 0 && imageHeight > 0) ? imageWidth / imageHeight : 4 / 3;
  let w = maxW;
  let h = w / aspect;
  if (h > MAX_H) { h = MAX_H; w = Math.max(MIN_W, h * aspect); }
  return { width: Math.round(w), height: Math.round(h) };
}

/** The caption, if there is one. `message` is stored as "📷" or "📷 <caption>". */
export function captionOf(message) {
  const s = String(message || '');
  if (!s.startsWith('📷')) return '';
  const rest = s.slice(2).trim();
  // "Photo" is the placeholder the server writes when there is no caption; it is
  // the bubble's own label, not something the sender typed.
  return rest === 'Photo' ? '' : rest;
}

const ImageViewer = ({ visible, uri, onClose }) => {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // The committed transform, which a new gesture starts from. Kept in a ref because
  // the responder is built once and must not read a stale render's value.
  const view = useRef({ scale: 1, x: 0, y: 0, pinchStart: 0, panStart: { x: 0, y: 0 } });

  // Held in a ref so the PanResponder below can call it without listing it as a
  // dependency — the responder must be created exactly once, or a gesture in
  // progress is handed to a brand-new responder mid-pinch.
  const resetRef = useRef(null);
  resetRef.current = () => {
    view.current = { ...view.current, scale: 1, x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 8 }),
    ]).start();
  };

  const responder = useMemo(() => {
    const distance = (touches) => {
      const [a, b] = touches;
      return Math.sqrt((a.pageX - b.pageX) ** 2 + (a.pageY - b.pageY) ** 2);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        view.current.pinchStart = touches.length === 2 ? distance(touches) : 0;
        view.current.panStart = { x: view.current.x, y: view.current.y };
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const d = distance(touches);
          if (!view.current.pinchStart) { view.current.pinchStart = d; return; }
          // Bounded both ways: unbounded zoom-out leaves a speck in the middle of a
          // black screen with no obvious way back.
          const next = Math.min(5, Math.max(1, (view.current.scale * d) / view.current.pinchStart));
          scale.setValue(next);
          view.current.pendingScale = next;
        } else if (view.current.scale > 1.01) {
          // Panning only matters once zoomed in; at 1× a drag would slide the photo
          // off a screen it already fits.
          pan.setValue({
            x: view.current.panStart.x + gesture.dx,
            y: view.current.panStart.y + gesture.dy,
          });
          view.current.x = view.current.panStart.x + gesture.dx;
          view.current.y = view.current.panStart.y + gesture.dy;
        }
      },
      onPanResponderRelease: () => {
        if (view.current.pendingScale) {
          view.current.scale = view.current.pendingScale;
          view.current.pendingScale = 0;
        }
        view.current.pinchStart = 0;
        // Pinching back out snaps home, so there is always a way to recentre.
        if (view.current.scale <= 1.02) resetRef.current();
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [pan, scale]);

  const { width, height } = Dimensions.get('window');

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.viewerRoot} {...responder.panHandlers}>
        <Animated.View style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }}>
          <FastImage
            source={{ uri, priority: FastImage.priority.high }}
            style={{ width, height: height - insets.top - insets.bottom }}
            resizeMode={FastImage.resizeMode.contain}
          />
        </Animated.View>
        <TouchableOpacity
          style={[styles.viewerClose, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

/**
 * `item` is a chat_messages row with message_type === 'image'.
 * `isMine` tints the caption the same way a text bubble is tinted.
 */
const ChatImageBubble = ({ item, isMine, time }) => {
  const { t } = useContext(LanguageContext);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const size = useMemo(() => bubbleSize(item.image_width, item.image_height), [item.image_width, item.image_height]);
  const caption = captionOf(item.message);

  const retry = () => { setState('loading'); setAttempt((n) => n + 1); };

  return (
    <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => (state === 'error' ? retry() : setOpen(true))}
        // Sized from the row's own dimensions, so the list never reflows when the
        // photo finishes downloading.
        style={[styles.imageWrap, size]}
      >
        {state !== 'error' && (
          <FastImage
            // The counter in the key forces a real re-request on retry; FastImage
            // would otherwise serve the same failure straight back from its cache.
            key={attempt}
            source={{ uri: item.image_url, priority: FastImage.priority.normal }}
            style={StyleSheet.absoluteFill}
            resizeMode={FastImage.resizeMode.cover}
            onLoadEnd={() => setState((s) => (s === 'error' ? s : 'ready'))}
            onError={() => setState('error')}
          />
        )}
        {state === 'loading' && (
          <View style={styles.imageOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
        {state === 'error' && (
          <View style={styles.imageOverlay}>
            <Ionicons name="image-outline" size={26} color="rgba(255,255,255,0.9)" />
            <Text style={styles.retryTxt}>{t('chatImage.tapToRetry')}</Text>
          </View>
        )}
      </TouchableOpacity>

      {!!caption && (
        <Text style={[styles.caption, isMine && styles.captionMine]}>{caption}</Text>
      )}

      <View style={styles.timeRow}>
        <Text style={[styles.timeTxt, isMine && styles.timeTxtMine]}>{time}</Text>
        {isMine && <Ionicons name="checkmark-done" size={14} color="#ffd" style={{ marginLeft: 4 }} />}
      </View>

      <ImageViewer visible={open} uri={item.image_url} onClose={() => setOpen(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: 4,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  imageWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.25)' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.35)' },
  retryTxt: { color: '#fff', fontSize: 11.5, fontWeight: '600' },
  caption: { color: '#2c3e50', fontSize: 14.5, lineHeight: 20, paddingHorizontal: 8, paddingTop: 6 },
  captionMine: { color: '#fff' },
  timeRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8, paddingTop: 3, paddingBottom: 2 },
  timeTxt: { fontSize: 11, color: '#888' },
  timeTxtMine: { color: 'rgba(255,255,255,0.7)' },

  viewerRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});

export default ChatImageBubble;
