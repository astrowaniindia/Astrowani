// VendorChatSession.js — Vendor side active chat screen
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
  StatusBar,
  ImageBackground,
  ScrollView,
  AppState,
  Alert,
  BackHandler,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../Theme/Colors';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import Instance from '../api/ApiCall';
import useElapsedSeconds from '../utils/useElapsedSeconds';
import { captureEvent } from '../utils/Analytics';
import { showStatusPopup } from '../components/StatusPopup';
import { LanguageContext } from '../context/LanguageContext';
import { joinSessionWithRetry } from '../utils/sessionRoom';
import ReportCustomerSheet from '../components/ReportCustomerSheet';
import SessionConnectionNotice, { useSessionConnection } from '../components/SessionConnectionNotice';
import { showOngoingSession, hideOngoingSession } from '../utils/ongoingSession';

// Tap-to-send scripted openers shown above the message box for the astrologer.
const SCRIPTED_REPLIES = [
  'Welcome to Astrowani 🙏',
  'I am creating your chart…',
  'Your chart is created, now ask your question.',
];

const VendorChatSession = ({ route, navigation }) => {
  // startedAt is only sent when this screen is REOPENED into a chat already in progress
  // (activeSessionResume.js), so the timer shows the chat's real age instead of 00:00.
  const { requestId, callerName, callerId, perMinuteCharge, sessionId: initialSessionId, startedAt } = route.params;
  // Report/block, reachable DURING the conversation — the moment abuse happens is
  // the moment the astrologer needs this, not after the session has ended. Both
  // stores expect the reporting mechanism to sit with the content it is about.
  const [reportOpen, setReportOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { t } = useContext(LanguageContext);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  // Elapsed time is computed from a fixed start timestamp (not accumulated tick-by-tick)
  // so it can't drift/stick if the JS thread is throttled — see useElapsedSeconds.
  const [sessionStartMs, setSessionStartMs] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const seconds = useElapsedSeconds(sessionStartMs, timerActive);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [astroId, setAstroId] = useState(null);
  const [sentChip, setSentChip] = useState(null);

  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const sessionIdRef = useRef(initialSessionId);
  const astroIdRef = useRef(null);
  const pollMsgRef = useRef(null);
  const pollEndRef = useRef(null);
  const socketRef = useRef(null);
  // Live connection state for the in-chat notice (the hook waits for socketRef to be
  // filled in by init() below) plus the server's participant_absent/back events.
  const conn = useSessionConnection(socketRef, sessionId);

  // The server's end reasons are plain English log strings; translate the ones a person
  // will actually be shown rather than leaking them into a dialog.
  const endReasonText = (reason) => {
    if (reason === 'insufficient_balance') return t('call.customerBalanceEnded');
    if (typeof reason === 'string' && /lost connection|disconnected/i.test(reason)) {
      return t('call.connEndedMsg');
    }
    return reason;
  };
  const sessionJoinRef = useRef(null);
  const isEndingRef = useRef(false);
  const startMsRef = useRef(null);
  const typingTimerRef = useRef(null);

  const pad = (n) => n.toString().padStart(2, '0');
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  // ─── Keyboard height (Android) ───────────────────────────────────────────
  // targetSdk 36 is edge-to-edge, so on Android 15+ the OS ignores adjustResize and the
  // keyboard covered the input. KeyboardAvoidingView is not a fix here: its Android
  // padding also stuck after the keyboard closed, leaving a dead strip under the input.
  // So track the height ourselves and reset it on hide. (iOS still uses
  // KeyboardAvoidingView.) Verified on an Android 17 (API 37) emulator, Gboard docked.
  //
  // ⚠ CORRECTED: the assumption below used to be "if the window still resizes (older
  // Android) this computes to ~0, so nothing is added twice" — measured wrong on a real
  // (non-edge-to-edge-enforced) phone: `Dimensions.get('window')` had not yet reflected
  // the OS's own resize at the instant keyboardDidShow fired (it updates on a different
  // tick), so this still computed a real, nonzero height and added it ON TOP of the
  // resize the OS had already done. That is what showed as a dead gap between the input
  // and the real keyboard, with the chat list squeezed down to nothing in the doubly-
  // shrunk remaining space — exactly the bug reported 2026-09-28. Now detected
  // explicitly: compare against the window height last seen with the keyboard closed,
  // and skip our own compensation whenever the OS has already shrunk the window.
  // WHETHER we need to pad at all depends on the device, and it MUST be measured, not
  // assumed. Two behaviours exist in the field and they need opposite handling:
  //
  //   * Android 15+/edge-to-edge enforced: the IME simply covers the app. Our own layout
  //     area keeps its full height, so we have to reserve the keyboard's space ourselves
  //     or the input row sits underneath the keyboard.
  //   * Android 14 and below (a Redmi 12C, most budget phones in the field): the OS/RN
  //     already shrinks the layout area for the IME. Reserving it again counts the
  //     keyboard TWICE — which is the bug reported 2026-09-28: the message list collapsed
  //     to a sliver, the input row floated up near the header, and a dead brown gap sat
  //     between it and the real keyboard.
  //
  // Measured on an Android 14 / 720x1650 / 320dpi emulator matching a Redmi 12C: window
  // stays 801dp with the keyboard up (it never resizes, so watching `Dimensions` can
  // never tell these two cases apart — that is why the previous two attempts failed),
  // while the ROOT VIEW shrinks 777 -> 526dp and the keyboard's top is at screenY 526.
  // The root already ends exactly at the keyboard. So the root view's own height is the
  // signal, and it is the one thing that directly reflects whichever behaviour applies.
  const [kbHeight, setKbHeight] = useState(0);
  const rootHeightRef = useRef(0);
  const kbRef = useRef({ visible: false, screenY: 0 });
  // Debounce settle timer — see the comment on scheduleRecomputeKbPad for why this exists.
  const kbSettleRef = useRef(null);

  // Padding is NOT applied to the root view, so this cannot feed back into its height.
  const recomputeKbPad = (rootHeight) => {
    if (Platform.OS !== 'android') return;
    const { visible, screenY } = kbRef.current;
    if (!visible || !screenY) { setKbHeight(0); return; }
    const win = Dimensions.get('window').height;
    const scr = Dimensions.get('screen').height;
    // A root much shorter than the window means the OS already made room for the IME.
    // The 60dp threshold sits well above ordinary status/nav chrome (~48dp) and well
    // below any real keyboard (~275dp), so it cannot confuse the two.
    const osHandled = rootHeight > 0 && win - rootHeight > 60;
    // Screen-relative, NOT window-relative: the window excludes the nav bar, which left
    // the input row clipped by exactly that inset on the devices that do need padding.
    setKbHeight(osHandled ? 0 : Math.max(0, scr - screenY));
  };

  // On a device where the OS resizes the layout for the keyboard (Android 14 and below),
  // `keyboardDidShow` and the resulting root `onLayout` are two SEPARATE events that can
  // arrive in either order. Reported 2026-09-28: the input row visibly jumped up and
  // snapped back on every keyboard open — measured cause was `keyboardDidShow` firing
  // BEFORE the root's layout pass caught up to the resize, so `recomputeKbPad` briefly ran
  // against the OLD (pre-resize) root height, read that as "OS hasn't resized", and added
  // padding for one frame — then the root's own `onLayout` fired a moment later with the
  // new height and pulled it back out. Both computations were individually correct for the
  // rootHeight they were given; the bug was applying the FIRST one before the second had a
  // chance to land. Debouncing so only the value from whichever event arrives LAST actually
  // reaches `setKbHeight` means the wrong intermediate state is never rendered at all.
  const scheduleRecomputeKbPad = () => {
    if (kbSettleRef.current) clearTimeout(kbSettleRef.current);
    kbSettleRef.current = setTimeout(() => {
      kbSettleRef.current = null;
      recomputeKbPad(rootHeightRef.current);
    }, 48);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const c = e.endCoordinates || {};
      kbRef.current = { visible: true, screenY: c.screenY || 0 };
      scheduleRecomputeKbPad();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbRef.current = { visible: false, screenY: 0 };
      // Hiding is unambiguous either way, so it applies immediately and cancels anything
      // still pending — a stale "show" computation must never land after this.
      if (kbSettleRef.current) { clearTimeout(kbSettleRef.current); kbSettleRef.current = null; }
      setKbHeight(0);
    });
    const dims = Dimensions.addEventListener('change', () => {
      scheduleRecomputeKbPad();
    });
    return () => {
      show.remove(); hide.remove(); dims.remove();
      if (kbSettleRef.current) clearTimeout(kbSettleRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The list shrinks when the keyboard opens but keeps its scroll offset, which left
  // the newest message hidden behind the input. Keep the end in view.
  useEffect(() => {
    const id = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [kbHeight]);

  // ─── App in background / foreground ──────────────────────────────────────
  // Pressing Home or switching apps mid-chat tells the server, which then keeps the
  // chat open (billing as normal) for up to 5 minutes even if the phone puts the app
  // to sleep, instead of ending it 45s after the connection drops. Coming back clears
  // it. If the socket is disconnected meanwhile, socket.io sends the event on reconnect.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (!sessionIdRef.current || !socketRef.current) return;
      if (next === 'background' || next === 'active') {
        socketRef.current.emit('session_app_state', { sessionId: sessionIdRef.current, state: next });
      }
    });
    return () => sub.remove();
  }, []);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const id = await AsyncStorage.getItem('astroId');
      setAstroId(id);
      astroIdRef.current = id;

      // Socket setup
      const authToken = await AsyncStorage.getItem('token');
      socketRef.current = io(SOCKET_URL, { auth: { token: authToken } });

      // Re-join on every reconnect (brief network drop, app quickly backgrounded then
      // resumed), not just the initial join below — the backend's session-abandon grace
      // timer (index.js) only cancels once this fires, so without it a real reconnect
      // would still get treated as an abandoned session and end a perfectly live chat.
      // Live messages, typing and session_ended all travel through the session room, so a
      // join that silently failed left the chat looking connected while nothing arrived.
      // joinSessionWithRetry keeps trying until the server acks, and re-joins on reconnect.
      const joinRoom = (sid) => {
        if (!sid) return;
        if (sessionJoinRef.current) sessionJoinRef.current.stop();
        sessionJoinRef.current = joinSessionWithRetry(socketRef.current, sid, { label: 'Vendor/Chat' });
      };

      socketRef.current.on('connect', () => {
        if (!sessionIdRef.current) return;
        // Tell the server which state we are in after every (re)connect, so the
        // background window started while we were asleep is cleared once back.
        socketRef.current.emit('session_app_state', {
          sessionId: sessionIdRef.current,
          state: AppState.currentState === 'active' ? 'active' : 'background',
        });
        // Pick up anything the customer sent while we were disconnected.
        refetchMessages();
      });

      let finalSessionId = initialSessionId;

      // Get session if not passed
      if (!finalSessionId) {
        const { data } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('request_id', requestId)
          .single();
        if (data?.id) finalSessionId = data.id;
      }

      if (finalSessionId) {
        setSessionId(finalSessionId);
        sessionIdRef.current = finalSessionId;

        // Socket signaling
        joinRoom(finalSessionId);
        socketRef.current.emit('signal_connection', { sessionId: finalSessionId });

        socketRef.current.on('session_ended', (data) => {
          console.log('Session terminated via socket:', data.reason);
          endSessionLocal(endReasonText(data.reason));
        });

        // Load existing messages.
        //
        // Via the backend, not Supabase directly: the publishable key in this APK no
        // longer has SELECT on chat_messages (hardening_09), because it could read
        // every consultation on the platform, not just this one. The endpoint checks
        // that the caller is actually a participant of this session.
        try {
          const token = await AsyncStorage.getItem('token');
          const res = await Instance.get('/api/chat/messages', {
            params: { sessionId: finalSessionId },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.data?.data) setMessages(res.data.data);
        } catch (histErr) {
          // History is not worth failing the session over — live messages still arrive
          // over the socket below, so an empty backlog degrades rather than blocking.
          console.log('Failed to load chat history:', histErr?.message);
        }

        // Live message delivery + typing indicator over the socket's session room
        // (already joined above for signal_connection/session_ended) instead of a
        // direct Supabase Realtime subscription — see /api/chat/message's comment
        // in the backend for why no Realtime subscription is structurally needed.
        socketRef.current.on('new_chat_message', (msg) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
        socketRef.current.on('chat_typing', ({ isTyping }) => {
          setCustomerTyping(isTyping);
          // If the customer drops mid-typing no "stopped" event ever arrives and the
          // indicator would stay on forever; expire it.
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          if (isTyping) typingTimerRef.current = setTimeout(() => setCustomerTyping(false), 6000);
        });

          // Check if Customer ended the chat
          pollEndRef.current = setInterval(async () => {
            if (!sessionIdRef.current) return;
            const { data: checkSess } = await supabase
              .from('chat_sessions')
              .select('ended_at')
              .eq('id', sessionIdRef.current)
              .single();
            if (checkSess?.ended_at) {
              endSessionLocal();
            }
          }, 5000);
      }

      // Start timer — from the chat's real start when resuming, else now.
      const parsedStart = startedAt ? new Date(startedAt).getTime() : NaN;
      const startMs = Number.isFinite(parsedStart) ? parsedStart : Date.now();
      startMsRef.current = startMs;
      setSessionStartMs(startMs);
      setTimerActive(true);

      // Ongoing "chat in progress" notification + (on a current build) a foreground
      // service so the chat survives the astrologer switching apps. Cleared in
      // endSessionLocal, or by the server's session_ended push if the app was away.
      if (finalSessionId) {
        showOngoingSession({
          kind: 'chat',
          sessionId: finalSessionId,
          title: t('ongoing.chatTitle'),
          body: t('ongoing.chatBody', { name: callerName || t('common.customer') }),
        });
      }
      captureEvent('chat_started', { session_id: sessionIdRef.current });
    };

    init();

    return () => {
      // Refs are assigned by init() after this effect runs, so the cleanup must read the
      // latest .current — that is the point, not a stale-closure bug.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (pollMsgRef.current) clearInterval(pollMsgRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (sessionJoinRef.current) { sessionJoinRef.current.stop(); sessionJoinRef.current = null; }
      // Leaving on purpose (End button, or back after the confirm) goes through
      // endSession(), which has already told the backend and set isEndingRef. So the only
      // way to reach this cleanup WITHOUT that flag is the screen being torn down under
      // the astrologer: Android destroying the activity, a forced sign-out, a navigation
      // reset. That must NOT end their chat — this used to emit end_session here, which is
      // why a chat could vanish when the astrologer merely switched apps and Android
      // reclaimed the screen. Instead tell the server the app is away (5-minute window,
      // the same as pressing Home) and let activeSessionResume.js bring them back.
      if (socketRef.current) {
        if (sessionIdRef.current && !isEndingRef.current) {
          socketRef.current.emit('session_app_state', { sessionId: sessionIdRef.current, state: 'background' });
        }
        const sock = socketRef.current;
        setTimeout(() => sock.disconnect(), 300);
      }
    };
    // Run-once mount effect by design: sockets, timers and the back handler must not be
    // torn down and rebuilt when a re-render changes callerName or the callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSessionLocal = (reason) => {
    // The session can end from several places at once (End button, socket
    // session_ended, the 5s poll seeing ended_at). Without this guard each one called
    // goBack(), so a chat that ended two ways popped TWO screens.
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    captureEvent('chat_ended', {
      session_id: sessionIdRef.current,
      // A ref, not the sessionStartMs state: this is called from socket/poll handlers
      // created at mount, whose closure still holds the pre-start null.
      duration_seconds: startMsRef.current ? Math.round((Date.now() - startMsRef.current) / 1000) : 0,
    });
    hideOngoingSession(sessionIdRef.current);
    setTimerActive(false);
    if (pollMsgRef.current) clearInterval(pollMsgRef.current);
    if (pollEndRef.current) clearInterval(pollEndRef.current);

    if (reason) {
       showStatusPopup({ variant: 'info', title: t('call.sessionEnded'), message: reason });
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('DrawerNavigator');
    }
  };

  // ─── Message list helpers ─────────────────────────────────────────────────
  // Adds messages without duplicates, in time order. The send response, the live
  // socket event and the re-fetch after a reconnect can all deliver the same row.
  const mergeMessages = (incoming) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map();
      [...prev, ...incoming].forEach((m) => { if (m && m.id != null) byId.set(String(m.id), m); });
      return [...byId.values()].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
      );
    });
  };

  // Messages sent while the socket was disconnected are saved server-side but were
  // never pushed here — the socket only delivers while connected. Run on reconnect.
  const refetchMessages = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/chat/messages', {
        params: { sessionId: sid },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (Array.isArray(res.data?.data)) mergeMessages(res.data.data);
    } catch (err) {
      console.log('Chat re-fetch after reconnect failed:', err?.message);
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────
  const lastSentRef = useRef({ text: null, time: 0 });

  const sendMessage = async (overrideText) => {
    // overrideText is a string when fired by a scripted-reply chip; the bare
    // onPress handler passes a press event (object), so only treat strings as overrides.
    const raw = typeof overrideText === 'string' ? overrideText : newMessage;
    if (!raw.trim() || !sessionIdRef.current || !astroIdRef.current) return;
    const msg = raw.trim();

    // The server refuses a disconnected participant's message (SERVICE_PRESENCE_GRACE_MS in
    // index.js), so stop here rather than letting a scripted chip or a typed line vanish.
    // The notice above the input already says why.
    if (conn.blocked) {
      showStatusPopup({
        variant: 'error',
        title: t('call.connSendBlockedTitle'),
        message: t('call.connSendBlockedMsg'),
      });
      if (typeof overrideText !== 'string') setNewMessage((current) => (current ? current : msg));
      return;
    }

    // Scripted chips give no "sent" state, so a vendor unsure whether the tap registered
    // will tap again — guard against the same chip text firing twice in quick succession.
    const now = Date.now();
    if (lastSentRef.current.text === msg && now - lastSentRef.current.time < 2000) return;
    lastSentRef.current = { text: msg, time: now };

    // .clear() (not just setNewMessage('')) because Android's predictive-text keyboards
    // (Gboard) keep an internal "composing" span for the word just typed; clearing only
    // the JS-side value leaves that span in place and the keyboard silently re-inserts
    // the old text right after the state update, making an already-sent message look
    // stuck/unsent in the box.
    if (typeof overrideText !== 'string') {
      setNewMessage('');
      inputRef.current?.clear();
    }

    // Reset typing status on send
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionIdRef.current, isTyping: false });
    }


    // Row is created server-side now, not by the client — see
    // DATABASE_HARDENING_HANDOFF.md STEP 3. Realtime (unchanged) still delivers it to
    // both sides once inserted.
    //
    // A failed send used to be only a console.warn: the box was already cleared, so the
    // astrologer's message vanished with no sign it never reached the customer. Now a
    // failure puts typed text back and says so. A success adds the saved row straight
    // from the response, so it shows even if the socket is mid-reconnect (deduped by id).
    const msgToken = await AsyncStorage.getItem('token');
    let pushText = msg; // what the customer's lock screen shows - the SAVED (masked) text
    try {
      const res = await Instance.post('/api/chat/message', {
        roomId: requestId,
        sessionId: sessionIdRef.current,
        receiverId: callerId,
        message: msg,
      }, {
        headers: msgToken ? { Authorization: `Bearer ${msgToken}` } : {},
      });
      if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || 'send failed');
      mergeMessages([res.data.data]);
      pushText = res.data.data.message || msg;
      // The server replaced a phone number / email / link with stars - say why.
      if (res.data.masked) {
        showStatusPopup({ variant: 'error', title: t('call.contactMaskedTitle'), message: t('call.contactMaskedMsg') });
      }
    } catch (e) {
      console.warn('chat message send error:', e?.message);
      // Let the same text be sent again straight away (the double-tap guard above
      // would otherwise swallow the retry for 2s).
      lastSentRef.current = { text: null, time: 0 };
      // Typed text goes back in the box; a scripted chip can simply be tapped again.
      if (typeof overrideText !== 'string') setNewMessage((current) => (current ? current : msg));
      // 409 NOT_CONNECTED is the service gate, not a network failure — "check your internet"
      // is the wrong thing to say when it was the CUSTOMER's connection that dropped.
      const code = e?.response?.data?.code;
      const gated = code === 'NOT_CONNECTED' || code === 'SESSION_ENDED';
      showStatusPopup({
        variant: 'error',
        title: gated ? t('call.connSendBlockedTitle') : t('call.sendFailedTitle'),
        message: gated ? t('call.connSendBlockedMsg') : t('call.sendFailedMsg'),
      });
      return; // no push for a message that was never saved
    }

    // Fire-and-forget push notification for when the customer's app is backgrounded/killed.
    Instance.post('/api/push/notify-chat-message', {
      customerId: callerId,
      astrologerId: astroIdRef.current,
      message: pushText,
    }, {
      headers: msgToken ? { Authorization: `Bearer ${msgToken}` } : {},
    }).catch(() => {});
  };

  // ─── End session ──────────────────────────────────────────────────────────
  const endSession = async () => {
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('end_session', { sessionId: sessionIdRef.current });
    }
    // Reliable path if the socket is mid-reconnect (the emit above is then lost); idempotent.
    if (sessionIdRef.current) {
      Instance.post('/api/call/end', { sessionId: sessionIdRef.current })
        .catch((e) => console.log('[chat] end via HTTP failed:', e?.message));
    }
    endSessionLocal();
  };

  // Back (arrow, hardware button, gesture) and the red End button both confirm through the
  // themed StatusPopup — the default Android Alert looked nothing like the app. Back used to
  // end the chat on the spot, so a reflex back-press dropped a paying customer.
  const confirmEnd = () => {
    showStatusPopup({
      variant: 'missed',
      title: t('chat.endTitle'),
      message: t('chat.endMsg'),
      confirmText: t('call.end'),
      cancelText: t('common.cancel'),
      onConfirm: endSession,
    });
  };
  const confirmEndRef = useRef(confirmEnd);
  confirmEndRef.current = confirmEnd;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // A chat that has already ended has nothing left to protect; let back through.
      if (isEndingRef.current) return false;
      confirmEndRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleTyping = (text) => {
    setNewMessage(text);
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionIdRef.current, isTyping: text.length > 0 });
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = String(item.sender_id) === String(astroIdRef.current);
    const time = item.created_at 
      ? new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, isMine && styles.myBubbleText]}>
          {item.message}
        </Text>
        <View style={styles.timeContainer}>
          <Text style={[styles.timeText, isMine && styles.myTimeText]}>{time}</Text>
          {isMine && <Ionicons name="checkmark-done" size={14} color="#ffd" style={styles.readIcon} />}
        </View>
      </View>
    );
  };

  return (
    // NOT SafeAreaView. This screen applies the safe-area insets ITSELF —
    // insets.top here and insets.bottom on the input row below — and SafeAreaView
    // applies them again as its own padding, so both edges were counted twice
    // (~59pt top, ~34pt bottom on an iPhone 14 Pro). A plain View makes the manual
    // insets the single source of truth. Same defect Register.jsx had.
    <View
      // The root's measured height is what tells us whether the OS already made room for
      // the keyboard — see the comment on recomputeKbPad. Must stay on the OUTERMOST view.
      onLayout={(e) => {
        const l = e && e.nativeEvent && e.nativeEvent.layout;
        if (!l) { return; }
        const h = Math.round(l.height);
        if (h === rootHeightRef.current) { return; }
        rootHeightRef.current = h;
        // Debounced, not immediate — see scheduleRecomputeKbPad's comment. This can fire
        // before OR after keyboardDidShow; either order must settle to the same answer.
        scheduleRecomputeKbPad();
      }}
      style={[styles.safeArea, {paddingTop: insets.top}]}>
      <StatusBar backgroundColor={COLORS.AstroMaroon} barStyle="light-content" />
      {/* ── Header ─────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={confirmEnd}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerAvatarFallback}>
          <Ionicons name="person" size={20} color={COLORS.AstroMaroon} />
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.callerName} numberOfLines={1}>{callerName || t('common.customer')}</Text>
          {customerTyping ? (
            <Text style={[styles.charge, { color: '#88ffa8', fontStyle: 'italic' }]}>{t('call.typing')}</Text>
          ) : (
            <Text style={styles.charge}>{t('call.customerRate', {amount: perMinuteCharge})}</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setReportOpen(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={t('moderation.reportTitle')}>
          <Ionicons name="flag-outline" size={18} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>

        <TouchableOpacity style={styles.endBtn} onPress={confirmEnd}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.endText}>{t('call.end')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat + Input ────────────────────────── */}
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && {paddingBottom: kbHeight}]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <ImageBackground
          source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
          style={{ flex: 1 }}
          imageStyle={{ opacity: 0.15 }}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        </ImageBackground>

        {/* Scripted quick replies — tap to send the message to the customer */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.quickRow}
          contentContainerStyle={styles.quickRowContent}>
          {SCRIPTED_REPLIES.map((reply) => (
            <TouchableOpacity
              key={reply}
              style={[styles.quickChip, sentChip === reply && styles.quickChipSent]}
              activeOpacity={0.8}
              onPress={() => {
                sendMessage(reply);
                setSentChip(reply);
                setTimeout(() => setSentChip((c) => (c === reply ? null : c)), 1200);
              }}>
              {sentChip === reply && <Ionicons name="checkmark" size={14} color={COLORS.AstroMaroon} style={{ marginRight: 4 }} />}
              <Text style={styles.quickChipText} numberOfLines={1}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Connection notice — in the chat, above the input, never a popup. */}
        <SessionConnectionNotice conn={conn} t={t} />

        <View
          style={[styles.inputRow, {paddingBottom: (kbHeight > 0 ? 0 : insets.bottom) + 16}]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={t('call.messagePlaceholder')}
            placeholderTextColor="#999"
            value={newMessage}
            onChangeText={handleTyping}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, conn.blocked && { opacity: 0.45 }]}
            onPress={sendMessage}
            disabled={conn.blocked}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ReportCustomerSheet
        visible={reportOpen}
        customer={{ id: callerId, name: callerName }}
        onClose={() => setReportOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  flex: { flex: 1 },

  // Header
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    elevation: 4,
  },
  backBtn: { marginRight: 8, padding: 4 },
  headerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  reportBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 4,
  },
  headerInfo: { flex: 1, marginRight: 8 },
  callerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  charge: { color: COLORS.AstroGold, fontSize: 12, marginTop: 2 },
  timer: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  endBtn: {
    backgroundColor: '#ff4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    elevation: 2,
  },
  endText: { color: '#fff', marginLeft: 6, fontWeight: '700', fontSize: 14 },
  // Messages
  messagesList: {
    padding: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.AstroMaroon,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: '#2c3e50', fontSize: 15.5, lineHeight: 22 },
  myBubbleText: { color: '#fff' },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  timeText: { fontSize: 11, color: '#888', alignSelf: 'flex-end' },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },
  readIcon: { marginLeft: 4 },

  // Scripted quick replies
  quickRow: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    maxHeight: 52,
  },
  quickRowContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(107,31,42,0.08)',
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  quickChipSent: {
    backgroundColor: 'rgba(107,31,42,0.18)',
  },
  quickChipText: {
    color: COLORS.AstroMaroon,
    fontSize: 13,
    fontWeight: '600',
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
    color: '#333',
    marginRight: 10,
    backgroundColor: '#f9f9f9',
  },
  sendBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 25,
    width: 46,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
});

export default VendorChatSession;
