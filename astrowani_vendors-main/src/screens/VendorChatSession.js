// VendorChatSession.js — Vendor side active chat screen
// Shows the same timer UI to vendor, no deduction (money goes in)
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../api/SupabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../Theme/Colors';

const VendorChatSession = ({ route, navigation }) => {
  const { requestId, callerName, callerId, perMinuteCharge } = route.params;

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [astroId, setAstroId] = useState(null);

  const timerRef = useRef(null);
  const channelRef = useRef(null);
  const flatListRef = useRef(null);

  const pad = (n) => n.toString().padStart(2, '0');

  // ─── Load session & astroId ─────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const id = await AsyncStorage.getItem('astroId');
      setAstroId(id);

      // Get session
      const { data } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('request_id', requestId)
        .single();
      if (data) setSessionId(data.id);

      // Start second timer
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      // Subscribe to new messages in this session
      channelRef.current = supabase.channel(`vendor_chat_${requestId}`);
      channelRef.current
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `session_id=eq.${data?.id}`,
          },
          (payload) => {
            setMessages((prev) => [...prev, payload.new]);
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        )
        .subscribe();

      // Load existing messages
      if (data?.id) {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', data.id)
          .order('created_at', { ascending: true });
        if (msgs) setMessages(msgs);
      }
    };

    init();

    return () => {
      clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  // ─── Send message ───────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!text.trim() || !sessionId || !astroId) return;
    const msg = text.trim();
    setText('');
    await supabase.from('chat_messages').insert([
      {
        session_id: sessionId,
        sender_id: astroId,
        receiver_id: callerId,
        message: msg,
      },
    ]);
  };

  // ─── End session ─────────────────────────────────────────────────────────
  const endSession = async () => {
    clearInterval(timerRef.current);
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (sessionId) {
      await supabase
        .from('chat_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    navigation.goBack();
  };

  const renderMessage = ({ item }) => {
    const isMine = item.sender_id === astroId;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, isMine && styles.myBubbleText]}>{item.message}</Text>
      </View>
    );
  };

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.charge}>₹{perMinuteCharge}/min</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.timer}>{pad(minutes)}:{pad(secs)}</Text>
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={endSession}>
          <Ionicons name="call" size={20} color="#fff" />
          <Text style={styles.endText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor="#aaa"
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Ionicons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
  },
  headerLeft: { flex: 1 },
  callerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  charge: { color: '#ffd', fontSize: 12 },
  headerRight: { marginRight: 12 },
  timer: { color: '#fff', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  endBtn: {
    backgroundColor: '#e53935',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endText: { color: '#fff', marginLeft: 4, fontWeight: '700' },
  messagesList: { padding: 12, paddingBottom: 80 },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
    elevation: 1,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#333', fontSize: 15 },
  myBubbleText: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#333',
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: 24,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VendorChatSession;
