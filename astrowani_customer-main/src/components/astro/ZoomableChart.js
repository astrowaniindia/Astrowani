// Interactive birth-chart viewer.
//
// TWO problems this fixes, both visible in the shipped app:
//
// 1. THE CHART WAS CROPPED. JyotishamAstroAPI returns `<svg height="330" width="330">`
//    with NO viewBox (verified live 2026-08-16). Without a viewBox an SVG has no
//    intrinsic coordinate system to map onto its viewport, so `<SvgXml width="100%">`
//    gave the element a full-width box while the drawing inside stayed pinned at 330
//    user units from the top-left — anything past the phone's width was simply clipped,
//    which is exactly the missing right-hand column of houses. Injecting
//    `viewBox="0 0 330 330"` (read off the width/height the API already sends) makes the
//    drawing scale to whatever box we give it. Nothing else was ever wrong with the SVG.
//
// 2. IT WAS A DEAD IMAGE. A chart is the one thing in these reports a reader wants to
//    study — squint at a house, follow an aspect line. Fixed at ~300pt on a phone the
//    planet abbreviations are barely legible. Now: tap to open full-screen, pinch to
//    zoom, drag to pan, double-tap to toggle 2.5x.
//
// Gesture stack is react-native-gesture-handler + reanimated (both already in the app —
// IntroSplash.js uses reanimated, App.js already mounts GestureHandlerRootView, and the
// babel plugin is configured), so this ships over-the-air with no native change.
import React, {useContext, useMemo, useState} from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, StatusBar,
} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {ASTRO} from './AstroUI';
import {LanguageContext} from '../../context/LanguageContext';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {useModalPresence} from '../../utils/modalPresentation';

/**
 * Give an SVG a viewBox if it lacks one, so it can scale to any container.
 * Returns null for anything that isn't parseable SVG rather than guessing.
 */
