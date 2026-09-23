// PlacementBanner — fetches admin-authored banners for a given placement
// (home_primary, home_secondary, chat_top, video_top, call_top, ...) and renders
// a sliding, swipeable carousel with page dots. It advances on its own every
// admin-set interval, and the customer can swipe left/right at any time (auto-
// advance pauses while they are touching it). Tapping navigates per the admin's
// configured action (a screen name, or an external URL) — no-op if none is set.
//
// Was a fade-in/fade-out of one image. Replaced 2026-09-14: a slide with dots
// tells the customer there is more than one banner and lets them look at it.
import React from 'react';
import { View, ScrollView, TouchableOpacity, Linking, StyleSheet, Dimensions } from 'react-native';
import { getViewerSegment, hydrateViewerSegment } from '../utils/viewerSegment';
import FastImage from 'react-native-fast-image';
import Instance from '../api/ApiCall';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { readCache } from '../utils/cacheFetch';
import { getHomeMemory, saveHomeData } from '../utils/homePreload';

// The shape of each banner slot, matching the exact pixel size the admin's upload
// tool crops to (astrowani-admin/src/pages/Banners.jsx PLACEMENTS). KEEP THE TWO IN
// STEP -- they are one contract, and when they disagree the admin is the side telling
// the truth, because it is what the person uploading was promised.
//
// This exists because the container used to be a hardcoded pixel height at full
// width, which is a different shape from the uploaded image on every screen size.
// With resizeMode cover the image then scales up until it fills that box and the
// overflow is silently cut off the sides -- a 1200x300 banner in the 110px-tall
// home_secondary slot lost about a quarter of its width, so anything near the left
// or right edge (a ribbon, a logo, a call-to-action) simply vanished. Deriving the
// height from the ratio instead means the box is always the shape of the image, so
// nothing is ever cropped, on any device width.
const PLACEMENT_ASPECT = {
  // Shortened 2026-09-05 (500 -> 400, 400 -> 300) so the astrologer list starts higher
  // up Home. On a 411dp screen with 15dp margins that takes the pair from ~286dp of
  // banner to ~222dp — about 64dp handed back to the content below.
  //
  // ⚠️ CHANGED IN STEP with astrowani-admin/src/pages/Banners.jsx PLACEMENTS. These two
  // are one contract. Banners uploaded BEFORE this change were cropped to the old shape
  // and will now be cover-cropped top and bottom until they are re-uploaded — that is
  // unavoidable, not a bug in the sizing: the stored image is genuinely the wrong shape.
  home_primary: 1200 / 400,
  home_secondary: 1200 / 300,
  chat_top: 1200 / 300,
  video_top: 1200 / 300,
  call_top: 1200 / 300,
};

