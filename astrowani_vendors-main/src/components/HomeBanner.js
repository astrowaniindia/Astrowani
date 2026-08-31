// Admin-driven home banner for the vendor app. Fetches the same banners the admin
// manages (GET /api/banners/all) and cross-fades between them using the admin-set
// interval (banner_interval_seconds). Falls back to the bundled logo when none exist.
import React, {useEffect, useRef, useState} from 'react';
import {View, Image, Animated, StyleSheet} from 'react-native';
import Instance from '../api/ApiCall';
import {verticalScale, moderateScale} from '../utils/Scaling';

const FALLBACK = [require('../assets/images/mainlogo.jpeg')];

export default function HomeBanner() {
  const [slides, setSlides] = useState(FALLBACK);
  const [intervalMs, setIntervalMs] = useState(4000);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    Instance('/api/banners/all?app=vendor')
      .then(res => {
        if (!active) return;
        const imgs = (res?.data?.data || [])
          .filter(b => b?.imageUrl)
          .map(b => ({uri: b.imageUrl}));
        if (imgs.length) setSlides(imgs);
        const secs = Number(res?.data?.intervalSeconds);
        if (secs > 0) setIntervalMs(secs * 1000);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      Animated.timing(fade, {toValue: 0.2, duration: 500, useNativeDriver: true}).start(() => {
        setIndex(prev => (prev + 1) % slides.length);
        Animated.timing(fade, {toValue: 1, duration: 500, useNativeDriver: true}).start();
      });
    }, Math.max(1000, intervalMs));
    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  const safeIndex = index % slides.length;

  return (
    <View style={styles.banner}>
      <Animated.View style={[styles.fade, {opacity: fade}]}>
        <Image source={slides[safeIndex]} style={styles.image} resizeMode="cover" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    // Shaped to the exact size the admin's upload tool crops a home_primary banner
    // to (1200x500) -- this component fetches /api/banners/all with no placement,
    // and that endpoint defaults to home_primary. A fixed pixel height is a
    // DIFFERENT shape from the uploaded image on every screen size, and with
    // resizeMode cover the overflow is silently sliced off the sides, so anything
    // near the left or right edge disappears. Keep this in step with
    // astrowani-admin/src/pages/Banners.jsx PLACEMENTS.
    //
    // The ratio goes HERE, on the container, not on the <Image>: an image sized
    // `width: '100%'` + aspectRatio resolves its width against a box wider than the
    // visible card, so it balloons and the card inherits its height -- measured at
    // 1673x697 against a 1008px-wide card, i.e. worse cropping than the bug.
    aspectRatio: 1200 / 500,
    borderRadius: moderateScale(16),
    marginBottom: verticalScale(15),
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  fade: {flex: 1},
  image: {width: '100%', height: '100%'},
});
