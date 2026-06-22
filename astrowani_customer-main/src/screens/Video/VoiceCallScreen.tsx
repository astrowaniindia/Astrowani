import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  StyleSheet,
  Text,
  Alert,
  TouchableOpacity,
  View,
  Image,
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
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import {SOCKET_URL} from '../../config/api';
import {showReviewPrompt} from '../../components/ReviewPrompt';
import VectorIcon from '../../common/component/VectorIcon';
import color from '../../common/consts/color';

type CallState = 'connecting' | 'ringing' | 'in_call';

const AVATAR_SIZE = 140;
const RING_BASE = AVATAR_SIZE + 40;

const ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
  ],
};

const VoiceCallScreen = ({route, navigation}: any) => {
  const {
    sessionId: initialSessionId = '',
    recieverName = 'Astrologer',
    recieverImage = '',
    recieverId = '',
  } = route.params || {};

  const sessionIdRef = useRef(initialSessionId);

  const [callState, setCallState] = useState<CallState>('connecting');
  const [audioMuted, setAudioMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [ringCountdown, setRingCountdown] = useState(30);

  const callStateRef = useRef<CallState>('connecting');
  const isConnectedRef = useRef(false);
  const callDurationRef = useRef(0);
  const isEndingRef = useRef(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<any>(null);
  const iceCandidateBufferRef = useRef<any[]>([]);
  const vendorReadyHandledRef = useRef(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<any>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

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

  // ─── Timers ─────────────────────────────────────────────────────────────────
  const startCallTimer = useCallback(() => {
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stopRingCountdown = useCallback(() => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
  }, []);

  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  // ─── WebRTC cleanup ─────────────────────────────────────────────────────────
  const cleanupWebRTC = useCallback(() => {
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

  // ─── Call End ───────────────────────────────────────────────────────────────
  const doEndCall = useCallback(async () => {
    stopCallTimer();
    stopRingCountdown();
    stopRipple();
    cleanupWebRTC();
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        const jwt = await AsyncStorage.getItem('token');
        await axios.post(
          `${SOCKET_URL}/api/call/end`,
          {sessionId: sid, duration: Math.ceil(callDurationRef.current / 60), rating: 5, feedback: 'Call ended'},
          {headers: {Authorization: `Bearer ${jwt}`}},
        );
      } catch (e) {
        console.log('[VoiceCallScreen] doEndCall error:', e);
      }
    }
    navigation.replace('DrawerNavigator');
    // Prompt for a review only if the session actually connected.
    if (recieverId && callDurationRef.current > 0) {
      showReviewPrompt({ astrologerId: recieverId, name: recieverName, image: recieverImage });
    }
  }, [stopCallTimer, stopRingCountdown, stopRipple, cleanupWebRTC, navigation, recieverId, recieverName, recieverImage]);

  const startRingCountdown = useCallback(() => {
    ringTimerRef.current = setInterval(() => {
      setRingCountdown(c => {
        if (c <= 1) {
          clearInterval(ringTimerRef.current!);
          ringTimerRef.current = null;
          if (!isEndingRef.current) {
            isEndingRef.current = true;
            doEndCall();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [doEndCall]);

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

  const toggleSpeaker = useCallback(() => {
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
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Required', 'Microphone access is needed for audio calls.', [
              {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
          }
        } catch (e) { console.warn('[VoiceCallScreen] Permission error:', e); }
      }
      if (cancelled) return;

      try { InCallManager.start({media: 'audio'}); } catch (_) {}

      const stream = await (mediaDevices as any).getUserMedia({audio: true, video: false});
      if (cancelled) { stream.getTracks().forEach((t: any) => t.stop()); return; }
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach((track: any) => (pc as any).addTrack(track, stream));

      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate && socketRef.current && sessionIdRef.current) {
          socketRef.current.emit('webrtc_ice_candidate', {
            sessionId: sessionIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      (pc as any).oniceconnectionstatechange = () => {
        const state = (pc as any).iceConnectionState;
        console.log('[Customer/Voice] ICE state:', state);
        if (state === 'connected' || state === 'completed') {
          if (callStateRef.current !== 'in_call') {
            callStateRef.current = 'in_call';
            isConnectedRef.current = true;
            setCallState('in_call');
            stopRipple();
            stopRingCountdown();
            startCallTimer();
          }
        } else if (state === 'failed' || state === 'closed') {
          if (!isEndingRef.current) { isEndingRef.current = true; doEndCall(); }
        }
      };
    };

    const setupSocket = async () => {
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      if (user?.id) socket.emit('join_room', user.id);
      if (sessionIdRef.current) socket.emit('join_session', sessionIdRef.current);

      socket.once('call_accepted', (data: any) => {
        if (data.sessionId && !sessionIdRef.current) {
          sessionIdRef.current = data.sessionId;
          socket.emit('join_session', data.sessionId);
        }
      });

      // Vendor is ready — create and send WebRTC offer (handle only once)
      socket.on('webrtc_ready', async () => {
        if (vendorReadyHandledRef.current || !pcRef.current) return;
        vendorReadyHandledRef.current = true;
        try {
          const offer = await (pcRef.current as any).createOffer({});
          await (pcRef.current as any).setLocalDescription(offer);
          socket.emit('webrtc_offer', {
            sessionId: sessionIdRef.current,
            offer: (pcRef.current as any).localDescription,
          });
          callStateRef.current = 'ringing';
          setCallState('ringing');
          startRipple();
          startRingCountdown();
        } catch (e) {
          console.log('[Customer/Voice] createOffer error:', e);
        }
      });

      socket.on('webrtc_answer', async (data: any) => {
        if (!pcRef.current || !data.answer) return;
        try {
          await (pcRef.current as any).setRemoteDescription(new RTCSessionDescription(data.answer));
          for (const c of iceCandidateBufferRef.current) {
            try { await (pcRef.current as any).addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
          }
          iceCandidateBufferRef.current = [];
        } catch (e) { console.log('[Customer/Voice] setRemoteDescription error:', e); }
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
        if (data.sessionId && sessionIdRef.current && data.sessionId !== sessionIdRef.current) return;
        if (!isEndingRef.current) {
          console.log('[Customer/Voice] session_ended:', data.reason);
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
      stopRingCountdown();
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

  // ─── Derived UI ─────────────────────────────────────────────────────────────
  const ring1Scale = ring1Anim.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]});
  const ring1Opacity = ring1Anim.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.45, 0.15, 0]});
  const ring2Scale = ring2Anim.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]});
  const ring2Opacity = ring2Anim.interpolate({inputRange: [0, 0.5, 1], outputRange: [0.45, 0.15, 0]});

  const statusLabel =
    callState === 'connecting' ? 'Connecting...' :
    callState === 'ringing' ? `Ringing... ${ringCountdown}s` :
    formatTime(callDuration);

  const isActive = callState === 'in_call';
  const avatarInitial = recieverName.charAt(0).toUpperCase();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {recieverImage ? (
        <Image source={{uri: recieverImage}} style={StyleSheet.absoluteFillObject} blurRadius={22} />
      ) : null}
      <View style={[StyleSheet.absoluteFillObject, styles.bgOverlay]} />

      <View style={styles.header}>
        <Text style={styles.headerLabel}>AUDIO CALL</Text>
      </View>

      <View style={styles.centerContent}>
        {callState === 'ringing' && (
          <>
            <Animated.View style={[styles.ring, {transform: [{scale: ring1Scale}], opacity: ring1Opacity}]} />
            <Animated.View style={[styles.ring, {transform: [{scale: ring2Scale}], opacity: ring2Opacity}]} />
          </>
        )}

        <Animated.View style={[styles.avatarOuter, {transform: [{scale: callState === 'ringing' ? pulseAnim : 1}]}]}>
          {recieverImage ? (
            <Image source={{uri: recieverImage}} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </View>
          )}
        </Animated.View>

        <Text style={styles.callerName}>{recieverName}</Text>

        <View style={styles.statusPill}>
          <View style={[styles.statusDot, isActive && styles.statusDotGreen]} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.controlsBar}>
        <TouchableOpacity style={[styles.ctrlBtn, audioMuted && styles.ctrlBtnRed]} onPress={toggleMute} activeOpacity={0.75}>
          <VectorIcon name={audioMuted ? 'mic-off' : 'mic'} type="MaterialIcons" size={26} color={audioMuted ? '#FF3B30' : '#fff'} />
          <Text style={[styles.ctrlLabel, audioMuted && styles.ctrlLabelRed]}>{audioMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={onPressDisconnect} activeOpacity={0.8}>
          <VectorIcon name="call-end" type="MaterialIcons" size={34} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.ctrlBtn, speakerOn && styles.ctrlBtnGold]} onPress={toggleSpeaker} activeOpacity={0.75}>
          <VectorIcon name={speakerOn ? 'volume-up' : 'volume-down'} type="MaterialIcons" size={26} color={speakerOn ? color.AstroGold : '#fff'} />
          <Text style={[styles.ctrlLabel, speakerOn && styles.ctrlLabelGold]}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#1A0B05'},
  bgOverlay: {backgroundColor: 'rgba(26,11,5,0.78)'},
  header: {paddingTop: Platform.OS === 'ios' ? 58 : 44, alignItems: 'center', paddingBottom: 8},
  headerLabel: {fontSize: 11, fontWeight: '700', color: 'rgba(244,216,188,0.5)', letterSpacing: 3},
  centerContent: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  ring: {
    position: 'absolute',
    width: RING_BASE,
    height: RING_BASE,
    borderRadius: RING_BASE / 2,
    borderWidth: 2,
    borderColor: color.AstroSoftOrange,
  },
  avatarOuter: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: color.AstroSoftOrange,
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: color.AstroSoftOrange,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarImage: {width: '100%', height: '100%'},
  avatarFallback: {flex: 1, backgroundColor: '#592a19', alignItems: 'center', justifyContent: 'center'},
  avatarInitial: {fontSize: 58, fontWeight: '700', color: color.AstroSoftOrange},
  callerName: {fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 14, letterSpacing: 0.3},
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 8,
  },
  statusDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: color.AstroSoftOrange},
  statusDotGreen: {backgroundColor: '#34C759'},
  statusText: {fontSize: 15, color: color.AstroSoftOrange, fontWeight: '500', fontVariant: ['tabular-nums']},
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: Platform.OS === 'ios' ? 52 : 44,
    backgroundColor: 'rgba(89,42,25,0.55)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(244,216,188,0.2)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 72,
    gap: 6,
  },
  ctrlBtnRed: {backgroundColor: 'rgba(255,59,48,0.15)'},
  ctrlBtnGold: {backgroundColor: 'rgba(255,215,0,0.12)'},
  ctrlLabel: {fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500'},
  ctrlLabelRed: {color: '#FF3B30'},
  ctrlLabelGold: {color: color.AstroGold},
  endBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
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

export default VoiceCallScreen;
