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
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';
import { COLORS } from '../Theme/Colors';
import Instance from '../api/ApiCall';
import { showReviewPrompt } from '../components/ReviewPrompt';
import Ionicons from 'react-native-vector-icons/Ionicons';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

const ChatSessionScreen = ({ route, navigation }) => {
  const { requestId, person, sessionId: initialSessionId } = route.params;

  const [session, setSession] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [wallet, setWallet] = useState(0);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [myId, setMyId] = useState(null);
  const [connecting, setConnecting] = useState(true);
  const [vendorTyping, setVendorTyping] = useState(false);

  const secondTimerRef = useRef(null);
  const sessionRef = useRef(null);
  const walletRef = useRef(0);
  const channelRef = useRef(null);
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

    clearInterval(secondTimerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollEndRef.current) clearInterval(pollEndRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
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
      Alert.alert('Session Ended', message, [
        { text: 'OK', onPress: goBackOrHome },
      ]);
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
      // Pull the latest profile straight from the source of truth.
      const { data: prof } = await supabase
        .from('customers')
        .select('name, dob, time_of_birth, place_of_birth')
        .eq('id', senderId)
        .single();

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

      await supabase.from('chat_messages').insert([
        {
          room_id: requestId,
          session_id: sessionData.id,
          sender_id: senderId,
          receiver_id: person?._id || person?.id || person?.userId,
          message: details,
        },
      ]);
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
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { isTyping: false },
      });
    }

    // Send to Supabase — Realtime will update UI
    await supabase.from('chat_messages').insert([
      {
        room_id: requestId,
        session_id: sessionRef.current.id,
        sender_id: myId,
        receiver_id: person?._id || person?.id || person?.userId,
        message: msg,
      },
    ]);
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
      socketRef.current = io(SOCKET_URL);

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

            // Start timers
            chatConnectedRef.current = true;
            secondTimerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            // Load existing messages
            const { data: msgs } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('session_id', data.id)
              .order('created_at', { ascending: true });
            if (msgs) setMessages(msgs);

            // Subscribe to new messages & broadcasts
            channelRef.current = supabase.channel(`chat_session_${data.id}`, {
              config: { broadcast: { self: true } },
            });
            channelRef.current
              .on('broadcast', { event: 'typing' }, (payload) => {
                setVendorTyping(payload.payload.isTyping);
              })
              .on(
                'postgres_changes',
                {
                  event: 'INSERT',
                  schema: 'public',
                  table: 'chat_messages',
                  filter: `session_id=eq.${data.id}`,
                },
                (payload) => {
                  setMessages((prev) => {
                    // Avoid duplicates
                    if (prev.find((m) => m.id === payload.new.id)) return prev;
                    return [...prev, payload.new];
                  });
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              )
              .subscribe();

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

          // Check if Vendor ended the chat
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
          }, 5000);

    };

    init();

    return () => {
      clearInterval(secondTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollEndRef.current) clearInterval(pollEndRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const handleTyping = (text) => {
    setText(text);
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { isTyping: text.length > 0 },
      });
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Header: name + timer + wallet ─────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={manualEndSession} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        {person?.profileImage || person?.image ? (
          <Image source={{ uri: person?.profileImage || person?.image }} style={styles.headerAvatar} />
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
        <View style={styles.inputRow}>
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
