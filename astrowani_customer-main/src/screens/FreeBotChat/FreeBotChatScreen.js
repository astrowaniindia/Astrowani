// FreeBotChatScreen.js — the free 5-minute scripted "bot chat" welcome offer.
// Visually mirrors ChatSessionScreen.js (real chat) closely so it feels like a
// genuine session, but there is no real chat_sessions row, no socket, and no
// astrologer on the other end — replies come from utils/freeChatBotEngine.js.
// On natural completion (a real 5 minutes elapsed, not a manual early exit),
// the customer is credited ₹20 via the backend-verified, one-time-only
// POST /api/free-bot-chat/credit.
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import useElapsedSeconds from '../../hooks/useElapsedSeconds';
import { FREE_CHAT_PERSONA } from '../../data/freeBotChatPersona';
import { getOpeningMessage, getBotReply } from '../../utils/freeChatBotEngine';
import { captureEvent } from '../../utils/Analytics';

const CHAT_DURATION_SECONDS = 300;

const FreeBotChatScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [sessionStartMs] = useState(Date.now());
  const [chatActive, setChatActive] = useState(true);
  const seconds = useElapsedSeconds(sessionStartMs, chatActive);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [botTyping, setBotTyping] = useState(false);
  const [completedVisible, setCompletedVisible] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState(null);
  const hasEndedRef = useRef(false);
  const flatListRef = useRef(null);
  const msgIdRef = useRef(0);

  const pad = (n) => n.toString().padStart(2, '0');
  const nextId = () => `local-${++msgIdRef.current}`;

  const appendMessage = (sender, message) => {
    setMessages((prev) => [...prev, { id: nextId(), sender, message, created_at: new Date().toISOString() }]);
  };

  useEffect(() => {
    captureEvent('free_bot_chat_started');
    const t = setTimeout(() => appendMessage('bot', getOpeningMessage()), 600);
    return () => clearTimeout(t);
  }, []);

  const creditWallet = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/api/free-bot-chat/credit',
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res?.data?.success && !res.data.alreadyCredited) {
        setCreditedAmount(20);
      }
    } catch (e) {
      console.warn('free-bot-chat credit error:', e.message);
    }
  };

  const finishNaturally = async () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    setChatActive(false);
    captureEvent('free_bot_chat_ended', { completed: true });
    await creditWallet();
    setCompletedVisible(true);
  };

  useEffect(() => {
    if (seconds >= CHAT_DURATION_SECONDS && !hasEndedRef.current) {
      finishNaturally();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const manualEnd = () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    captureEvent('free_bot_chat_ended', { completed: false });
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Home');
  };

  const sendMessage = async () => {
    if (!text.trim() || hasEndedRef.current) return;
    const msg = text.trim();
    setText('');
    appendMessage('me', msg);
    setBotTyping(true);
    const reply = await getBotReply(msg, messages);
    setBotTyping(false);
    if (!hasEndedRef.current) appendMessage('bot', reply);
  };

  const remaining = Math.max(0, CHAT_DURATION_SECONDS - seconds);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  const renderMessage = ({ item }) => {
    const isMine = item.sender === 'me';
    const time = new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

  const finish = () => {
    setCompletedVisible(false);
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Home');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={manualEnd} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Image source={FREE_CHAT_PERSONA.image} style={styles.headerAvatar} />

        <View style={styles.headerCenter}>
          <Text style={styles.astroName} numberOfLines={1}>{FREE_CHAT_PERSONA.name}</Text>
          {botTyping ? (
            <Text style={[styles.charge, { color: '#88ffa8', fontStyle: 'italic' }]}>typing...</Text>
          ) : (
            <Text style={styles.charge}>Free chat</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.timer}>{pad(mm)}:{pad(ss)}</Text>
          <TouchableOpacity style={styles.endBtn} onPress={manualEnd}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.endText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.freeBanner}>
        <Ionicons name="gift-outline" size={16} color="#7A5B00" />
        <Text style={styles.freeBannerText}>Your free 5-minute welcome chat — completely free</Text>
      </View>

      <ImageBackground
        source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
        style={{ flex: 1 }}
        imageStyle={{ opacity: 0.15 }}>
        <FlatList
          ref={flatListRef}
          data={messages}
          style={{ flex: 1 }}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      </ImageBackground>

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 16 }]}>
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

      <Modal transparent visible={completedVisible} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.completedCard}>
            <Ionicons name="checkmark-circle" size={54} color="#1a8f4c" />
            <Text style={styles.completedTitle}>Chat Complete!</Text>
            <Text style={styles.completedMsg}>
              {creditedAmount
                ? `₹${creditedAmount} has been credited to your wallet — start a new chat with any astrologer!`
                : 'Thanks for chatting with us!'}
            </Text>
            <TouchableOpacity style={styles.completedBtn} onPress={finish}>
              <Text style={styles.completedBtnText}>Great, thanks!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default FreeBotChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroMaroon },
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
  headerCenter: { flex: 1, marginRight: 4 },
  astroName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  charge: { color: COLORS.AstroGold, fontSize: 12, marginTop: 2 },
  headerRight: { alignItems: 'center', flexDirection: 'row' },
  timer: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'], marginRight: 12 },
  endBtn: { backgroundColor: '#ff4444', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, elevation: 2 },
  endText: { color: '#fff', marginLeft: 4, fontWeight: '700', fontSize: 13 },
  freeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3CD',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  freeBannerText: { color: '#7A5B00', fontSize: 12, fontWeight: '600', flexShrink: 1 },
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
  timeContainer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(30),
  },
  completedCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(26),
    paddingHorizontal: scale(22),
    alignItems: 'center',
    elevation: 12,
  },
  completedTitle: {
    fontSize: moderateScale(19),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginTop: verticalScale(10),
    marginBottom: verticalScale(8),
  },
  completedMsg: {
    fontSize: moderateScale(14),
    color: '#555',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(22),
  },
  completedBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
    paddingVertical: verticalScale(12),
    width: '100%',
    alignItems: 'center',
  },
  completedBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
});
