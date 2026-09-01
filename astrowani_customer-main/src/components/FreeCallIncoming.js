// Incoming free-call screen — the customer side of the free 12-minute intro call.
//
// WHY THIS EXISTS: every other call in this app runs customer → astrologer. The
// customer app had no "someone is ringing you" UI at all; /api/call/initiate only
// works in that one direction. The free intro call is the reverse — the astrologer
// rings the customer, who does nothing but answer — so this is the missing half.
//
// Mount <FreeCallIncomingHost /> ONCE near the navigation root, alongside
// StatusPopupHost / ReviewPromptHost.
//
// Two ways a ring reaches us, because a scheduled call the customer is expecting
// must not be missed:
//   1. socket 'free_call_incoming' — the normal path, app open.
//   2. GET /api/free-call/incoming on mount and on every foreground — covers an app
//      that was killed and reopened from the push notification, which never saw the
//      socket event at all.
//
// Answering navigates to the SAME VoiceCallScreen a paid call uses, in freeCall
// mode. There is no second call screen and no second WebRTC implementation.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  AppState,
  Vibration,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import io from 'socket.io-client';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { SOCKET_URL } from '../config/api';
import { navigationRef } from '../utils/NavigationService';
import {useDeferredPresent, useModalPresence} from '../utils/modalPresentation';

// How long the ring stays on screen before it gives up on its own. The astrologer's
// side keeps ringing for as long as they hold the screen; this is only about not
// leaving a stale full-screen modal over the app if the call quietly went away.
const RING_TIMEOUT_MS = 60 * 1000;

