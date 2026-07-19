// VendorChatSession.js — Vendor side active chat screen
import React, { useEffect, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../Theme/Colors';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import Instance from '../api/ApiCall';

// Tap-to-send scripted openers shown above the message box for the astrologer.
const SCRIPTED_REPLIES = [
  'Welcome to Astrowani 🙏',
  'I am creating your chart…',
  'Your chart is created, now ask your question.',
];

const VendorChatSession = ({ route, navigation }) => {
  const { requestId, callerName, callerId, perMinuteCharge, sessionId: initialSessionId, isFreeSession } = route.params;

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [astroId, setAstroId] = useState(null);

  const timerRef = useRef(null);
  const channelRef = useRef(null);
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
      socketRef.current = io(SOCKET_URL);
      
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

        // Subscribe to new messages & broadcasts
        channelRef.current = supabase.channel(`chat_session_${finalSessionId}`, {
          config: { broadcast: { self: true } },
        });
        channelRef.current
          .on('broadcast', { event: 'typing' }, (payload) => {
            setCustomerTyping(payload.payload.isTyping);
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'chat_messages',
              filter: `session_id=eq.${finalSessionId}`,
            },
            (payload) => {
              setMessages((prev) => {
                if (prev.find((m) => m.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            }
          )
          .subscribe();

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
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    };

    init();

    return () => {
      clearInterval(timerRef.current);
      if (pollMsgRef.current) clearInterval(pollMsgRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const endSessionLocal = (reason) => {
    clearInterval(timerRef.current);
    if (pollMsgRef.current) clearInterval(pollMsgRef.current);
    if (pollEndRef.current) clearInterval(pollEndRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    
    if (reason) {
       Alert.alert('Session Ended', reason);
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('DrawerNavigator');
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (overrideText) => {
    // overrideText is a string when fired by a scripted-reply chip; the bare
    // onPress handler passes a press event (object), so only treat strings as overrides.
    const raw = typeof overrideText === 'string' ? overrideText : newMessage;
    if (!raw.trim() || !sessionIdRef.current || !astroIdRef.current) return;
    const msg = raw.trim();
    if (typeof overrideText !== 'string') setNewMessage('');

    // Reset typing status on send
    if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { isTyping: false },
        });
      }
    
    // Send to Supabase — Realtime will update the UI
    await supabase.from('chat_messages').insert([
      {
        room_id: requestId,
        session_id: sessionIdRef.current,
        sender_id: astroIdRef.current,
        receiver_id: callerId,
        message: msg,
      },
    ]);

    // Fire-and-forget push notification for when the customer's app is backgrounded/killed.
    Instance.post('/api/push/notify-chat-message', {
      customerId: callerId,
      astrologerId: astroIdRef.current,
      message: msg,
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
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { isTyping: text.length > 0 },
      });
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
    <SafeAreaView style={styles.safeArea}>
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
          <Text style={styles.callerName} numberOfLines={1}>{callerName || 'Customer'}</Text>
          {customerTyping ? (
            <Text style={[styles.charge, { color: '#88ffa8', fontStyle: 'italic' }]}>typing...</Text>
          ) : (
            <Text style={styles.charge}>₹{perMinuteCharge}/min</Text>
          )}
        </View>

        <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>

        <TouchableOpacity style={styles.endBtn} onPress={endSession}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.endText}>End</Text>
        </TouchableOpacity>
      </View>

      {isFreeSession && (
        <View style={styles.freeBanner}>
          <Ionicons name="gift-outline" size={16} color="#7A5B00" />
          <Text style={styles.freeBannerText}>Customer's free first consultation — not billed for the opening minutes</Text>
        </View>
      )}

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
              style={styles.quickChip}
              activeOpacity={0.8}
              onPress={() => sendMessage(reply)}>
              <Text style={styles.quickChipText} numberOfLines={1}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
  freeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3CD',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  freeBannerText: { color: '#7A5B00', fontSize: 12, fontWeight: '600', flexShrink: 1 },

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
    backgroundColor: 'rgba(107,31,42,0.08)',
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
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
