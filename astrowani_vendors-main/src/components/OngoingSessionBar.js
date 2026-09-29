// A persistent bar pinned to the top of the Dashboard (HomeScreen) whenever the
// astrologer has a call, chat, or live stream still running server-side. Covers the
// case where they end up back on the dashboard while a session is still active — by
// mistake (backgrounded and the OS/launcher didn't restore the exact screen, a
// navigation reset, etc.) rather than by properly ending it — with no other way back
// in short of digging through notifications.
//
// Reuses GET /api/vendor/active-session (already built for activeSessionResume.js's
// auto-redirect-on-foreground / live-resume-popup) — this just adds an always-visible,
// tappable affordance on the dashboard itself, checked on every focus (not just app
// cold-start/foreground transitions) plus a light poll while the dashboard stays open.
//
// Call screens (AudioCall/VideoCall -> EnxScreenVoice.tsx/EnxScreenVideo.tsx)
// deliberately only read `sessionId`, `callerName` and `perMinuteCharge` from their
// route params — the `token` field is a historical leftover from the old EnableX
// integration and isn't used by either screen (both are plain react-native-webrtc
// today, negotiated fresh over the session's socket room on every mount, exactly as
// happens on a normal Accept). So re-entering with just those three fields is the
// same path Accept already takes, not a new/untested one.
import React, { useCallback, useContext, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import useElapsedSeconds from '../utils/useElapsedSeconds';
import { resumeActiveSession } from '../utils/activeSessionResume';

const POLL_MS = 20000; // cheap, indexed, LIMIT-5 query — fine to check often while the dashboard is open

function pad(n) {
  return String(n).padStart(2, '0');
}

const OngoingSessionBar = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [active, setActive] = useState(null); // { kind: 'call'|'chat'|'live', ...fields }
  const pollRef = useRef(null);

  const check = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await Instance.get('/api/vendor/active-session', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });
      const data = res.data;
      if (!data?.success) return;
      // Priority: an active billing session (call/chat) over a live stream — it's the
      // more time-sensitive thing to get back to. The two are mutually exclusive in
      // practice (busy-gating), so this ordering rarely matters in the first place.
      if (data.call) setActive({ kind: 'call', ...data.call });
      else if (data.chat) setActive({ kind: 'chat', ...data.chat });
      else if (data.live) setActive({ kind: 'live', ...data.live });
      else setActive(null);
    } catch (e) {
      // Silent — this is a convenience bar, not a critical path. A failed check just
      // means the bar doesn't show this time; it tries again on the next poll/focus.
      console.log('[OngoingSessionBar] check failed:', e?.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
      pollRef.current = setInterval(check, POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const startMs = active?.startedAt ? new Date(active.startedAt).getTime() : null;
  const elapsed = useElapsedSeconds(startMs, !!active);

  if (!active) return null;

  const name = active.callerName || t('common.customer');
  let icon = 'chatbubbles';
  let label = t('ongoingBar.chat', { name });
  if (active.kind === 'call') {
    icon = active.callType === 'video' ? 'videocam' : 'call';
    label = active.callType === 'video' ? t('ongoingBar.videoCall', { name }) : t('ongoingBar.audioCall', { name });
  } else if (active.kind === 'live') {
    icon = 'radio';
    label = t('ongoingBar.live');
  }

  const onPress = () => {
    if (active.kind === 'call') {
      const screen = active.callType === 'video' ? 'VideoCall' : 'AudioCall';
      navigation.navigate(screen, {
        sessionId: active.sessionId,
        callerName: active.callerName,
        perMinuteCharge: active.perMinuteCharge,
      });
    } else if (active.kind === 'chat') {
      navigation.navigate('VendorChatSession', {
        sessionId: active.sessionId,
        requestId: active.requestId,
        callerId: active.callerId,
        callerName: active.callerName,
        perMinuteCharge: active.perMinuteCharge,
        startedAt: active.startedAt,
      });
    } else {
      // Live can't silently reattach the camera/peer connections the old screen held —
      // this reuses the exact resume-or-end confirmation activeSessionResume.js already
      // shows on app-foreground, instead of a second copy of that logic here.
      resumeActiveSession();
    }
  };

  return (
    <TouchableOpacity style={styles.bar} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={styles.sub}>
          {active.kind !== 'live' ? `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)} · ` : ''}
          {t('ongoingBar.tapToReturn')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1D8B4E', // distinct green — "this is live/active right now", not a warning
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
  },
  iconWrap: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(10),
  },
  textWrap: { flex: 1 },
  label: { color: '#fff', fontWeight: '700', fontSize: moderateScale(13.5) },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(11.5), marginTop: 1 },
});

export default OngoingSessionBar;