export function normalizeSvg(xml) {
  if (typeof xml !== 'string') return null;
  const trimmed = xml.trim();
  if (!trimmed.startsWith('<svg')) return null;

  const open = trimmed.slice(0, trimmed.indexOf('>') + 1);
  if (/viewBox\s*=/.test(open)) {
    // Already scalable — just make sure the outer element fills its container.
    return trimmed
      .replace(open, open.replace(/\swidth\s*=\s*"[^"]*"/, ' width="100%"').replace(/\sheight\s*=\s*"[^"]*"/, ' height="100%"'));
  }

  const w = parseFloat((open.match(/\swidth\s*=\s*"([\d.]+)/) || [])[1]);
  const h = parseFloat((open.match(/\sheight\s*=\s*"([\d.]+)/) || [])[1]);
  if (!w || !h) return trimmed;

  const patched = open
    .replace(/\swidth\s*=\s*"[^"]*"/, '')
    .replace(/\sheight\s*=\s*"[^"]*"/, '')
    .replace(
      /^<svg/,
      `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"`,
    );
  return trimmed.replace(open, patched);
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;

function clamp(v, lo, hi) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

/** Full-screen pinch/pan viewer. */
function ChartLightbox({xml, title, visible, onClose, hint}) {
  const {width, height} = Dimensions.get('window');
  const box = Math.min(width, height) * 0.92;

  const sc = useSharedValue(1);
  const savedSc = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  // Declares this modal to the presentation registry so root-level popups
  // wait for it instead of colliding with it on iOS (utils/modalPresentation).
  useModalPresence(visible);

  const reset = () => {
    sc.value = withTiming(1);
    savedSc.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
    setZoomed(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      sc.value = clamp(savedSc.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedSc.value = sc.value;
      // Snapping back at 1x keeps the chart from drifting off-centre after a
      // pinch-out-then-in, which otherwise strands it half off-screen.
      if (sc.value <= 1.01) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
      runOnJS(setZoomed)(sc.value > 1.01);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      // Pan range grows with zoom: at 1x there is nothing to pan to.
      const limit = (box * (sc.value - 1)) / 2;
      tx.value = clamp(savedTx.value + e.translationX, -limit, limit);
      ty.value = clamp(savedTy.value + e.translationY, -limit, limit);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = sc.value > 1.01 ? 1 : 2.5;
      sc.value = withTiming(next);
      savedSc.value = next;
      if (next === 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
      runOnJS(setZoomed)(next > 1);
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{translateX: tx.value}, {translateY: ty.value}, {scale: sc.value}],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.lightboxRoot}>
        <StatusBar backgroundColor="#000" barStyle="light-content" />
        <View style={styles.lightboxBar}>
          <Text style={styles.lightboxTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.lightboxActions}>
            {zoomed && (
              <TouchableOpacity onPress={reset} style={styles.lightboxBtn} hitSlop={styles.hit}>
                <Ionicons name="contract-outline" size={moderateScale(20)} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.lightboxBtn} hitSlop={styles.hit}>
              <Ionicons name="close" size={moderateScale(24)} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <GestureDetector gesture={composed}>
          <View style={styles.lightboxBody} collapsable={false}>
            <Animated.View style={[{width: box, height: box}, styles.lightboxCanvas, animStyle]}>
              <SvgXml xml={xml} width="100%" height="100%" />
            </Animated.View>
          </View>
        </GestureDetector>

        <Text style={styles.lightboxHint}>{hint}</Text>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Inline chart card. Renders square and full-bleed to the card's width (so no
 * house is ever cut off), and opens the lightbox on tap.
 */
export default function ZoomableChart({svg, title = 'Chart', caption}) {
  const {t} = useContext(LanguageContext);
  const xml = useMemo(() => normalizeSvg(svg), [svg]);
  const [open, setOpen] = useState(false);

  if (!xml) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="alert-circle-outline" size={moderateScale(26)} color={ASTRO.muted} />
        <Text style={styles.empty}>{t('report.chartFailed')}</Text>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setOpen(true)} style={styles.canvas}>
        <SvgXml xml={xml} width="100%" height="100%" />
      </TouchableOpacity>

      <View style={styles.footer}>
        <Ionicons name="scan-outline" size={moderateScale(13)} color={ASTRO.gold} />
        <Text style={styles.footerText}>{caption || t('report.tapToEnlarge')}</Text>
      </View>

      <ChartLightbox xml={xml} title={title} visible={open} onClose={() => setOpen(false)} hint={t('report.pinchHint')} />
    </View>
  );
}

const styles = StyleSheet.create({
  // aspectRatio 1 with no fixed height: the chart is square, so this guarantees
  // it uses the full card width at every screen size instead of a magic number.
  canvas: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: ASTRO.line,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: verticalScale(7),
  },
  footerText: {
    fontSize: moderateScale(10), fontFamily: 'Lato-Bold', color: ASTRO.muted,
    marginLeft: scale(5), letterSpacing: 0.2,
  },

  emptyWrap: {alignItems: 'center', paddingVertical: verticalScale(18)},
  empty: {
    fontSize: moderateScale(12), fontFamily: 'Lato-Regular', color: ASTRO.muted,
    marginTop: verticalScale(6), textAlign: 'center',
  },

  lightboxRoot: {flex: 1, backgroundColor: '#0B0705'},
  lightboxBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: scale(14), paddingVertical: verticalScale(12),
  },
  lightboxTitle: {
    flex: 1, fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: '#fff',
  },
  lightboxActions: {flexDirection: 'row', alignItems: 'center'},
  lightboxBtn: {marginLeft: scale(14)},
  hit: {top: 12, bottom: 12, left: 12, right: 12},
  lightboxBody: {flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  lightboxCanvas: {
    backgroundColor: '#FFFFFF', borderRadius: moderateScale(10), overflow: 'hidden',
  },
  lightboxHint: {
    textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontFamily: 'Lato-Regular',
    fontSize: moderateScale(11), paddingBottom: verticalScale(22), paddingTop: verticalScale(6),
  },
});
