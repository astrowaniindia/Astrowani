import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  StyleSheet,
  Text,
  Alert,
  TouchableOpacity,
  View,
  StatusBar,
  BackHandler,
  Platform,
  Animated,
  Easing,
  PermissionsAndroid,
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
import {SOCKET_URL} from '../config/api';
import {COLORS} from '../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface Props {
  route: any;
  navigation: any;
}

const ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

const EnxScreenVideo: React.FC<Props> = ({route, navigation}) => {
  const {
    sessionId = '',
    callerName = 'Customer',
    perMinuteCharge = 0,
    isFreeSession = false,
  } = route.params || {};

  const [isConnected, setIsConnected] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [remoteStreamURL, setRemoteStreamURL] = useState<string | null>(null);

  const isEndingRef = useRef(false);
  const isConnectedRef = useRef(false);
  const callDurationRef = useRef(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<any>(null);
  const iceCandidateBufferRef = useRef<any[]>([]);
  const readyRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<any>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => { callDurationRef.current = callDuration; }, [callDuration]);

  // ─── Animations ────────────────────────────────────────────────────────────
  const startRipple = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {toValue: 1.06, duration: 800, easing: Easing.ease, useNativeDriver: true}),
        Animated.timing(pulseAnim, {toValue: 1, duration: 800, easing: Easing.ease, useNativeDriver: true}),
      ]),
    ).start();
    const animRing = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true}),
          Animated.timing(anim, {toValue: 0, duration: 0, useNativeDriver: true}),
        ]),
      ).start();
    };
    animRing(ring1Anim, 0);
    animRing(ring2Anim, 800);
  }, [pulseAnim, ring1Anim, ring2Anim]);

  const stopRipple = useCallback(() => {
    pulseAnim.stopAnimation(); ring1Anim.stopAnimation(); ring2Anim.stopAnimation();
    pulseAnim.setValue(1); ring1Anim.setValue(0); ring2Anim.setValue(0);
  }, [pulseAnim, ring1Anim, ring2Anim]);

  // ─── Timer ──────────────────────────────────────────────────────────────────
  const startCallTimer = useCallback(() => {
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  // ─── WebRTC cleanup ─────────────────────────────────────────────────────────
  const cleanupWebRTC = useCallback(() => {
    if (readyRetryRef.current) { clearInterval(readyRetryRef.current); readyRetryRef.current = null; }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (_) {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => t.stop());
      try { (localStreamRef.current as any).release(); } catch (_) {}
      localStreamRef.current = null;
    }
    try { InCallManager.stop(); } catch (_) {}
  }, []);

  // ─── End Call ───────────────────────────────────────────────────────────────
  const doEndCall = useCallback(async () => {
    stopCallTimer();
    stopRipple();
    cleanupWebRTC();
    try {
      const jwt = await AsyncStorage.getItem('token');
      await axios.post(
        `${SOCKET_URL}/api/call/end`,
        {sessionId, duration: Math.ceil(callDurationRef.current / 60), rating: 5, feedback: 'Call ended'},
        {headers: {Authorization: `Bearer ${jwt}`}},
      );
    } catch (e) {
      console.log('[Vendor/Video] doEndCall error:', e);
    } finally {
      navigation.reset({index: 0, routes: [{name: 'DrawerNavigator'}]});
    }
  }, [sessionId, stopCallTimer, stopRipple, cleanupWebRTC, navigation]);

  const onPressDisconnect = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    doEndCall();
  }, [doEndCall]);

  // ─── Controls ───────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const next = !audioMuted;
    setAudioMuted(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
    }
  }, [audioMuted]);

  const toggleVideo = useCallback(() => {
    const next = !videoMuted;
    setVideoMuted(next);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t: any) => { t.enabled = !next; });
    }
  }, [videoMuted]);

  const flipCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        try { (videoTracks[0] as any)._switchCamera(); } catch (e) { console.log('[Vendor/Video] switchCamera error:', e); }
      }
    }
  }, []);

  const handleSpeakerToggle = useCallback(() => {
    const next = !speakerOn;
    setSpeakerOn(next);
    try { InCallManager.setSpeakerphoneOn(next); } catch (_) {}
  }, [speakerOn]);

  // ─── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const setupWebRTC = async () => {
      if (Platform.OS === 'android') {
        try {
          const perms = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.CAMERA,
          ]);
          const audioOk = perms[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
          const cameraOk = perms[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
          if (!audioOk || !cameraOk) {
            Alert.alert('Permission Required', 'Microphone and camera access are needed for video calls.', [
              {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
          }
        } catch (e) { console.warn('[Vendor/Video] Permission error:', e); }
      }
      if (cancelled) return;

      try { InCallManager.start({media: 'video'}); InCallManager.setSpeakerphoneOn(true); } catch (_) {}
      startRipple();

      const stream = await (mediaDevices as any).getUserMedia({
        audio: true,
        video: {facingMode: 'user', width: 640, height: 480},
      });
      if (cancelled) { stream.getTracks().forEach((t: any) => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStreamURL((stream as any).toURL());

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track: any) => (pc as any).addTrack(track, stream));

      (pc as any).ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          setRemoteStreamURL((event.streams[0] as any).toURL());
        }
      };

      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate && socketRef.current && sessionId) {
          socketRef.current.emit('webrtc_ice_candidate', {sessionId, candidate: event.candidate});
        }
      };

      (pc as any).oniceconnectionstatechange = () => {
        const state = (pc as any).iceConnectionState;
        console.log('[Vendor/Video] ICE state:', state);
        if (state === 'connected' || state === 'completed') {
          if (!isConnectedRef.current) {
            isConnectedRef.current = true;
            setIsConnected(true);
            stopRipple();
            startCallTimer();
            if (socketRef.current && sessionId) {
              socketRef.current.emit('signal_connection', {sessionId});
              console.log('[Vendor/Video] Emitted signal_connection for session:', sessionId);
            }
          }
        } else if (state === 'failed' || state === 'closed') {
          if (!isEndingRef.current) { isEndingRef.current = true; doEndCall(); }
        }
      };
    };

    const setupSocket = async () => {
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      // Join session room only — HomeScreen socket owns the personal room
      if (sessionId) socket.emit('join_session', sessionId);

      // Emit webrtc_ready periodically until offer arrives
      const emitReady = () => {
        if (socketRef.current && sessionId && !isEndingRef.current) {
          socketRef.current.emit('webrtc_ready', {sessionId});
        }
      };
      emitReady();
      readyRetryRef.current = setInterval(emitReady, 2000);

      socket.on('webrtc_offer', async (data: any) => {
        if (readyRetryRef.current) { clearInterval(readyRetryRef.current); readyRetryRef.current = null; }
        if (!pcRef.current || !data.offer) return;
        try {
          await (pcRef.current as any).setRemoteDescription(new RTCSessionDescription(data.offer));
          for (const c of iceCandidateBufferRef.current) {
            try { await (pcRef.current as any).addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
          }
          iceCandidateBufferRef.current = [];
          const answer = await (pcRef.current as any).createAnswer();
          await (pcRef.current as any).setLocalDescription(answer);
          socket.emit('webrtc_answer', {sessionId, answer: (pcRef.current as any).localDescription});
        } catch (e) { console.log('[Vendor/Video] offer/answer error:', e); }
      });

      socket.on('webrtc_ice_candidate', async (data: any) => {
        if (!pcRef.current || !data.candidate) return;
        if ((pcRef.current as any).remoteDescription) {
          try { await (pcRef.current as any).addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (_) {}
        } else {
          iceCandidateBufferRef.current.push(data.candidate);
        }
      });

      socket.on('session_ended', (data: any) => {
        if (data.sessionId && sessionId && data.sessionId !== sessionId) return;
        if (!isEndingRef.current) {
          console.log('[Vendor/Video] session_ended:', data.reason);
          isEndingRef.current = true;
          doEndCall();
        }
      });
    };

    setupWebRTC();
    setupSocket();

    const bh = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('End Call', 'Are you sure you want to end the call?', [
        {text: 'Cancel', style: 'cancel'},
        {text: 'End', style: 'destructive', onPress: onPressDisconnect},
      ], {cancelable: false});
      return true;
    });

    return () => {
      cancelled = true;
      bh.remove();
      stopCallTimer();
      stopRipple();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanupWebRTC();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const ring1Scale = ring1Anim.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]});
  const ring1Opacity = ring1Anim.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.45, 0.15, 0]});
  const ring2Scale = ring2Anim.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]});
  const ring2Opacity = ring2Anim.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.45, 0.15, 0]});

  const avatarInitial = callerName.charAt(0).toUpperCase();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Remote video full-screen background */}
      {isConnected && remoteStreamURL ? (
        <RTCView
          streamURL={remoteStreamURL}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.bgOverlay]} />
      )}

      {/* Connecting overlay shown before connected */}
      {!isConnected && (
        <View style={styles.connectingOverlay}>
          <View style={styles.header}>
            <Text style={styles.headerLabel}>VIDEO CALL</Text>
            {perMinuteCharge > 0 && <Text style={styles.rateLabel}>₹{perMinuteCharge}/min</Text>}
          </View>
          <View style={styles.centerContent}>
            <Animated.View style={[styles.ring, {transform: [{scale: ring1Scale}], opacity: ring1Opacity}]} />
            <Animated.View style={[styles.ring, {transform: [{scale: ring2Scale}], opacity: ring2Opacity}]} />
            <Animated.View style={[styles.avatarOuter, {transform: [{scale: pulseAnim}]}]}>
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              </View>
            </Animated.View>
            <Text style={styles.callerName}>{callerName}</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connecting...</Text>
            </View>
          </View>
        </View>
      )}

      {/* Connected header overlay */}
      {isConnected && (
        <View style={styles.connectedHeader}>
          <Text style={styles.connectedName}>{callerName}</Text>
          <View style={styles.statusPillSmall}>
            <View style={styles.statusDotGreen} />
            <Text style={styles.statusTextSmall}>{formatTime(callDuration)}</Text>
          </View>
          {isFreeSession ? (
            <View style={styles.freeBadge}>
              <Ionicons name="gift-outline" size={13} color="#7A5B00" />
              <Text style={styles.freeBadgeText}>Customer's free first consultation</Text>
            </View>
          ) : perMinuteCharge > 0 && (
            <View style={styles.billingBadge}>
              <Ionicons name="timer-outline" size={13} color={COLORS.AstroGold} />
              <Text style={styles.billingText}>₹{perMinuteCharge}/min • billing active</Text>
            </View>
          )}
        </View>
      )}

      {/* Local video PiP — plain container, no overflow/borderRadius/elevation */}
      {localStreamURL && (
        <View style={styles.localVideoPiP}>
          <RTCView
            streamURL={localStreamURL}
            style={styles.localStream}
            objectFit="cover"
            mirror={true}
            zOrder={1}
          />
        </View>
      )}
      {/* Decorative border overlay — separate from RTCView container */}
      <View style={styles.localVideoPiPBorder} pointerEvents="none" />

      {/* Controls bar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity style={[styles.ctrlBtn, audioMuted && styles.ctrlBtnRed]} onPress={toggleMute} activeOpacity={0.75}>
          <MaterialIcons name={audioMuted ? 'mic-off' : 'mic'} size={26} color={audioMuted ? '#FF3B30' : '#fff'} />
          <Text style={[styles.ctrlLabel, audioMuted && styles.ctrlLabelRed]}>{audioMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.ctrlBtn, videoMuted && styles.ctrlBtnRed]} onPress={toggleVideo} activeOpacity={0.75}>
          <MaterialIcons name={videoMuted ? 'videocam-off' : 'videocam'} size={26} color={videoMuted ? '#FF3B30' : '#fff'} />
          <Text style={[styles.ctrlLabel, videoMuted && styles.ctrlLabelRed]}>{videoMuted ? 'Video Off' : 'Video'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={onPressDisconnect} activeOpacity={0.8}>
          <MaterialIcons name="call-end" size={34} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={flipCamera} activeOpacity={0.75}>
          <MaterialIcons name="flip-camera-android" size={26} color="#fff" />
          <Text style={styles.ctrlLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnGold]} onPress={handleSpeakerToggle} activeOpacity={0.75}>
          <MaterialIcons name={speakerOn ? 'volume-up' : 'volume-down'} size={26} color={speakerOn ? COLORS.AstroGold : '#fff'} />
          <Text style={[styles.ctrlLabel, speakerOn && styles.ctrlLabelGold]}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const AVATAR_SIZE = 140;
const RING_BASE = AVATAR_SIZE + 40;
const PIP_WIDTH = 110;
const PIP_HEIGHT = 160;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  bgOverlay: {backgroundColor: '#1A0B05'},
  connectingOverlay: {flex: 1},
  header: {paddingTop: Platform.OS === 'ios' ? 58 : 44, alignItems: 'center', paddingBottom: 8, gap: 4},
  headerLabel: {fontSize: 11, fontWeight: '700', color: 'rgba(244,216,188,0.5)', letterSpacing: 3},
  rateLabel: {fontSize: 13, color: COLORS.AstroGold, fontWeight: '600', letterSpacing: 0.3},
  centerContent: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  ring: {
    position: 'absolute',
    width: RING_BASE,
    height: RING_BASE,
    borderRadius: RING_BASE / 2,
    borderWidth: 2,
    borderColor: COLORS.AstroSoftOrange,
  },
  avatarOuter: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.AstroSoftOrange,
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: COLORS.AstroSoftOrange,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarFallback: {flex: 1, backgroundColor: '#592a19', alignItems: 'center', justifyContent: 'center'},
  avatarInitial: {fontSize: 58, fontWeight: '700', color: COLORS.AstroSoftOrange},
  callerName: {fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 14, letterSpacing: 0.3},
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 8,
    marginBottom: 12,
  },
  statusDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.AstroSoftOrange},
  statusText: {fontSize: 15, color: COLORS.AstroSoftOrange, fontWeight: '500'},

  connectedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  connectedName: {fontSize: 20, fontWeight: '700', color: '#fff'},
  statusPillSmall: {flexDirection: 'row', alignItems: 'center', gap: 6},
  statusDotGreen: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#34C759'},
  statusTextSmall: {fontSize: 14, color: '#fff', fontWeight: '500', fontVariant: ['tabular-nums']},
  billingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,215,0,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
  },
  billingText: {fontSize: 12, color: COLORS.AstroGold, fontWeight: '500'},
  freeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  freeBadgeText: {fontSize: 12, color: '#7A5B00', fontWeight: '600'},

  // Plain container — NO overflow, NO borderRadius, NO elevation (ENX rule preserved for RTCView)
  localVideoPiP: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 130 : 120,
    right: 16,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    zIndex: 10,
  },
  localStream: {width: PIP_WIDTH, height: PIP_HEIGHT},
  // Separate border overlay — does NOT wrap RTCView container
  localVideoPiPBorder: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 130 : 120,
    right: 16,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    zIndex: 11,
  },

  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.12)',
    minWidth: 60,
    gap: 5,
  },
  ctrlBtnRed: {backgroundColor: 'rgba(255,59,48,0.2)'},
  ctrlBtnGold: {backgroundColor: 'rgba(255,215,0,0.12)'},
  ctrlLabel: {fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '500'},
  ctrlLabelRed: {color: '#FF3B30'},
  ctrlLabelGold: {color: COLORS.AstroGold},
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#FF3B30',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.55,
    shadowRadius: 14,
  },
});

export default EnxScreenVideo;