const PlacementBanner = ({
  placement,
  navigation,
  app = 'customer',
  // Which journey stage this viewer is in: 'new' while they can still claim the
  // free chat, 'returning' once they cannot. Banners the admin marked for the
  // other stage are filtered out. Left undefined (the default) means "show
  // everything", which is what every screen other than Home wants.
  audience,
  // Which acquisition group this viewer belongs to ('qr', 'ads', 'google',
  // 'unknown'…), as reported by GET /api/users/profile. A banner that names one or
  // more segments is shown only to those; a banner naming none is shown to everyone.
  // Undefined here — an older build, a screen that does not know, a profile that has
  // not loaded yet — means "no segment filtering", so a banner can never be hidden
  // just because we do not know who is looking.
  segment: segmentProp,
  // Lets a screen take over the tap. Return true to say "handled, don't navigate"
  // — Home uses it to open the free-chat offer instead of following the banner's
  // own action while the customer is still eligible.
  onPressIntercept,
  // Only used for a placement with no declared aspect ratio -- a new slot added to
  // the admin should be added to PLACEMENT_ASPECT above rather than sized by hand.
  height = 150,
  borderRadius = 15,
  style,
  fallbackImages = [],
}) => {
  const { language } = React.useContext(LanguageContext);
  const apiLanguage = language === 'Hindi' ? 'hindi' : 'english';

  // null = "haven't heard back from the fetch yet" — distinct from [] ("fetch
  // confirmed there are zero banners"). Without this distinction the fallback
  // images render for a moment on every launch before the real fetch resolves.
  const cacheKey = `banners_${app}_${placement}_${apiLanguage}`;
  // Starts from banners prepared before this screen opened (utils/homePreload.js),
  // so the slot shows real banners on the first frame instead of popping in.

  // Falls back to the shared cache so Chat/Call/Video get segment targeting without
  // each having to fetch a profile they otherwise do not need. Null until a profile
  // has been seen, which means "no filtering" — see utils/viewerSegment.js.
  const [cachedSegment, setCachedSegment] = React.useState(getViewerSegment());
  React.useEffect(() => {
    let alive = true;
    hydrateViewerSegment().then((seg) => { if (alive && seg) setCachedSegment(seg); });
    return () => { alive = false; };
  }, []);
  const segment = segmentProp || cachedSegment;

  const [banners, setBanners] = React.useState(() => getHomeMemory(cacheKey)?.banners ?? null);
  const [intervalMs, setIntervalMs] = React.useState(() => getHomeMemory(cacheKey)?.intervalMs || 4000);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const scrollRef = React.useRef(null);
  const indexRef = React.useRef(0);
  // True while the customer's finger is on the banner (or it is still settling
  // from their swipe), so the auto-advance never fights a manual swipe.
  const userScrollingRef = React.useRef(false);
  // Bumped after each manual swipe so the auto-advance countdown restarts from
  // zero, instead of firing a moment after the customer chose a slide.
  const [autoKey, setAutoKey] = React.useState(0);
  // Which slides have already been counted as seen during THIS mount. A rotating
  // carousel would otherwise fire an impression every few seconds for as long as the
  // screen is open — tens of thousands of near-worthless events a day, and a CTR
  // denominator that measures dwell time rather than reach. One impression per banner
  // per screen visit is what makes banner_click / banner_impression a real CTR.
  const seenSlidesRef = React.useRef(new Set());
  React.useEffect(() => {
    seenSlidesRef.current = new Set();
  }, [placement, app, apiLanguage]);

  React.useEffect(() => {
    let mounted = true;

    // Stale-while-revalidate: paint last time's banners immediately (no blank
    // gap), then silently replace them once the network call comes back. Skipped
    // when prepared banners were already in memory (they are at least as fresh).
    const prepared = getHomeMemory(cacheKey);
    if (prepared) {
      setBanners(prepared.banners);
      if (prepared.intervalMs > 0) setIntervalMs(prepared.intervalMs);
    } else {
      readCache(cacheKey).then(cached => {
        if (mounted && cached) {
          setBanners(cached.banners);
          if (cached.intervalMs > 0) setIntervalMs(cached.intervalMs);
        }
      });
    }

    Instance(`/api/banners/all?app=${app}&placement=${placement}&language=${apiLanguage}`)
      .then((res) => {
        if (!mounted) return;
        const freshBanners = res?.data?.data || [];
        const secs = Number(res?.data?.intervalSeconds);
        const freshIntervalMs = secs > 0 ? secs * 1000 : intervalMs;
        setBanners(freshBanners);
        if (secs > 0) setIntervalMs(freshIntervalMs);
        saveHomeData(cacheKey, { banners: freshBanners, intervalMs: freshIntervalMs });
      })
      .catch(() => {
        // A failed fetch (network hiccup, backend blip) must not leave this
        // permanently blank — fall back to the local placeholder images the
        // same way a confirmed-empty response does, instead of rendering
        // nothing with no visible explanation. Only do this if we didn't
        // already hydrate from cache above.
        if (mounted) setBanners(prev => (prev === null ? [] : prev));
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, app, apiLanguage]);

  const slides = banners === null
    ? []
    : banners.length > 0
      ? banners
          .filter((b) => b?.imageUrl)
          .filter((b) => {
            // 'all' is the default for every pre-existing banner, so an admin who
            // never touches this setting sees no change in behaviour.
            const a = b.audience || 'all';
            return a === 'all' || !audience || a === audience;
          })
          .filter((b) => {
            // Acquisition targeting. Empty list = everyone, which is every banner
            // that predates the feature, so an admin who never touches this sees no
            // change. Fails OPEN on an unknown viewer for the same reason.
            const want = Array.isArray(b.segments) ? b.segments : [];
            if (!want.length || !segment) return true;
            return want.includes(segment);
          })
          .map((b) => ({ uri: b.imageUrl, actionType: b.actionType, actionValue: b.actionValue }))
      : fallbackImages.map((source) => ({ source, actionType: 'none', actionValue: null }));

  // Impression for whichever slide is currently on screen, deduped per mount.
  const impressionIndex = slides.length ? currentIndex % slides.length : -1;
  React.useEffect(() => {
    if (impressionIndex < 0) return;
    const slide = slides[impressionIndex];
    if (!slide) return;
    const id = `${impressionIndex}:${slide.uri || 'local'}`;
    if (seenSlidesRef.current.has(id)) return;
    seenSlidesRef.current.add(id);
    captureEvent('banner_impression', {
      placement,
      banner_index: impressionIndex,
      action_type: slide.actionType || 'none',
      is_fallback: !slide.uri,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impressionIndex, slides.length, placement]);

  // Sizing is needed by the auto-advance below, so it is computed before any early
  // return. See the long note further down for why both dimensions are explicit.
  const aspectRatio = PLACEMENT_ASPECT[placement];
  const flatStyle = StyleSheet.flatten(style) || {};
  const hMargin =
    flatStyle.marginHorizontal ?? Math.max(flatStyle.marginLeft || 0, flatStyle.marginRight || 0);
  const boxWidth = Dimensions.get('window').width - 2 * (hMargin || 0);

  // Keep the index valid when the slide list changes (fresh fetch, language,
  // audience switch) — otherwise the dots could point past the last slide.
  React.useEffect(() => {
    if (slides.length && indexRef.current >= slides.length) {
      indexRef.current = 0;
      setCurrentIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [slides.length]);

  React.useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      if (userScrollingRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      indexRef.current = next;
      setCurrentIndex(next);
      scrollRef.current?.scrollTo({ x: next * boxWidth, animated: true });
    }, Math.max(1500, intervalMs));
    return () => clearInterval(interval);
  }, [slides.length, intervalMs, boxWidth, autoKey]);

  if (slides.length === 0) return null;
  const safeIndex = currentIndex % slides.length;

  const handleMomentumEnd = (e) => {
    const x = e?.nativeEvent?.contentOffset?.x || 0;
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(x / boxWidth)));
    if (userScrollingRef.current) {
      userScrollingRef.current = false;
      // A manual swipe: restart the auto-advance countdown from zero.
      setAutoKey((k) => k + 1);
    }
    if (index !== indexRef.current) {
      indexRef.current = index;
      setCurrentIndex(index);
    }
  };

  const handlePress = (slide, slideIndex) => {
    // Fired for every placement this component renders (home_primary/home_secondary/
    // chat_top/video_top/call_top) — the admin Analytics home-screen query filters
    // this down to the two home_* placements rather than this component only firing
    // on Home, since the same component is reused across multiple screens.
    captureEvent('banner_click', {
      placement,
      banner_index: slideIndex,
      action_type: slide?.actionType || 'none',
      action_value: slide?.actionValue || null,
      is_fallback: !slide?.uri,
    });
    // The screen gets first refusal on the tap. Checked BEFORE the action-type
    // guard below, so a banner with no action configured can still be used purely
    // as a trigger — which is how the free-chat banner works.
    if (onPressIntercept && onPressIntercept(placement) === true) return;
    if (!slide?.actionType || slide.actionType === 'none' || !slide.actionValue) return;
    if (slide.actionType === 'url') {
      Linking.openURL(slide.actionValue).catch(() => {});
    } else if (slide.actionType === 'screen' && navigation) {
      navigation.navigate(slide.actionValue);
    }
  };

  const isSlideTappable = (slide) =>
    !!onPressIntercept ||
    !!(slide?.actionType && slide.actionType !== 'none' && slide.actionValue);

  // aspectRatio wins over height when we know the slot's shape: the box then matches
  // the uploaded image exactly and cover crops nothing.
  //
  // Both dimensions are computed explicitly (see aspectRatio/boxWidth above). Everything softer than this was
  // tried on a device and measured, and each failed in its own way:
  //
  //   - a fixed pixel height is a different shape from the uploaded image, so cover
  //     silently sliced the sides off. That was the original bug.
  //   - `aspectRatio` with no width is ambiguous: Yoga may take the width from the
  //     parent, or take the height first and derive the width from the ratio. Home's
  //     two banners resolved DIFFERENTLY from one another -- 381.7dp and 333.7dp
  //     wide, both with correct ratios but visibly unequal. `alignSelf: 'stretch'`
  //     did not settle it.
  //   - `width: '100%'` resolves against the parent and then ADDS the
  //     marginHorizontal the call sites pass, overflowing the screen.
  //   - deriving the height from an onLayout-measured width left the image zoomed on
  //     the first pass, because the box has no height until that measurement lands.
  //
  // So: read the horizontal margin out of the caller's own style and subtract it
  // from the window width. No layout ambiguity, correct on the first frame, and
  // correct on any screen size.
  const boxHeight = aspectRatio ? boxWidth / aspectRatio : height;
  const sizing = { width: boxWidth, height: boxHeight };

  return (
    <View style={[sizing, { borderRadius, overflow: 'hidden' }, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        // Only when there is something to swipe to — a single banner stays still.
        scrollEnabled={slides.length > 1}
        onScrollBeginDrag={() => { userScrollingRef.current = true; }}
        onMomentumScrollEnd={handleMomentumEnd}
        style={sizing}>
        {slides.map((slide, i) => {
          const tappable = isSlideTappable(slide);
          return (
            <TouchableOpacity
              key={`${slide.uri || 'local'}-${i}`}
              activeOpacity={tappable ? 0.85 : 1}
              onPress={() => handlePress(slide, i)}
              disabled={!tappable}
              style={sizing}>
              <FastImage
                source={slide.uri ? { uri: slide.uri, priority: FastImage.priority.high } : slide.source}
                style={styles.image}
                resizeMode={FastImage.resizeMode.cover}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === safeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  dots: {
    position: 'absolute',
    bottom: 7,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  // The current slide's dot is a wider gold pill.
  dotActive: {
    width: 18,
    backgroundColor: '#FFD700',
  },
});

export default PlacementBanner;