export const FreeCallIncomingHost = () => {
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef(null);
  const timeoutRef = useRef(null);
  const pulse = useRef(new Animated.Value(1)).current;
  // Guards against the socket event and the recovery fetch both raising the same
  // call, and against a second ring arriving while one is already on screen.
  const shownRef = useRef(null);

  const clearRing = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    Vibration.cancel();
    shownRef.current = null;
    setCall(null);
    setBusy(false);
  }, []);

  const show = useCallback((data) => {
    if (!data?.sessionId || !data?.bookingId) return;
    if (shownRef.current === data.sessionId) return;
    shownRef.current = data.sessionId;
    setCall({
      bookingId: String(data.bookingId),
      sessionId: String(data.sessionId),
      astrologerId: String(data.astrologerId || ''),
      astrologerName: data.astrologerName || 'Astrologer',
      astrologerImage: data.astrologerImage || '',
      durationMinutes: Number(data.durationMinutes) || 12,
    });
    // A repeating pattern, not one buzz — the phone may be in a pocket and this is
    // a scheduled appointment the customer asked for.
    Vibration.vibrate([0, 600, 900], true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => clearRing(), RING_TIMEOUT_MS);
  }, [clearRing]);

  // ── Recovery: ask whether anyone is ringing right now ──────────────────────
  const checkIncoming = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`${SOCKET_URL}/api/free-call/incoming`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });
      if (res.data?.incoming) show(res.data.incoming);
    } catch (_) {
      // Silent on purpose: this runs on every launch and every foreground. A
      // failure here means "no ring", never a visible error.
    }
  }, [show]);

  // ── Socket: the normal path ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let socket = null;

    (async () => {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      if (cancelled || !token || !user?.id) return;

      socket = io(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;

      // Re-join on every connect, not just the first — a reconnect after a network
      // blip otherwise leaves us listening on nothing, which for an incoming call
      // means silently never ringing again.
      socket.on('connect', () => socket.emit('join_room', user.id));
      socket.on('free_call_incoming', show);
      // The astrologer gave up, or the call ended before we answered.
      socket.on('session_ended', (d) => {
        if (!d?.sessionId || d.sessionId === shownRef.current) clearRing();
      });
      // console.log, not console.error: a transient socket timeout must not throw a
      // dev redbox, same convention as the rest of this app.
      socket.on('connect_error', (e) => console.log('[FreeCallIncoming] socket:', e?.message));
    })();

    checkIncoming();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkIncoming();
    });

    return () => {
      cancelled = true;
      sub.remove();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      Vibration.cancel();
      if (socket) {
        socket.off('free_call_incoming', show);
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [show, clearRing, checkIncoming]);

  // ── Ring animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!call) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [call, pulse]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const accept = useCallback(() => {
    if (!call) return;
    const target = call;
    clearRing();
    // Same screen the paid calls use. freeCall only changes what is displayed and
    // adds the hard stop — the session is already priced at 0 server-side.
    if (navigationRef.isReady()) {
      navigationRef.navigate('VoiceCallScreen', {
        sessionId: target.sessionId,
        recieverName: target.astrologerName,
        recieverImage: target.astrologerImage,
        recieverId: target.astrologerId,
        freeCall: true,
        freeCallSeconds: target.durationMinutes * 60,
      });
    }
  }, [call, clearRing]);

  const decline = useCallback(async () => {
    if (!call || busy) return;
    setBusy(true);
    const target = call;
    // Dismiss immediately — the customer said no, so the UI should not sit there
    // waiting on a network round trip to agree with them.
    clearRing();
    try {
      const token = await AsyncStorage.getItem('token');
      await axios.post(
        `${SOCKET_URL}/api/free-call/${target.bookingId}/decline`,
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 },
      );
    } catch (e) {
      // The astrologer's screen will still time out and the backend sweep closes
      // the session, so a failed decline degrades rather than breaks.
      console.log('[FreeCallIncoming] decline failed:', e?.message);
    }
  }, [call, busy, clearRing]);

  // Root-level popup: this component sits BELOW any screen modal, so presenting
  // while one is up is exactly the case iOS refuses — see utils/modalPresentation.
  const ready = useDeferredPresent(!!call);
  useModalPresence(ready);

  if (!call) return null;

  const initial = (call.astrologerName || 'A').charAt(0).toUpperCase();

  return (
    <Modal visible={ready} transparent={false} animationType="slide" onRequestClose={decline}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Your free consultation</Text>
        <Text style={styles.subtitle}>{call.durationMinutes} minutes · no charge</Text>

        <Animated.View style={[styles.avatarWrap, { transform: [{ scale: pulse }] }]}>
          {call.astrologerImage ? (
            <Image source={{ uri: call.astrologerImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </Animated.View>

        <Text style={styles.name}>{call.astrologerName}</Text>
        <Text style={styles.ringing}>is calling you…</Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineBtn} onPress={decline} activeOpacity={0.85}>
            <MaterialIcons name="call-end" size={moderateScale(28)} color="#fff" />
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.acceptBtn} onPress={accept} activeOpacity={0.85}>
            <MaterialIcons name="call" size={moderateScale(28)} color="#fff" />
            <Text style={styles.actionLabel}>Answer</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.foot}>
          Keep your birth date, time and place handy — it makes the reading far more accurate.
        </Text>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    paddingTop: verticalScale(70),
    paddingHorizontal: scale(24),
  },
  eyebrow: {
    color: COLORS.AstroGold,
    fontSize: moderateScale(15),
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: moderateScale(12),
    marginTop: verticalScale(4),
  },
  avatarWrap: { marginTop: verticalScale(48) },
  avatar: {
    width: scale(132),
    height: scale(132),
    borderRadius: scale(66),
    borderWidth: 3,
    borderColor: 'rgba(255,215,0,0.55)',
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: moderateScale(46), fontWeight: '700' },
  name: {
    color: '#fff',
    fontSize: moderateScale(24),
    fontWeight: '700',
    marginTop: verticalScale(26),
    textAlign: 'center',
  },
  ringing: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: moderateScale(14),
    marginTop: verticalScale(6),
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: scale(20),
    marginTop: verticalScale(64),
  },
  acceptBtn: {
    backgroundColor: '#1DB954',
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    backgroundColor: '#C0392B',
    width: scale(96),
    height: scale(96),
    borderRadius: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontSize: moderateScale(12),
    fontWeight: '600',
    marginTop: verticalScale(4),
  },
  foot: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: moderateScale(11.5),
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: verticalScale(Platform.OS === 'ios' ? 40 : 28),
    lineHeight: moderateScale(17),
  },
});

export default FreeCallIncomingHost;
