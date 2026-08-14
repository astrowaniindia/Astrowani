// ChatSessionScreen.js — Customer side
import React, { useEffect, useRef, useState } from 'react';
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
  StatusBar,
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

const ChatSessionScreen = ({ route, navigation }) => {
  const { requestId, person, sessionId: initialSessionId } = route.params;
  const insets = useSafeAreaInsets();

  const [session, setSession] = useState(null);
  // Elapsed time is computed from a fixed start timestamp (not accumulated tick-by-tick)
  // so it can't drift/stick if the JS thread is throttled — see useElapsedSeconds.
  const [sessionStartMs, setSessionStartMs] = useState(null);
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
  const hasEndedRef = useRef(false);
  const chatConnectedRef = useRef(false);
  const detailsSentRef = useRef(false);
  const pollRef = useRef(null);
  const pollEndRef = useRef(null);
  const socketRef = useRef(null);

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
      showStatusPopup({ variant: 'info', title: 'Session Ended', message, onClose: goBackOrHome });
    } else {
      goBackOrHome();
    }
  };

  const manualEndSession = async () => {
    if (socketRef.current && sessionRef.current) {
        socketRef.current.emit('end_session', { sessionId: sessionRef.current.id });
    }
    endSession(null);
  }

  // ─── Auto first message: customer birth details → astrologer ───────────────
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
    const msg = text.trim();
    setText('');
    
    // Reset typing status on send
    if (socketRef.current && sessionRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionRef.current.id, isTyping: false });
    }

    // Row is created server-side now, not by the client — see
    // DATABASE_HARDENING_HANDOFF.md STEP 3. Realtime (unchanged) still delivers it to
    // both sides once inserted.
    const msgToken = await AsyncStorage.getItem('token');
    await fetch(`${Instance.defaults.baseURL}/api/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
      },
      body: JSON.stringify({
        roomId: requestId,
        sessionId: sessionRef.current.id,
        receiverId: person?._id || person?.id || person?.userId,
        message: msg,
      }),
    });
  };

  // ─── Initialise ───────────────────────────────────────────────────────────
  useEffect(() => {
    let pollCount = 0;

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

      // Poll until session is created by vendor
      let isFetching = false;
      pollRef.current = setInterval(async () => {
        if (isFetching || sessionRef.current || hasEndedRef.current) return;
        isFetching = true;
        pollCount++;
        
        try {
          const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('request_id', requestId)
            .single();

          if (data && !error && !sessionRef.current) {
            clearInterval(pollRef.current);
            setSession(data);
            sessionRef.current = data;
            setConnecting(false);

            // Socket signaling
            socketRef.current.emit('join_session', data.id);
            socketRef.current.emit('signal_connection', { sessionId: data.id });
            
            socketRef.current.on('session_ended', (termData) => {
              console.log('Session terminated via socket:', termData.reason);
              endSession(termData.reason);
            });

            // Start timer — anchored to the session's real start time so it can't drift.
            chatConnectedRef.current = true;
            setSessionStartMs(data.started_at ? new Date(data.started_at).getTime() : Date.now());
            setChatActive(true);
            captureEvent('chat_started', { session_id: data.id });

            // Load existing messages
            const { data: msgs } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('session_id', data.id)
              .order('created_at', { ascending: true });
            if (msgs) setMessages(msgs);

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

            // On the very first connect (no prior messages), auto-send the customer's
            // birth details so the astrologer has them up front. Sent after subscribing
            // so it also renders on the customer's own screen via Realtime.
            if ((!msgs || msgs.length === 0) && !detailsSentRef.current) {
              detailsSentRef.current = true;
              await sendCustomerDetails(data, userId);
            }
          }

          if (pollCount > 30 && !sessionRef.current) {
            clearInterval(pollRef.current);
            endSession('Session could not be started.');
          }
        } finally {
          isFetching = false;
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
              endSession('The astrologer has ended the session.');
            }
          }, 45000);

    };

    init();
    setActiveChatAstrologerId(person?._id || person?.userId);

    return () => {
      setActiveChatAstrologerId(null);
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
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
      style={[styles.container, {paddingTop: insets.top}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Header: name + timer + wallet ─────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={manualEndSession} style={styles.backBtn}>
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
          <Text style={styles.astroName} numberOfLines={1}>{person?.name || person?.firstName || 'Astrologer'}</Text>
          {vendorTyping ? (
            <Text style={[styles.charge, { color: '#88ffa8', fontStyle: 'italic' }]}>typing...</Text>
          ) : session ? (
            <Text style={styles.charge}>₹{session.per_minute_charge}/min</Text>
          ) : (
            <Text style={styles.charge}>Connecting…</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>
          <TouchableOpacity style={styles.endBtn} onPress={manualEndSession}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.endText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Messages ──────────────────────────── */}
      {connecting ? (
        <View style={styles.waiting}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
          <Text style={styles.waitingText}>Waiting for astrologer to accept…</Text>
        </View>
      ) : (
        <ImageBackground 
          source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }} 
          style={{ flex: 1 }} 
          imageStyle={{ opacity: 0.15 }}
        >
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

      {/* ── Input ─────────────────────────────── */}
      {!connecting && (
        <View style={[styles.inputRow, {paddingBottom: insets.bottom + 16}]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleTyping}
            placeholder="Type a message…"
            placeholderTextColor="#aaa"
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
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
