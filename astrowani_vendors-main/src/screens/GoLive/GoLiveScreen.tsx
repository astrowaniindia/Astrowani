import React, {useState, useEffect, useRef, useCallback} from 'react';
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

const ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

// Vendor live broadcaster — WebRTC mesh: keeps one RTCPeerConnection per viewer.
const GoLiveScreen = ({route, navigation}: any) => {
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

  const endLive = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    const sessionId = sessionIdRef.current;
    socketRef.current?.emit('end_live', {sessionId, astrologerId: astroIdRef.current});
    try { await axios.post(`${SOCKET_URL}/api/live/${sessionId}/end`); } catch (_) {}
    cleanup();
    navigation.goBack();
  }, [cleanup, navigation]);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      // Resolve astrologer id
      if (!astroIdRef.current) {
        astroIdRef.current = (await AsyncStorage.getItem('astroId')) || '';
      }
      if (!astroIdRef.current) {
        Alert.alert('Error', 'Session missing. Please log in again.');
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
          Alert.alert('Permissions required', 'Camera and microphone are needed to go live.');
          navigation.goBack();
          return;
        }
      }

      try { InCallManager.start({media: 'video'}); InCallManager.setSpeakerphoneOn(true); } catch (_) {}

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
        const resp = await axios.post(`${SOCKET_URL}/api/live/start`, {astrologerId: astroIdRef.current});
        sessionId = resp.data?.sessionId;
      } catch (e) {
        Alert.alert('Error', 'Could not start live session.');
        navigation.goBack();
        return;
      }
      if (!sessionId) { navigation.goBack(); return; }
      sessionIdRef.current = sessionId;
      setIsLive(true);

      // Socket — broadcaster joins its personal room (for targeted signalling) + the live room.
      const socket = io(SOCKET_URL);
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

    setup();
    return () => { cancelled = true; if (!endingRef.current) { socketRef.current?.emit('end_live', {sessionId: sessionIdRef.current, astrologerId: astroIdRef.current}); axios.post(`${SOCKET_URL}/api/live/${sessionIdRef.current}/end`).catch(() => {}); } cleanup(); };
  }, [addViewer, removeViewer, cleanup, navigation]);

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

      {/* Top bar: LIVE + viewers + close */}
      <View style={styles.topBar}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{isLive ? 'LIVE' : 'STARTING…'}</Text>
        </View>
        <View style={styles.viewerPill}>
          <MaterialIcons name="visibility" size={16} color="#fff" />
          <Text style={styles.viewerText}>{viewerCount}</Text>
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={endLive}>
          <Text style={styles.endBtnText}>End</Text>
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
              <Text style={styles.giftText}>{item.name || 'Someone'} sent {item.giftName} (₹{item.amount})</Text>
            </View>
          ) : (
            <View style={styles.commentRow}>
              <Text style={styles.commentName}>{item.name || 'Guest'}: </Text>
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
