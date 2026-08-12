// PlacementBanner — fetches admin-authored banners for a given placement
// (home_primary, home_secondary, chat_top, video_top, call_top, ...) and renders
// a fading, tappable carousel. Tapping navigates per the admin's configured action
// (a screen name, or an external URL) — no-ops if the banner has no action set.
import React from 'react';
import { View, Animated, TouchableOpacity, Linking } from 'react-native';
import FastImage from 'react-native-fast-image';
import Instance from '../api/ApiCall';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';

const PlacementBanner = ({
  placement,
  navigation,
  app = 'customer',
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
  const [banners, setBanners] = React.useState(null);
  const [intervalMs, setIntervalMs] = React.useState(4000);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    let mounted = true;
    Instance(`/api/banners/all?app=${app}&placement=${placement}&language=${apiLanguage}`)
      .then((res) => {
        if (!mounted) return;
        setBanners(res?.data?.data || []);
        const secs = Number(res?.data?.intervalSeconds);
        if (secs > 0) setIntervalMs(secs * 1000);
      })
      .catch(() => {
        // A failed fetch (network hiccup, backend blip) must not leave this
        // permanently blank — fall back to the local placeholder images the
        // same way a confirmed-empty response does, instead of rendering
        // nothing with no visible explanation.
        if (mounted) setBanners([]);
      });
    return () => { mounted = false; };
  }, [placement, app, apiLanguage]);

  const slides = banners === null
    ? []
    : banners.length > 0
      ? banners
          .filter((b) => b?.imageUrl)
          .map((b) => ({ uri: b.imageUrl, actionType: b.actionType, actionValue: b.actionValue }))
      : fallbackImages.map((source) => ({ source, actionType: 'none', actionValue: null }));

  React.useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, Math.max(1000, intervalMs));
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, intervalMs]);

  if (slides.length === 0) return null;
  const safeIndex = currentIndex % slides.length;
  const active = slides[safeIndex];

  const handlePress = () => {
    // Fired for every placement this component renders (home_primary/home_secondary/
    // chat_top/video_top/call_top) — the admin Analytics home-screen query filters
    // this down to the two home_* placements rather than this component only firing
    // on Home, since the same component is reused across multiple screens.
    captureEvent('banner_click', { placement });
    if (!active?.actionType || active.actionType === 'none' || !active.actionValue) return;
    if (active.actionType === 'url') {
      Linking.openURL(active.actionValue).catch(() => {});
    } else if (active.actionType === 'screen' && navigation) {
      navigation.navigate(active.actionValue);
    }
  };

  const isTappable = active?.actionType && active.actionType !== 'none' && active.actionValue;

  return (
    <TouchableOpacity
      activeOpacity={isTappable ? 0.85 : 1}
      onPress={handlePress}
      disabled={!isTappable}
      style={[{ height, borderRadius, overflow: 'hidden' }, style]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FastImage
          source={active.uri ? { uri: active.uri, priority: FastImage.priority.high } : active.source}
          style={{ width: '100%', height: '100%' }}
          resizeMode={FastImage.resizeMode.cover}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

export default PlacementBanner;
