// Makes the floating gift bubble draggable — icon and its hint label together, as one
// object — and remembers where it was put (utils/giftBubblePosition).
//
// THE SLOP IS THE WHOLE TRICK. The responder is claimed only once a finger has moved
// DRAG_SLOP, so a tap never becomes a drag and the TouchableOpacity underneath keeps
// working exactly as before. Without it the bubble would stop opening the offer, which
// is the one thing it is actually for.
//
// The offset is relative to wherever the bubble rests (bottom-right), so it is clamped
// to x ≤ 0 / y ≤ 0 — it can be pulled left and up out of its corner, never pushed off
// the opposite edges — and bounded on the other two sides by the screen, so it can
// never be parked where it cannot be reached again.
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';
import { loadGiftBubblePos, peekGiftBubblePos, saveGiftBubblePos } from '../utils/giftBubblePosition';

const DRAG_SLOP = 8;
// Room kept between the bubble and the far edges, in raw px: enough that the circle
// and its label stay fully on screen at either extreme.
const EDGE_X = 150;
const EDGE_Y = 180;

export default function useDraggableBubble() {
  const start = peekGiftBubblePos() || { x: 0, y: 0 };
  const pan = useRef(new Animated.ValueXY(start)).current;
  const at = useRef(start);

  // Only needed when this is the first bubble of the session; afterwards the cache
  // above has already placed it on the first frame.
  useEffect(() => {
    let alive = true;
    loadGiftBubblePos().then((pos) => {
      if (!alive || !pos) return;
      at.current = pos;
      pan.setValue(pos);
    });
    return () => { alive = false; };
  }, [pan]);

  const responder = useRef(
    PanResponder.create({
      // CAPTURE phase, and NOT onStartShouldSet. The TouchableOpacity inside becomes
      // the responder the moment a finger lands, so a plain
      // onMoveShouldSetPanResponder on its parent is never consulted and the bubble
      // simply refuses to move. Capture lets the parent take the gesture back — but
      // only once the finger has travelled DRAG_SLOP, so a tap still opens the offer.
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
      onPanResponderGrant: () => {
        pan.setOffset(at.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        pan.flattenOffset();
        const { width, height } = Dimensions.get('window');
        const next = {
          x: Math.min(0, Math.max(-(width - EDGE_X), at.current.x + g.dx)),
          y: Math.min(0, Math.max(-(height - EDGE_Y), at.current.y + g.dy)),
        };
        at.current = next;
        // Settles into the clamped spot rather than snapping, so a drag past the edge
        // reads as the bubble being caught instead of teleporting.
        Animated.spring(pan, {
          toValue: next,
          friction: 8,
          tension: 70,
          useNativeDriver: false,
        }).start();
        saveGiftBubblePos(next);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return {
    panHandlers: responder.panHandlers,
    dragStyle: { transform: pan.getTranslateTransform() },
  };
}
