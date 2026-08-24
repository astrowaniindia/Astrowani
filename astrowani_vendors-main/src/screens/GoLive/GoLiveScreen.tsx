import React, {useState, useEffect, useRef, useCallback, useContext} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
  FlatList,
  StatusBar,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCView,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import {SOCKET_URL} from '../../config/api';
import {COLORS} from '../../Theme/Colors';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {LanguageContext} from '../../context/LanguageContext';
import LanguageToggle from '../../components/LanguageToggle';

// Self-hosted TURN on the Astrowani VPS (76.13.243.165, coturn — set up 2026-08-14)
// is now the primary relay; OpenRelay's free public servers are kept only as a
// secondary fallback in case the VPS's coturn is ever unreachable.
const ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {urls: 'turn:76.13.243.165:3478', username: 'astrowani', credential: '23fc84a011212f5bc729bf9752961d2e'},
    {urls: 'turn:76.13.243.165:3478?transport=tcp', username: 'astrowani', credential: '23fc84a011212f5bc729bf9752961d2e'},
    {urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject'},
    {urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject'},
    {urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject'},
  ],
};

// Vendor live broadcaster — WebRTC mesh: keeps one RTCPeerConnection per viewer.
const GoLiveScreen = ({route, navigation}: any) => {
  const {t} = useContext(LanguageContext);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [feed, setFeed] = useState<any[]>([]); // comments + gift toasts
  const [muted, setMuted] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const astroIdRef = useRef<string>(route?.params?.astrologerId || '');
  const sessionIdRef = useRef<string>('');
  const socketRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const endingRef = useRef(false);

  const pushFeed = (item: any) =>
    setFeed(prev => [...prev.slice(-40), {...item, key: `${Date.now()}_${Math.random()}`}]);

  // Create a peer connection for one viewer and send them an offer.
  const addViewer = useCallback(async (viewerId: string) => {
    if (!localStreamRef.current || peersRef.current.has(viewerId)) return;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(viewerId, pc);
    setViewerCount(peersRef.current.size);

    localStreamRef.current.getTracks().forEach((t: any) => (pc as any).addTrack(t, localStreamRef.current));

    (pc as any).onicecandidate = (e: any) => {
      if (e.candidate) {
        socketRef.current?.emit('live_ice', {
          to: viewerId, viewerId, candidate: e.candidate, role: 'broadcaster',
          sessionId: sessionIdRef.current,
        });
      }
    };
    (pc as any).oniceconnectionstatechange = () => {
      const st = (pc as any).iceConnectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') removeViewer(viewerId);
    };

    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('live_offer', {
        viewerId, astrologerId: astroIdRef.current, sessionId: sessionIdRef.current, offer,
      });
    } catch (e) {
      console.log('[GoLive] offer error', e);
    }
  }, []);

  const removeViewer = useCallback((viewerId: string) => {
    const pc = peersRef.current.get(viewerId);
    if (pc) {
      try { pc.close(); } catch (_) {}
      peersRef.current.delete(viewerId);
      setViewerCount(peersRef.current.size);
    }
  }, []);

  const cleanup = useCallback(() => {
    peersRef.current.forEach(pc => { try { pc.close(); } catch (_) {} });
    peersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => t.stop());
      localStreamRef.current = null;
    }
    try { InCallManager.stop(); } catch (_) {}
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const authHeaders = useCallback(async () => {
    const token = await AsyncStorage.getItem('token');
    return token ? {Authorization: `Bearer ${token}`} : {};
  }, []);

  const endLive = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    const sessionId = sessionIdRef.current;
    socketRef.current?.emit('end_live', {sessionId, astrologerId: astroIdRef.current});
    try {
      const headers = await authHeaders();
      await axios.post(`${SOCKET_URL}/api/live/${sessionId}/end`, {}, {headers});
    } catch (_) {}
    cleanup();
    navigation.goBack();
  }, [cleanup, navigation, authHeaders]);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      // Resolve astrologer id
      if (!astroIdRef.current) {
        astroIdRef.current = (await AsyncStorage.getItem('astroId')) || '';
      }
      if (!astroIdRef.current) {
        Alert.alert(t('login.error'), t('goLive.sessionMissing'));
        navigation.goBack();
        return;
      }

      if (Platform.OS === 'android') {
        const perms = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        if (
          perms['android.permission.CAMERA'] !== 'granted' ||
          perms['android.permission.RECORD_AUDIO'] !== 'granted'
        ) {
          Alert.alert(t('goLive.permissionsRequired'), t('goLive.cameraMicRequired'));
          navigation.goBack();
          return;
        }
      }

      // Live broadcast defaults to loudspeaker. Use the force- variant on iOS so
      // the route survives InCallManager's own updateAudioRoute() recomputations,
      // which otherwise revert it from stale _forceSpeakerOn state on any audio
      // interruption mid-broadcast.
      try {
        InCallManager.start({media: 'video'});
        if (Platform.OS === 'ios') {
          InCallManager.setForceSpeakerphoneOn(true);
        } else {
          InCallManager.setSpeakerphoneOn(true);
        }
      } catch (_) {}

      const stream = await (mediaDevices as any).getUserMedia({
        audio: true,
        video: {facingMode: 'user', width: 720, height: 1280},
      });
      if (cancelled) { stream.getTracks().forEach((t: any) => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStreamURL((stream as any).toURL());

      // Start the live session on the backend
      let sessionId = '';
      try {
        const headers = await authHeaders();
        const resp = await axios.post(`${SOCKET_URL}/api/live/start`, {astrologerId: astroIdRef.current}, {headers});
        sessionId = resp.data?.sessionId;
      } catch (e: any) {
        const serverMsg = e?.response?.data?.message;
        Alert.alert(t('login.error'), serverMsg || t('goLive.couldNotStart'));
        navigation.goBack();
        return;
      }
      if (!sessionId) { navigation.goBack(); return; }
      sessionIdRef.current = sessionId;
      setIsLive(true);

      // Socket — broadcaster joins its personal room (for targeted signalling) + the live room.
      const socketToken = await AsyncStorage.getItem('token');
      const socket = io(SOCKET_URL, { auth: { token: socketToken } });
      socketRef.current = socket;
      socket.on('connect', () => {
        socket.emit('join_room', astroIdRef.current);
        socket.emit('live_join', {
          sessionId, astrologerId: astroIdRef.current, viewerId: astroIdRef.current, viewerName: 'host',
        });
      });

      socket.on('live_viewer_joined', (d: any) => { if (d?.viewerId && d.viewerId !== astroIdRef.current) addViewer(d.viewerId); });
      socket.on('live_answer', async (d: any) => {
        const pc = peersRef.current.get(d.viewerId);
        if (pc && d.answer) { try { await pc.setRemoteDescription(new RTCSessionDescription(d.answer)); } catch (_) {} }
      });
      socket.on('live_ice', async (d: any) => {
        if (d?.role === 'viewer') {
          const pc = peersRef.current.get(d.viewerId);
          if (pc && d.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); } catch (_) {} }
        }
      });
      socket.on('live_viewer_left', (d: any) => d?.viewerId && removeViewer(d.viewerId));
      socket.on('live_comment', (d: any) => pushFeed({type: 'comment', name: d.name, message: d.message}));
      socket.on('live_gift', (d: any) => pushFeed({type: 'gift', name: d.name, giftName: d.giftName, amount: d.amount}));
    };

    // setup() had no rejection handler: it awaits getUserMedia (the astrologer
    // publishes both camera and mic when going live), which rejects on an iOS
    // permission denial - the only place a denial surfaces there, since the
    // PermissionsAndroid pre-check is Android-only. Left unhandled it was an
    // unhandled rejection plus a broadcast that never starts and never says why.
    setup().catch((err: any) => {
      console.warn('[GoLive] setup failed:', err);
      if (cancelled) return;
      const detail = `${err?.name || ''} ${err?.message || ''}`;
      const isPermission = /NotAllowed|Permission|denied/i.test(detail);
      Alert.alert(
        // Reuses this screen's own permission strings rather than the call.*
        // ones, so the wording matches the Android pre-check alert above.
        isPermission ? t('goLive.permissionsRequired') : t('call.setupFailed'),
        isPermission ? t('goLive.cameraMicRequired') : t('call.setupFailedMsg'),
        [{text: t('common.ok'), onPress: () => navigation.goBack()}],
      );
    });
    return () => {
      cancelled = true;
      if (!endingRef.current) {
        socketRef.current?.emit('end_live', {sessionId: sessionIdRef.current, astrologerId: astroIdRef.current});
        authHeaders()
          .then((headers) => axios.post(`${SOCKET_URL}/api/live/${sessionIdRef.current}/end`, {}, {headers}))
          .catch(() => {});
      }
      cleanup();
    };
  }, [addViewer, removeViewer, cleanup, navigation, authHeaders]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
  };
  const flipCamera = () => {
    const vt = localStreamRef.current?.getVideoTracks?.();
    if (vt && vt.length) { try { (vt[0] as any)._switchCamera(); } catch (_) {} }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {localStreamURL && (
        <RTCView streamURL={localStreamURL} style={StyleSheet.absoluteFillObject} objectFit="cover" mirror zOrder={0} />
      )}
      <View style={styles.scrim} pointerEvents="none" />
      <LanguageToggle dark style={styles.languageToggle} />

      {/* Top bar: LIVE + viewers + close */}
      <View style={styles.topBar}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{isLive ? t('goLive.live') : t('goLive.starting')}</Text>
        </View>
        <View style={styles.viewerPill}>
          <MaterialIcons name="visibility" size={16} color="#fff" />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={endLive}>
          <Text style={styles.endBtnText}>{t('goLive.end')}</Text>
        </TouchableOpacity>
      </View>

      {/* Comment / gift feed */}
      <FlatList
        style={styles.feed}
        data={feed}
        keyExtractor={i => i.key}
        renderItem={({item}) =>
          item.type === 'gift' ? (
            <View style={styles.giftRow}>
              <MaterialIcons name="card-giftcard" size={16} color={COLORS.AstroGold} />
              <Text style={styles.giftText}>{item.name || t('goLive.someone')} {t('goLive.sent')} {item.giftName} (₹{item.amount})</Text>
            </View>
          ) : (
            <View style={styles.commentRow}>
              <Text style={styles.commentName}>{item.name || t('goLive.guest')}: </Text>
              <Text style={styles.commentText}>{item.message}</Text>
            </View>
          )
        }
      />

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={toggleMute}>
          <MaterialIcons name={muted ? 'mic-off' : 'mic'} size={26} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={flipCamera}>
          <MaterialIcons name="flip-camera-android" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default GoLiveScreen;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  scrim: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)'},
  languageToggle: {top: 90},
  topBar: {
    position: 'absolute', top: 40, left: 16, right: 16, flexDirection: 'row', alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#C0392B',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  liveDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 6},
  liveText: {color: '#fff', fontWeight: 'bold', fontSize: 12, letterSpacing: 1},
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginLeft: 10,
  },
  viewerText: {color: '#fff', marginLeft: 4, fontWeight: 'bold'},
  endBtn: {
    marginLeft: 'auto', backgroundColor: COLORS.AstroMaroon, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
  },
  endBtnText: {color: '#fff', fontWeight: 'bold'},
  feed: {position: 'absolute', left: 16, right: 80, bottom: 110, maxHeight: 240},
  commentRow: {flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginTop: 6, alignSelf: 'flex-start', maxWidth: '100%'},
  commentName: {color: COLORS.AstroGold, fontWeight: 'bold', fontSize: 13},
  commentText: {color: '#fff', fontSize: 13, flexShrink: 1},
  giftRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(107,31,42,0.85)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, alignSelf: 'flex-start'},
  giftText: {color: '#fff', fontSize: 13, marginLeft: 6, fontWeight: '600'},
  controls: {position: 'absolute', bottom: 36, right: 16, alignItems: 'center'},
  ctrlBtn: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', marginVertical: 8,
  },
});
