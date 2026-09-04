// Live Aarti / Pooja — every channel that is live RIGHT NOW, in a side-scrolling
// row. Two live channels means two cards, three means three; there is no
// "featured" one and no ranking.
//
// WHY IT USED TO SHOW NOTHING: an admin pasted a link to a specific live
// broadcast, and a broadcast link dies the moment that broadcast ends. The
// server now watches CHANNELS instead (see astrowani-backend/src/liveAarti.js)
// and only ever hands this screen a stream that is live and confirmed
// embeddable, so the link can't go stale.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE, all learned from that failure:
//   1. Only ONE player is ever mounted. Each YouTube embed is a WebView; three
//      decoding video at once is a memory problem on real Android hardware, and
//      this app already has WebView and native-crash history. Off-screen cards
//      are thumbnails.
//   2. A player that fails must SAY SO. The old version rendered a black
//      rectangle forever. This one listens for YouTube's own error events and a
//      no-response timeout, then offers "Watch on YouTube".
//   3. Nothing live => render nothing. No placeholder, no empty box.
//
// Placement: bottom of Home, right before "What Our Clients Say" — see Home.js.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Linking,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';

// Guarded require, not a static import: react-native-webview is a NATIVE module.
// OTA (Hot Updater) can only ship this file's JS — it cannot add the native module to
// binaries that were built before this feature existed. A static import's top-level
// `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` call ran unconditionally as soon
// as this file was required (from Home.js, on app start), fatally crashing EVERY user still
// on an older native build the moment the OTA bundle landed. This try/catch makes the
// absence of the native module a normal, recoverable condition instead.
let WebView = null;
try {
  // eslint-disable-next-line global-require
  WebView = require('react-native-webview').WebView;
} catch (_) {
  WebView = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = scale(15);
const CARD_WIDTH = SCREEN_WIDTH - H_PADDING * 2;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);
const CARD_GAP = scale(10);
// Snap distance must include the gap or the row drifts out of alignment after
// a few swipes.
const SNAP = CARD_WIDTH + CARD_GAP;

// If the player has not reported "ready" by now, something is wrong that
// YouTube did not raise as an error event (no network, blocked script, a
// stream pulled mid-view). Show the fallback rather than a black box.
const READY_TIMEOUT_MS = 9000;

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/live\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

function thumbFor(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * The embed document.
 *
 * A WebView must load an HTML page that CONTAINS the player — pointing the
 * WebView's own top-level frame at youtube.com/embed/... gives the player no
 * framing context and it refuses to start ("Error 153"). That was fixed
 * previously and is preserved here.
 *
 * What is new: the IFrame Player API instead of a bare <iframe>, purely so the
 * page can report onError/onReady back to React Native. A silent failure is the
 * bug being fixed, so the player has to be able to speak.
 */
function playerHtml(videoId) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden;height:100%;}
      #p{position:absolute;top:0;left:0;width:100%;height:100%;}</style>
  </head>
  <body>
    <div id="p"></div>
    <script>
      function send(type, data) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
        }
      }
      function onYouTubeIframeAPIReady() {
        new YT.Player('p', {
          videoId: '${videoId}',
          playerVars: { playsinline: 1, autoplay: 1, modestbranding: 1, rel: 0, fs: 1 },
          events: {
            onReady: function (e) { send('ready'); try { e.target.playVideo(); } catch (_) {} },
            onError: function (e) { send('error', e.data); }
          }
        });
      }
      // If the API script itself cannot load, nothing above ever runs — report
      // that too instead of sitting on a black screen.
      window.addEventListener('error', function () { send('error', 'script'); });
    </script>
    <script src="https://www.youtube.com/iframe_api"></script>
  </body>
</html>`;
}

// YouTube's documented player error codes.
const EMBED_BLOCKED = [101, 150];

function LiveCard({ channel, isActive, t }) {
  const [state, setState] = useState('loading'); // loading | playing | failed
  const timerRef = useRef(null);

  const fail = useCallback(() => setState('failed'), []);

  useEffect(() => {
    if (!isActive || state !== 'loading') return undefined;
    timerRef.current = setTimeout(fail, READY_TIMEOUT_MS);
    return () => clearTimeout(timerRef.current);
  }, [isActive, state, fail]);

  // Leaving the card resets it, so coming back retries rather than showing a
  // stale failure.
  useEffect(() => {
    if (!isActive) setState('loading');
  }, [isActive]);

  const openOnYouTube = () => {
    Linking.openURL(`https://www.youtube.com/watch?v=${channel.videoId}`).catch(() => {});
  };

  const onMessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch (_) { return; }
    if (msg.type === 'ready') {
      clearTimeout(timerRef.current);
      setState('playing');
    } else if (msg.type === 'error') {
      clearTimeout(timerRef.current);
      fail();
    }
  };

  // The server already told us this channel forbids embedding — don't even
  // mount a player that is guaranteed to fail. Same treatment when this
  // install's native binary doesn't have react-native-webview compiled in
  // (see the guarded require above) — WebView would be null and rendering
  // it would crash instead of falling back.
  const cannotEmbed = channel.embeddable === false;
  const showFallback = cannotEmbed || state === 'failed' || !WebView;

  return (
    <View style={styles.card}>
      <View style={styles.playerWrap}>
        {showFallback ? (
          <TouchableOpacity style={styles.fallback} activeOpacity={0.85} onPress={() => { captureEvent('live_aarti_youtube_opened'); openOnYouTube(); }}>
            {!!channel.videoId && (
              <Image source={{ uri: channel.thumbnail || thumbFor(channel.videoId) }} style={styles.fallbackThumb} />
            )}
            <View style={styles.fallbackVeil} />
            <Ionicons name="logo-youtube" size={moderateScale(38)} color="#FF0000" />
            <Text style={styles.fallbackText}>
              {cannotEmbed ? t('liveAarti.cantPlayHere') : t('liveAarti.playbackFailed')}
            </Text>
            <View style={styles.fallbackBtn}>
              <Text style={styles.fallbackBtnText}>{t('liveAarti.watchOnYouTube')}</Text>
            </View>
          </TouchableOpacity>
        ) : isActive ? (
          <>
            <WebView
              source={{ html: playerHtml(channel.videoId), baseUrl: 'https://www.youtube.com' }}
              style={styles.player}
              onMessage={onMessage}
              onError={fail}
              onHttpError={fail}
              allowsFullscreenVideo
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />
            {state === 'loading' && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator color={COLORS.white} />
                <Text style={styles.loadingText}>{t('liveAarti.loading')}</Text>
              </View>
            )}
          </>
        ) : (
          // Off-screen card: a still image, never a second video decoder.
          <View style={styles.idle}>
            <Image source={{ uri: channel.thumbnail || thumbFor(channel.videoId) }} style={styles.fallbackThumb} />
            <View style={styles.fallbackVeil} />
            <Ionicons name="play-circle" size={moderateScale(44)} color={COLORS.white} />
          </View>
        )}

        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTagText}>{t('liveAarti.liveNow')}</Text>
        </View>
      </View>

      <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
      {!!channel.title && <Text style={styles.streamTitle} numberOfLines={1}>{channel.title}</Text>}
    </View>
  );
}

