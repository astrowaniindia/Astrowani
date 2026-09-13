// An endlessly auto-moving row that the customer can also drag left and right.
//
// Home's carousels are moved with translateX, NOT scrolled: a scroll event on
// iOS cancels any press in flight, which once left every card on Home untappable
// (onPressIn fired, onPress never did). Dragging therefore must not scroll
// either, so it is a PanResponder writing the same offset the animation drives.
//
// `offset` runs 0 -> setWidth and wraps. The row renders the set twice, so an
// offset of setWidth looks identical to 0, and wrapping is invisible.
//
// Taps still work: the responder only claims a gesture once it is clearly a
// horizontal drag, so a plain tap never reaches it. A drag that does get claimed
// cancels the card's press, which is the correct outcome for a swipe.
import {useEffect, useMemo, useRef} from 'react';
import {Animated, Easing, PanResponder} from 'react-native';

// How long the row stays where the customer left it before gliding again.
const RESUME_DELAY_MS = 1500;
// Movement needed before a touch counts as a drag rather than a tap.
const DRAG_THRESHOLD_PX = 8;

export default function useDraggableMarquee(setWidth, speedPxPerSec) {
  const offset = useRef(new Animated.Value(0)).current;

  const widthRef = useRef(setWidth);
  widthRef.current = setWidth;
  const speedRef = useRef(speedPxPerSec);
  speedRef.current = speedPxPerSec;

  const mountedRef = useRef(true);
  const draggingRef = useRef(false);
  const resumeTimerRef = useRef(null);
  // Bumped on every pause/restart, so a stale animation's completion callback
  // can tell it has been superseded and must not restart the loop itself.
  const generationRef = useRef(0);
  // The value the drag started from. null until the native animation has
  // reported where it actually stopped (stopAnimation's callback is async).
  const dragBaseRef = useRef(null);
  const grantDxRef = useRef(0);

  // Cancels any pending "restart the loop" from an older animation.
  const invalidate = () => {
    generationRef.current++;
  };

  const wrap = (v) => {
    const w = widthRef.current;
    return w ? ((v % w) + w) % w : 0;
  };

  const glideFrom = (from) => {
    const w = widthRef.current;
    if (!mountedRef.current || draggingRef.current || !w || !speedRef.current) {
      return;
    }
    const generation = ++generationRef.current;
    const start = wrap(from);
    offset.setValue(start);
    Animated.timing(offset, {
      toValue: w,
      // Constant speed, whatever distance is left before the wrap point.
      duration: ((w - start) / speedRef.current) * 1000,
      easing: Easing.linear,
      // UI thread, so it keeps moving smoothly while JS is busy.
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished && generation === generationRef.current) {
        glideFrom(0);
      }
    });
  };

  const resumeLater = () => {
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      // Nothing is animating here, so this reports the last dragged value.
      offset.stopAnimation((v) => glideFrom(v));
    }, RESUME_DELAY_MS);
  };

  useEffect(() => {
    mountedRef.current = true;
    invalidate();
    clearTimeout(resumeTimerRef.current);
    offset.stopAnimation();
    offset.setValue(0);
    glideFrom(0);
    return () => {
      mountedRef.current = false;
      invalidate();
      clearTimeout(resumeTimerRef.current);
      offset.stopAnimation();
    };
    // glideFrom reads everything through refs; only a new width restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setWidth]);

  const panHandlers = useMemo(() => {
    const endDrag = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragBaseRef.current = null;
      resumeLater();
    };

    return PanResponder.create({
      // Never on touch-down: that is what keeps taps on the cards working.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD_PX && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (_e, g) => {
        draggingRef.current = true;
        invalidate();
        clearTimeout(resumeTimerRef.current);
        grantDxRef.current = g.dx;
        dragBaseRef.current = null;
        offset.stopAnimation((v) => {
          if (draggingRef.current) dragBaseRef.current = wrap(v);
        });
      },
      onPanResponderMove: (_e, g) => {
        if (dragBaseRef.current === null) return;
        // Finger right (dx > 0) pulls earlier cards back into view.
        offset.setValue(wrap(dragBaseRef.current - (g.dx - grantDxRef.current)));
      },
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
      // Keep the drag once it has started, rather than handing it to the page.
      onPanResponderTerminationRequest: () => false,
    }).panHandlers;
    // Built once; everything it reads is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {offset, panHandlers};
}
