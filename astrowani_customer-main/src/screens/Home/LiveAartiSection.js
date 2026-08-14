// Live Aarti / Pooja stream — admin-set YouTube URL (astrowani-admin's Banners
// page, "Live Aarti / Pooja — YouTube URL" card), embedded IN-APP via WebView
// rather than opening the YouTube app/browser. Renders nothing at all when no
// URL is set (per product decision — no "nothing live" placeholder), so this
// section is invisible unless an admin has actually put something there.
//
// Placement: bottom of Home, right before "What Our Clients Say" — see Home.js.
import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PLAYER_WIDTH = SCREEN_WIDTH - scale(30);
const PLAYER_HEIGHT = Math.round((PLAYER_WIDTH * 9) / 16);

// Accepts watch?v=, youtu.be/, live/, embed/, shorts/ links (with or without
// extra query params like &t= / ?si=) and pulls out the 11-char video id.
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/live\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export default function LiveAartiSection() {
  const { t } = useContext(LanguageContext);
  const [videoId, setVideoId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Instance.get('/api/live-aarti')
      .then((res) => {
        if (cancelled) return;
        const id = extractYouTubeId(res?.data?.url);
        setVideoId(id);
      })
      .catch(() => { /* silent — section just stays hidden on any failure */ });
    return () => { cancelled = true; };
  }, []);

  if (!videoId) return null;

  const embedUrl = `https://www.youtube.com/embed/${videoId}?playsinline=1&modestbranding=1&rel=0`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('liveAarti.title')}</Text>
      </View>
      <View style={styles.playerWrap}>
        <WebView
          source={{ uri: embedUrl }}
          style={styles.player}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: verticalScale(15),
    paddingHorizontal: scale(15),
  },
  header: {
    marginBottom: verticalScale(10),
  },
  title: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: COLORS.textDark,
  },
  playerWrap: {
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    borderRadius: moderateScale(16),
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  player: {
    flex: 1,
    backgroundColor: '#000',
  },
});