export default function LiveAartiSection() {
  const { t } = useContext(LanguageContext);
  const [channels, setChannels] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await Instance.get('/api/live-aarti/live');
        if (cancelled) return;
        const live = Array.isArray(res?.data?.channels) ? res.data.channels : [];
        if (live.length) {
          setChannels(live.filter((c) => c.videoId));
          return;
        }
        // Nothing live — honour the old single admin URL if one is still set,
        // so existing configuration keeps working.
        const fallbackId = extractYouTubeId(res?.data?.fallbackUrl);
        setChannels(fallbackId
          ? [{ id: 'fallback', name: t('liveAarti.title'), videoId: fallbackId, title: '', thumbnail: '', embeddable: true }]
          : []);
      } catch (_) {
        // Silent — the section simply stays hidden if the call fails.
      }
    };

    load();
    // A stream can start or end while Home is open. Cheap: one cached read.
    const poll = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed card is NOT removed from the row: dropping it would renumber every
  // card behind it mid-scroll, and its own "Watch on YouTube" fallback is more
  // use to the viewer than a card that vanishes.
  if (!channels.length) return null;

  const onScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('liveAarti.title')}</Text>
        {channels.length > 1 && (
          <Text style={styles.count}>{activeIndex + 1}/{channels.length}</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={styles.row}
        onMomentumScrollEnd={onScroll}
        onScrollEndDrag={onScroll}
        scrollEventThrottle={16}>
        {channels.map((c, i) => (
          <LiveCard key={c.id} channel={c} isActive={i === activeIndex} t={t} />
        ))}
      </ScrollView>

      {channels.length > 1 && (
        <View style={styles.dots}>
          {channels.map((c, i) => (
            <View key={c.id} style={[styles.dot, i === activeIndex && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: verticalScale(15) },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: H_PADDING, marginBottom: verticalScale(10),
  },
  title: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: COLORS.textDark },
  count: { fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: COLORS.lightGrey },

  row: { paddingHorizontal: H_PADDING },
  card: { width: CARD_WIDTH, marginRight: CARD_GAP },
  playerWrap: {
    width: CARD_WIDTH, height: CARD_HEIGHT,
    borderRadius: moderateScale(16), overflow: 'hidden', backgroundColor: '#000',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8,
  },
  player: { flex: 1, backgroundColor: '#000' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  loadingText: {
    color: COLORS.white, fontSize: moderateScale(11), fontFamily: 'Lato-Regular',
    marginTop: verticalScale(6),
  },

  idle: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: scale(14) },
  fallbackThumb: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  fallbackVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  fallbackText: {
    color: COLORS.white, fontSize: moderateScale(12), fontFamily: 'Lato-Regular',
    textAlign: 'center', marginTop: verticalScale(8),
  },
  fallbackBtn: {
    marginTop: verticalScale(10), backgroundColor: COLORS.white,
    borderRadius: moderateScale(20), paddingHorizontal: scale(14), paddingVertical: verticalScale(6),
  },
  fallbackBtnText: { color: '#000', fontSize: moderateScale(12), fontFamily: 'Lato-Bold' },

  liveTag: {
    position: 'absolute', top: verticalScale(9), left: scale(9),
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(200,30,30,0.92)', borderRadius: moderateScale(4),
    paddingHorizontal: scale(7), paddingVertical: verticalScale(3),
  },
  liveDot: {
    width: moderateScale(6), height: moderateScale(6), borderRadius: moderateScale(3),
    backgroundColor: COLORS.white, marginRight: scale(5),
  },
  liveTagText: { color: COLORS.white, fontSize: moderateScale(9.5), fontFamily: 'Lato-Bold', letterSpacing: 0.5 },

  channelName: {
    fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.textDark,
    marginTop: verticalScale(7),
  },
  streamTitle: { fontSize: moderateScale(11), fontFamily: 'Lato-Regular', color: COLORS.lightGrey, marginTop: 1 },

  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: verticalScale(8) },
  dot: {
    width: moderateScale(6), height: moderateScale(6), borderRadius: moderateScale(3),
    backgroundColor: '#D9CFC4', marginHorizontal: scale(3),
  },
  dotOn: { backgroundColor: COLORS.AstroMaroon, width: moderateScale(16) },
});
