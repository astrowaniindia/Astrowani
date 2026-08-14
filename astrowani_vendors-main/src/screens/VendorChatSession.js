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
  SafeAreaView,
  StatusBar,
  ImageBackground,
  ScrollView,
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

// Tap-to-send scripted openers shown above the message box for the astrologer.
const SCRIPTED_REPLIES = [
  'Welcome to Astrowani 🙏',
  'I am creating your chart…',
  'Your chart is created, now ask your question.',
];

const VendorChatSession = ({ route, navigation }) => {
  const { requestId, callerName, callerId, perMinuteCharge, sessionId: initialSessionId } = route.params;
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
  const sessionIdRef = useRef(initialSessionId);
  const astroIdRef = useRef(null);
  const pollMsgRef = useRef(null);
  const pollEndRef = useRef(null);
  const socketRef = useRef(null);

  const pad = (n) => n.toString().padStart(2, '0');
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

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
      socketRef.current.on('connect', () => {
        if (sessionIdRef.current) socketRef.current.emit('join_session', sessionIdRef.current);
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
        socketRef.current.emit('join_session', finalSessionId);
        socketRef.current.emit('signal_connection', { sessionId: finalSessionId });

        socketRef.current.on('session_ended', (data) => {
          console.log('Session terminated via socket:', data.reason);
          endSessionLocal(data.reason);
        });

        // Load existing messages
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', finalSessionId)
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
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
        socketRef.current.on('chat_typing', ({ isTyping }) => {
          setCustomerTyping(isTyping);
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

      // Start timer
      setSessionStartMs(Date.now());
      setTimerActive(true);
      captureEvent('chat_started', { session_id: sessionIdRef.current });
    };

    init();

    return () => {
      if (pollMsgRef.current) clearInterval(pollMsgRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
      // Same fix as the customer-side ChatSessionScreen: leaving via hardware back /
      // swipe-back / navigating away only used to disconnect the socket without telling
      // the backend, so a session the vendor abandoned this way stayed active/billable.
      if (sessionIdRef.current && socketRef.current) {
        socketRef.current.emit('end_session', { sessionId: sessionIdRef.current });
        setTimeout(() => socketRef.current && socketRef.current.disconnect(), 300);
      } else if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const endSessionLocal = (reason) => {
    captureEvent('chat_ended', {
      session_id: sessionIdRef.current,
      duration_seconds: sessionStartMs ? Math.round((Date.now() - sessionStartMs) / 1000) : 0,
    });
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

  // ─── Send message ─────────────────────────────────────────────────────────
  const lastSentRef = useRef({ text: null, time: 0 });

  const sendMessage = async (overrideText) => {
    // overrideText is a string when fired by a scripted-reply chip; the bare
    // onPress handler passes a press event (object), so only treat strings as overrides.
    const raw = typeof overrideText === 'string' ? overrideText : newMessage;
    if (!raw.trim() || !sessionIdRef.current || !astroIdRef.current) return;
    const msg = raw.trim();

    // Scripted chips give no "sent" state, so a vendor unsure whether the tap registered
    // will tap again — guard against the same chip text firing twice in quick succession.
    const now = Date.now();
    if (lastSentRef.current.text === msg && now - lastSentRef.current.time < 2000) return;
    lastSentRef.current = { text: msg, time: now };

    if (typeof overrideText !== 'string') setNewMessage('');

    // Reset typing status on send
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('chat_typing', { sessionId: sessionIdRef.current, isTyping: false });
    }


    // Row is created server-side now, not by the client — see
    // DATABASE_HARDENING_HANDOFF.md STEP 3. Realtime (unchanged) still delivers it to
    // both sides once inserted.
    const msgToken = await AsyncStorage.getItem('token');
    await Instance.post('/api/chat/message', {
      roomId: requestId,
      sessionId: sessionIdRef.current,
      receiverId: callerId,
      message: msg,
    }, {
      headers: msgToken ? { Authorization: `Bearer ${msgToken}` } : {},
    }).catch((e) => console.warn('chat message send error:', e?.message));

    // Fire-and-forget push notification for when the customer's app is backgrounded/killed.
    Instance.post('/api/push/notify-chat-message', {
      customerId: callerId,
      astrologerId: astroIdRef.current,
      message: msg,
    }, {
      headers: msgToken ? { Authorization: `Bearer ${msgToken}` } : {},
    }).catch(() => {});
  };

  // ─── End session ──────────────────────────────────────────────────────────
  const endSession = async () => {
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('end_session', { sessionId: sessionIdRef.current });
    }
    endSessionLocal();
  };

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
    <SafeAreaView style={[styles.safeArea, {paddingTop: insets.top}]}>
      <StatusBar backgroundColor={COLORS.AstroMaroon} barStyle="light-content" />

      {/* ── Header ─────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={endSession}>
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
            <Text style={styles.charge}>₹{perMinuteCharge}{t('common.perMin')}</Text>
          )}
        </View>

        <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>

        <TouchableOpacity style={styles.endBtn} onPress={endSession}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.endText}>{t('call.end')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat + Input ────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.flex}
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

        <View style={[styles.inputRow, {paddingBottom: insets.bottom + 16}]}>
          <TextInput
            style={styles.input}
            placeholder={t('call.messagePlaceholder')}
            placeholderTextColor="#999"
            value={newMessage}
            onChangeText={handleTyping}
            multiline
            maxLength={500}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
