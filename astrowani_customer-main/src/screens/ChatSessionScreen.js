// ChatSessionScreen.js — Customer side
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
  StatusBar,
  BackHandler,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../api/SupabaseClient';
import { COLORS } from '../Theme/Colors';
import Instance from '../api/ApiCall';
import { showReviewPrompt } from '../components/ReviewPrompt';
import { showStatusPopup } from '../components/StatusPopup';
import Ionicons from 'react-native-vector-icons/Ionicons';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import { setActiveChatAstrologerId } from '../utils/PushNotification';
import useElapsedSeconds from '../hooks/useElapsedSeconds';
import { captureEvent } from '../utils/Analytics';
import { showActiveSessionNotification, hideActiveSessionNotification } from '../utils/activeSessionNotification';
import SessionIntroBanner from '../components/SessionIntroBanner';
import SessionConnectionNotice, { useSessionConnection } from '../components/SessionConnectionNotice';
import { LanguageContext } from '../context/LanguageContext';
import { joinSessionWithRetry } from '../utils/sessionRoom';

const ChatSessionScreen = ({ route, navigation }) => {
  const { requestId, person, sessionId: initialSessionId } = route.params;
  const insets = useSafeAreaInsets();
  const { t } = useContext(LanguageContext);

  const [session, setSession] = useState(null);
  // Elapsed time is computed from a fixed start timestamp (not accumulated tick-by-tick)
  // so it can't drift/stick if the JS thread is throttled — see useElapsedSeconds.
  const [sessionStartMs, setSessionStartMs] = useState(null);
  // Live connection state for the in-chat notice. Reads the socket created in init() below
  // (the hook waits for it) and the server's participant_absent/back events.
  const conn = useSessionConnection(socketRef, session?.id);

  // The server's end reasons are plain English strings written for logs
  // ("Customer left the session (app closed or lost connection)"). Show the person a
  // translated sentence instead of leaking one of those into a dialog.
  const endReasonText = (reason) => {
    if (reason === 'insufficient_balance') return t('chatSession.lowBalanceEnded');
    if (typeof reason === 'string' && /lost connection|disconnected/i.test(reason)) {
      return t('chatSession.connEndedMsg');
    }
    return reason;
  };
  const [chatActive, setChatActive] = useState(false);
  const seconds = useElapsedSeconds(sessionStartMs, chatActive);
  const [wallet, setWallet] = useState(0);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState(null);
  const [connecting, setConnecting] = useState(true);
  const [vendorTyping, setVendorTyping] = useState(false);

  const sessionRef = useRef(null);
  const walletRef = useRef(0);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);
  const hasEndedRef = useRef(false);
  const chatConnectedRef = useRef(false);
  const detailsSentRef = useRef(false);
  const pollRef = useRef(null);
  const pollEndRef = useRef(null);
  const socketRef = useRef(null);
  const sessionJoinRef = useRef(null);

  const pad = (n) => n.toString().padStart(2, '0');

  // ─── Load wallet balance via backend ─────────────────────────────────────
  const loadWallet = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      const res = await Instance.get('/api/wallet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        const bal = res.data.data.balance ?? 0;
        setWallet(bal);
        walletRef.current = bal;
      }
    } catch (e) {
      console.warn('loadWallet error:', e.message);
    }
  };

  // ─── Keyboard height (Android) ────────────────────────────────────────────
  // WHETHER we need to pad at all depends on the device, and it MUST be measured, not
  // assumed. Two behaviours exist in the field and they need opposite handling:
  //
  //   * Android 15+/edge-to-edge enforced: the IME simply covers the app. Our layout area
  //     keeps its full height, so we must reserve the keyboard's space ourselves or the
  //     input row ends up underneath the keyboard.
  //   * Android 14 and below (most budget phones in the field): the OS/RN already shrinks
  //     the layout area for the IME. Reserving it again counts the keyboard TWICE — the
  //     bug reported 2026-09-28 on the astrologer app: message list collapsed to a sliver,
  //     input row floated up near the header, dead gap between it and the real keyboard.
  //
  // Measured on an Android 14 / 720x1650 / 320dpi emulator: the window stays 801dp with
  // the keyboard up (it never resizes, so watching `Dimensions` can never tell the two
  // cases apart), while the ROOT VIEW shrinks 777 -> 526dp and the keyboard's top is at
  // screenY 526 — the root already ends exactly at the keyboard. So the root view's own
  // height is the signal. Same fix as the astrologer app's VendorChatSession, where it
  // was verified end to end. iOS keeps KeyboardAvoidingView.
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
    // the input row clipped by exactly that inset on devices that do need padding.
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
  // reaches `setKbHeight` means the wrong intermediate state is never rendered at all. Same
  // fix as the astrologer app's VendorChatSession, where it was verified end to end.
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
  // The list shrinks when the keyboard opens but keeps its offset; keep the newest message in view.
  useEffect(() => {
    const id = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [kbHeight]);

  // ─── End session ──────────────────────────────────────────────────────────
  const endSession = (message) => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    captureEvent('chat_ended', {
      session_id: sessionRef.current?.id,
      duration_seconds: sessionStartMs ? Math.round((Date.now() - sessionStartMs) / 1000) : 0,
      connected: chatConnectedRef.current,
    });

    setChatActive(false);
    hideActiveSessionNotification();
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollEndRef.current) clearInterval(pollEndRef.current);
    if (socketRef.current) socketRef.current.disconnect();

    const goBackOrHome = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('Home');
      }
      // Prompt for a review only if the chat actually connected.
      if (chatConnectedRef.current) {
        const astrologerId = person?._id || person?.userId;
        if (astrologerId) {
          showReviewPrompt({ astrologerId, name: person?.name, image: person?.profileImage });
        }
      }
    };

    if (message) {
      showStatusPopup({ variant: 'info', title: t('chatSession.sessionEnded'), message, onClose: goBackOrHome });
    } else {
      goBackOrHome();
    }
  };

  const manualEndSession = async () => {
    if (socketRef.current && sessionRef.current) {
        socketRef.current.emit('end_session', { sessionId: sessionRef.current.id });
        // The socket emit is lost if the socket is mid-reconnect (after a screen lock or a
        // network blip) because endSession() disconnects right after — and the astrologer's
        // side would then sit in a dead chat until the absence grace expires. The HTTP call
        // is the reliable path, exactly as the call screens already do; both are idempotent.
        Instance.post('/api/call/end', { sessionId: sessionRef.current.id })
          .catch((e) => console.log('[chat] end via HTTP failed:', e?.message));
    }
    endSession(null);
  }

  // Leaving this screen (back arrow or the hardware/gesture back button) must NOT
  // silently end the chat — the astrologer's side stays connected and billing keeps
  // running until the session is actually terminated, so the customer needs to
  // explicitly confirm before that happens. Same themed confirm as the call/video
  // screens' hardware-back handler (StatusPopup, variant 'endCall').
  const confirmEndChat = () => {
    if (hasEndedRef.current) { manualEndSession(); return; }
    showStatusPopup({
      variant: 'endCall',
      title: t('chatSession.endChatTitle'),
      message: t('chatSession.endChatMsg'),
      confirmText: t('chatSession.end'),
      cancelText: t('common.cancel'),
      onConfirm: manualEndSession,
    });
  };

  // ─── Auto first message: customer birth details → astrologer ───────────────
  //
  // Identifies the auto-sent details message when reading back history, so the send
  // gate below can ask "already sent?" instead of "is the chat empty?". Deliberately
  // excludes the leading emoji: this must match the text of messages ALREADY in the
  // database, and plain ASCII cannot be broken by an encoding difference.
  const DETAILS_MARKER = 'Namaste! Here are my details for the reading:';

  const sendCustomerDetails = async (sessionData, senderId) => {
    try {
      // Pull the latest profile from the backend, not a direct `customers` read —
      // that table carries every user's PII and Postgres GRANT is not row-scoped.
      // See DATABASE_HARDENING_HANDOFF.md §3.1/§3.2. senderId here is always the
      // logged-in customer's own id, so GET /api/users/profile (always "my own"
      // profile, resolved from the JWT) is the right replacement.
      let prof = null;
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await fetch(`${Instance.defaults.baseURL}/api/users/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = await res.json();
            prof = json?.data
              ? { name: json.data.name, dob: json.data.dob, time_of_birth: json.data.timeOfBirth, place_of_birth: json.data.placeOfBirth }
              : null;
          }
        }
      } catch (_) {}

      const fmtDate = (d) => {
        if (!d) return 'Not provided';
        try {
          return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (_) {
          return String(d);
        }
      };

      const details =
        `🙏 Namaste! Here are my details for the reading:\n\n` +
        `Full Name: ${prof?.name || person?.callerName || 'Not provided'}\n` +
        `Date of Birth: ${fmtDate(prof?.dob)}\n` +
        `Time of Birth: ${prof?.time_of_birth || 'Not provided'}\n` +
        `Place of Birth: ${prof?.place_of_birth || 'Not provided'}`;

      // Row is created server-side now, not by the client — see
      // DATABASE_HARDENING_HANDOFF.md STEP 3.
      const msgToken = await AsyncStorage.getItem('token');
      await fetch(`${Instance.defaults.baseURL}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
        },
        body: JSON.stringify({
          roomId: requestId,
          sessionId: sessionData.id,
          receiverId: person?._id || person?.id || person?.userId,
          message: details,
        }),
      });
    } catch (e) {
      console.warn('sendCustomerDetails error:', e.message);
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!text.trim() || !sessionRef.current || !myId) return;
    // The server refuses a disconnected participant's message (SERVICE_PRESENCE_GRACE_MS),
    // so stop here and leave what they typed in the box. The notice above the input is
    // already saying why — a send that silently did nothing is what made the 2026-10-01
    // outage invisible for an entire evening.
    if (conn.blocked) {
      showStatusPopup({
        variant: 'error',
        title: t('chatSession.connSendBlockedTitle'),
        message: t('chatSession.connSendBlockedMsg'),
      });
      return;
    }
    const msg = text.trim();
    // .clear() (not just setText('')) because Android's predictive-text keyboards keep
    // an internal "composing" span for the word just typed; clearing only the JS-side
    // value leaves that span in place and the keyboard silently re-inserts the old text
    // right after the state update, making an already-sent message look stuck/unsent.
    setText('');
    inputRef.current?.clear();

    // Reset typing status on send
    if (socketRef.current && sessionRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionRef.current.id, isTyping: false });
    }

    // Row is created server-side now, not by the client — see
    // DATABASE_HARDENING_HANDOFF.md STEP 3. The socket delivers it to both sides.
    //
    // A failed send used to be silent: the box was already cleared, fetch() does not
    // reject on an HTTP error, and nothing was caught — so the message simply vanished.
    // Now a failure puts the text back and says so. A success also adds the saved row
    // straight from the response, so the sender sees their own message even if the
    // socket happens to be mid-reconnect (the socket copy is deduped by id).
    try {
      const msgToken = await AsyncStorage.getItem('token');
      const res = await Instance.post('/api/chat/message', {
        roomId: requestId,
        sessionId: sessionRef.current.id,
        receiverId: person?._id || person?.id || person?.userId,
        message: msg,
      }, {
        headers: msgToken ? { Authorization: `Bearer ${msgToken}` } : {},
      });
      if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || 'send failed');
      mergeMessages([res.data.data]);
      // The server replaced a phone number / email / link with stars - say why.
      if (res.data.masked) {
        showStatusPopup({
          variant: 'error',
          title: t('chatSession.contactMaskedTitle'),
          message: t('chatSession.contactMaskedMsg'),
        });
      }
    } catch (e) {
      console.warn('chat message send error:', e?.message);
      // Don't overwrite anything typed since.
      setText((current) => (current ? current : msg));
      // 409 NOT_CONNECTED is the service gate, not a network failure — say the true reason
      // rather than "check your internet", which is wrong when the OTHER side dropped.
      const code = e?.response?.data?.code;
      const gated = code === 'NOT_CONNECTED' || code === 'SESSION_ENDED';
      showStatusPopup({
        variant: 'error',
        title: gated ? t('chatSession.connSendBlockedTitle') : t('chatSession.sendFailedTitle'),
        message: gated ? t('chatSession.connSendBlockedMsg') : t('chatSession.sendFailedMsg'),
      });
    }
  };

  // Adds messages to the list without duplicates, in time order. Used by the send
  // response, the live socket event, and the re-fetch after a reconnect — any of
  // which can deliver a message another one already did.
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

  // Messages that arrived while the socket was disconnected are saved server-side but
  // were never pushed to this screen — the socket only delivers while connected.
  // Called on every reconnect to fill that gap.
  const refetchMessages = async () => {
    const sid = sessionRef.current?.id;
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

  // ─── Hardware/gesture back button ────────────────────────────────────────
  // Mirrors VoiceCallScreen/VideoCallScreen's hardware-back confirm — see
  // confirmEndChat above for why this can't just let the default back happen.
  useEffect(() => {
    const bh = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmEndChat();
      return true;
    });
    return () => bh.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Initialise ───────────────────────────────────────────────────────────
  useEffect(() => {

    const init = async () => {
      // Get my user ID
      const userStr = await AsyncStorage.getItem('userData');
      const user = userStr ? JSON.parse(userStr) : null;
      const userId = user?._id || user?.id || user?.userId;
      setMyId(userId);

      await loadWallet();

      // Socket setup
      const authToken = await AsyncStorage.getItem('token');
      socketRef.current = io(SOCKET_URL, { auth: { token: authToken } });

      // Re-join on every reconnect (brief network drop, app quickly backgrounded then
      // resumed), not just the initial join below — the backend's session-abandon grace
      // timer (index.js) only cancels once this fires, so without it a real reconnect
      // would still get treated as an abandoned session and end a perfectly live chat.
      // Live messages, typing and session_ended all travel through the session room, so a
      // join that silently failed left the chat looking connected while nothing arrived.
      // joinSessionWithRetry keeps trying until the server acks and re-joins on reconnect.
      const joinRoom = (sid) => {
        if (!sid) return;
        if (sessionJoinRef.current) sessionJoinRef.current.stop();
        sessionJoinRef.current = joinSessionWithRetry(socketRef.current, sid, { label: 'Customer/Chat' });
      };

      socketRef.current.on('connect', () => {
        if (!sessionRef.current) return;
        // Pick up anything sent while we were disconnected.
        refetchMessages();
      });

      // ─── Find the session the astrologer's accept created ────────────────────
      //
      // WHY THIS IS NO LONGER A BARE SUPABASE READ (bug fixed 2026-09-30). This poll used
      // one direct Supabase select, guarded by an `isFetching` latch released only in
      // `finally`, with the give-up check sitting AFTER the await inside the same `try`.
      // Both halves of that could wedge, and the symptom was identical either way: the
      // customer stuck on "Waiting for astrologer to accept…" forever, no error, no way
      // out, while the astrologer was already chatting in the session.
      //
      //   * A request that never settled — a slow or half-open connection, precisely what
      //     this screen has to survive — left the latch true for good. Every later tick
      //     returned at the top, so the tick counter stopped advancing and the give-up
      //     check was never reached again.
      //   * A thrown error got there by the other route: the throw jumped straight past the
      //     give-up check to `finally`, so the deadline was never evaluated on any failing
      //     tick, however many of them there were.
      //
      // Three things make that unreachable now:
      //   * every attempt carries its own timeout, so the latch is always released;
      //   * the deadline is wall-clock and evaluated in `finally`, so it is honoured no
      //     matter how the attempt finished — resolved, threw, or timed out;
      //   * the backend is asked alongside Supabase. It answers from the service role and
      //     resolves the chat request's session itself, so it still works when the direct
      //     table read is slow, failing, or (per hardening_13's plan) eventually revoked.
      const ATTEMPT_TIMEOUT_MS = 4000;
      const CONNECT_DEADLINE_MS = 45000;
      const waitStartedAt = Date.now();
      // Separates "nobody picked up" from "they did, and we could not reach the session" —
      // two different messages, because only one of them is the customer's to retry.
      let sawAccepted = false;

      const withTimeout = (work, ms) =>
        Promise.race([
          Promise.resolve(work),
          new Promise((_, reject) => setTimeout(() => reject(new Error('attempt timed out')), ms)),
        ]);

      // Resolved by request_id, or straight by id when the waiting popup already learned it
      // (the accept response / socket / poll all carry the session id now).
      const findSessionViaSupabase = async () => {
        let query = supabase.from('chat_sessions').select('*');
        query = initialSessionId
          ? query.or(`id.eq.${initialSessionId},request_id.eq.${requestId}`)
          : query.eq('request_id', requestId);
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;
        return data || null;
      };

      // Only `id` is load-bearing downstream (the socket room, /api/chat/message,
      // sendCustomerDetails); `started_at` just anchors the timer and falls back to now.
      // So the id alone is enough to start the chat — we do not need the whole row.
      const findSessionViaBackend = async () => {
        if (!requestId) return null;
        const token = await AsyncStorage.getItem('token');
        if (!token) return null;
        const res = await Instance.get(`/api/requests/chat/${requestId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res?.data?.status === 'accepted') sawAccepted = true;
        const sid = res?.data?.sessionId;
        return sid ? { id: sid, request_id: requestId, started_at: null } : null;
      };

      // Both sources, every tick, first answer wins. allSettled rather than any/race so one
      // source being broken is simply ignored instead of rejecting the pair.
      const findSession = async () => {
        const results = await Promise.allSettled([
          withTimeout(findSessionViaSupabase(), ATTEMPT_TIMEOUT_MS),
          withTimeout(findSessionViaBackend(), ATTEMPT_TIMEOUT_MS),
        ]);
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) return r.value;
        }
        return null;
      };

      let isFetching = false;
      pollRef.current = setInterval(async () => {
        if (isFetching || sessionRef.current || hasEndedRef.current) return;
        isFetching = true;
        
        try {
          const data = await findSession();

          if (data && !sessionRef.current) {
            clearInterval(pollRef.current);
            setSession(data);
            sessionRef.current = data;
            setConnecting(false);

            // Socket signaling
            joinRoom(data.id);
            socketRef.current.emit('signal_connection', { sessionId: data.id });
            
            socketRef.current.on('session_ended', (termData) => {
              console.log('Session terminated via socket:', termData.reason);
              // Server codes are not customer copy: show a proper message for the one a customer
              // can act on (low wallet), pass anything else through.
              endSession(endReasonText(termData.reason));
            });

            // Start timer — anchored to the session's real start time so it can't drift.
            chatConnectedRef.current = true;
            setSessionStartMs(data.started_at ? new Date(data.started_at).getTime() : Date.now());
            setChatActive(true);
            // Persistent notification — billing keeps running even if the customer
            // backgrounds the app (e.g. presses the phone's Home button) without
            // actually ending the chat. See activeSessionNotification.js.
            showActiveSessionNotification({
              title: t('chatSession.inProgress'),
              message: t('chatSession.stillActive', { name: person?.name || person?.firstName || t('common.astrologer') }),
              screen: 'ChatSessionScreen',
              params: { requestId, person, sessionId: sessionRef.current?.id },
            });
            captureEvent('chat_started', { session_id: data.id });

            // Load existing messages.
            //
            // Via the backend, not Supabase directly: the publishable key in this APK
            // no longer has SELECT on chat_messages (hardening_09), because it could
            // read every consultation on the platform, not just this one. The endpoint
            // checks that the caller is actually a participant of this session.
            // Declared out here because the "first connect?" check further down reads
            // it to decide whether to auto-send the customer's birth details.
            let msgs = null;
            try {
              const token = await AsyncStorage.getItem('token');
              const res = await Instance.get('/api/chat/messages', {
                params: { sessionId: data.id },
                headers: { Authorization: `Bearer ${token}` },
              });
              if (res.data?.data) {
                msgs = res.data.data;
                setMessages(msgs);
              }
            } catch (histErr) {
              // History is not worth failing the session over — live messages still
              // arrive over the socket below, so an empty backlog degrades rather
              // than blocking the chat from starting.
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
              flatListRef.current?.scrollToEnd({ animated: true });
            });
            socketRef.current.on('chat_typing', ({ isTyping }) => {
              setVendorTyping(isTyping);
            });

            // Auto-send the customer's birth details so the astrologer has them up
            // front. Sent after subscribing so it also renders on the customer's own
            // screen via Realtime.
            //
            // The condition is "have my details already been sent in this session?",
            // NOT "is the chat empty?". It used to be the latter, and the astrologer's
            // own greeting suppressed it: the session goes active, this screen polls
            // once a second and then fetches history, and if the astrologer types
            // "Hello" inside that window their message is already in the response.
            // msgs.length was then 1, not 0, so the details were never sent at all and
            // the astrologer had to ask for a date of birth by hand. Observed in
            // production 2026-09-08: greeting at 20:13:00.203 on a session started at
            // 20:12:56.693 -- a 3.5s race the fetch only wins when the round trip is
            // quick. Whoever typed first decided it.
            //
            // Matching the marker rather than counting messages also means a reconnect
            // mid-session still will not duplicate them, and a FAILED history fetch
            // (msgs null) errs toward sending -- sending twice is recoverable, an
            // astrologer reading a chart without a birth date is not.
            const detailsAlreadySent = Array.isArray(msgs)
              && msgs.some((m) => String((m && m.message) || '').includes(DETAILS_MARKER));
            if (!detailsAlreadySent && !detailsSentRef.current) {
              detailsSentRef.current = true;
              await sendCustomerDetails(data, userId);
            }
          }

        } catch (e) {
          // Never fatal on its own — the next tick tries again, and the deadline below is
          // what actually decides to give up. Swallowing this quietly is the whole reason
          // the deadline is in `finally`: an attempt that throws must still count.
          console.log('[ChatSession] session lookup attempt failed:', e?.message);
        } finally {
          isFetching = false;

          // Wall clock, not a tick count: ticks are skipped whenever an attempt is still
          // in flight, so counting them understates how long the customer has actually
          // been staring at "Waiting for astrologer to accept…".
          if (!sessionRef.current && !hasEndedRef.current && Date.now() - waitStartedAt > CONNECT_DEADLINE_MS) {
            clearInterval(pollRef.current);
            // If the astrologer never accepted, that is the honest message. If they DID
            // accept and we still could not reach the session, say so instead of blaming
            // them for not picking up — and either way leave the screen rather than
            // sitting on it silently.
            endSession(sawAccepted ? t('chatSession.couldNotConnect') : t('chat.notPickedUp'));
          }
        }
      }, 1000);

          // Backstop only — the 'session_ended' socket listener registered above
          // (line ~257) is the primary path and fires immediately. This used to
          // poll every 5s for the entire session duration, which was a continuous
          // DB read doing the same job the socket event already does; kept at a
          // much longer interval purely as a fallback in case a socket event is
          // ever dropped, not as the normal detection path.
          pollEndRef.current = setInterval(async () => {
            if (hasEndedRef.current || !sessionRef.current) return;
            const { data: checkSess } = await supabase
              .from('chat_sessions')
              .select('ended_at')
              .eq('id', sessionRef.current.id)
              .single();
            if (checkSess?.ended_at) {
              endSession(t('chatSession.endedGeneric'));
            }
          }, 45000);

    };

    init();
    setActiveChatAstrologerId(person?._id || person?.userId);

    return () => {
      setActiveChatAstrologerId(null);
      hideActiveSessionNotification(); // safety net — harmless no-op if already hidden
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
      if (sessionJoinRef.current) { sessionJoinRef.current.stop(); sessionJoinRef.current = null; }
      // Leaving this screen any other way than the explicit End button (hardware back,
      // swipe-back gesture, navigating elsewhere) used to just disconnect the socket
      // without telling the backend — the session stayed active server-side and kept
      // billing the customer while the vendor's screen never learned it ended. Mirror
      // manualEndSession's emit here so every exit path terminates the session.
      if (!hasEndedRef.current && sessionRef.current && socketRef.current) {
        socketRef.current.emit('end_session', { sessionId: sessionRef.current.id });
        hasEndedRef.current = true;
        // Give the emit a moment to actually flush over the socket before we tear it
        // down — disconnecting in the same tick can drop the just-queued packet.
        setTimeout(() => socketRef.current && socketRef.current.disconnect(), 300);
      } else if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleTyping = (text) => {
    setText(text);
    if (socketRef.current && sessionRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionRef.current.id, isTyping: text.length > 0 });
    }
  };

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const renderMessage = ({ item }) => {
    const isMine = String(item.sender_id) === String(myId);
    const time = item.created_at 
      ? new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, isMine && styles.myBubbleText]}>{item.message}</Text>
        <View style={styles.timeContainer}>
          <Text style={[styles.timeText, isMine && styles.myTimeText]}>{time}</Text>
          {isMine && <Ionicons name="checkmark-done" size={14} color="#ffd" style={styles.readIcon} />}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      // This is the outermost view, so its measured height is what tells us whether the
      // OS already made room for the keyboard — see the comment on recomputeKbPad. The
      // paddingBottom below does not change this height (it is flex:1 against its
      // parent), so there is no feedback loop.
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
      style={[styles.container, {paddingTop: insets.top}, Platform.OS === 'android' && {paddingBottom: kbHeight}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Header: name + timer + wallet ─────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmEndChat} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        {person?.profileImage || person?.image ? (
          <FastImage source={{ uri: person?.profileImage || person?.image, priority: FastImage.priority.normal }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarFallback}>
            <Ionicons name="person" size={20} color={COLORS.AstroMaroon} />
          </View>
        )}

        <View style={styles.headerCenter}>
          <Text style={styles.astroName} numberOfLines={1}>{person?.name || person?.firstName || t('common.astrologer')}</Text>
          {vendorTyping ? (
            <Text style={[styles.charge, { color: '#88ffa8', fontStyle: 'italic' }]}>{t('chatSession.typing')}</Text>
          ) : session ? (
            <Text style={styles.charge}>₹{session.per_minute_charge}/min</Text>
          ) : (
            <Text style={styles.charge}>{t('chatSession.connecting')}</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>
          <TouchableOpacity style={styles.endBtn} onPress={confirmEndChat}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.endText}>{t('chatSession.end')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Messages ──────────────────────────── */}
      {connecting ? (
        <View style={styles.waiting}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
          <Text style={styles.waitingText}>{t('chatSession.waitingForAccept')}</Text>
        </View>
      ) : (
        <ImageBackground 
          source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }} 
          style={{ flex: 1 }} 
          imageStyle={{ opacity: 0.15 }}
        >
          {/* Prompt to share birth details first. Presentational only — billing is
              unchanged and starts when the session connects, exactly as before. */}
          <SessionIntroBanner />
          <FlatList
            ref={flatListRef}
            data={messages}
            style={{ flex: 1 }}
            keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        </ImageBackground>
      )}

      {/* Connection notice — in the chat, above the input, never a popup. */}
      {!connecting && <SessionConnectionNotice conn={conn} t={t} />}

      {/* ── Input ─────────────────────────────── */}
      {!connecting && (
        <View style={[styles.inputRow, {paddingBottom: (kbHeight > 0 ? 0 : insets.bottom) + 16}]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={handleTyping}
            placeholder={t('chatSession.messagePlaceholder')}
            placeholderTextColor="#aaa"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, conn.blocked && { opacity: 0.45 }]}
            onPress={sendMessage}
            disabled={conn.blocked}
          >
            <Ionicons name="send" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroMaroon,
  },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: { marginRight: 8, padding: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: COLORS.AstroGold },
  headerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, marginRight: 4 },
  astroName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  charge: { color: COLORS.AstroGold, fontSize: 12, marginTop: 2 },
  headerRight: { alignItems: 'center', flexDirection: 'row' },
  timer: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'], marginRight: 12 },
  endBtn: { backgroundColor: '#ff4444', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, elevation: 2 },
  endText: { color: '#fff', marginLeft: 4, fontWeight: '700', fontSize: 13 },
  walletBal: { color: '#ffd', fontSize: 12, marginTop: 2 },
  waiting: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  waitingText: { color: '#888', fontSize: 15 },
  messagesList: { padding: 12, paddingBottom: 20 },
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
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
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

export default ChatSessionScreen;
