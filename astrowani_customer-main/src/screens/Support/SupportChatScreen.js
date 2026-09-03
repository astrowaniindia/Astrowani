// The support conversation — agent, handover, and a real person, in one thread.
//
// WHAT THIS REPLACES. A form: name, email, issue type, message, Submit. It posted
// one ticket and nothing ever came back — there was no reply path in the app at
// all, so from the customer's side every support request vanished. Being asked to
// fill in your own name and email, inside an app you are logged into, and then
// hearing nothing, is the experience this screen exists to end.
//
// THE DESIGN RULES, because they are what make it feel different:
//
// 1. NEVER A DEAD SCREEN. The greeting is already there when it opens, the agent
//    shows a typing indicator while it thinks, and a send that fails says so in
//    the thread instead of an alert that erases what happened.
// 2. "TALK TO A PERSON" IS ALWAYS ONE TAP AWAY, in the header, never buried and
//    never argued with. Making someone justify wanting a human is the single most
//    resented thing about support chat.
// 3. THE STATUS IS ALWAYS VISIBLE and in plain words — "Assistant", "Connecting
//    you to the team", "Priya from support", "Resolved". The customer should
//    never have to guess whether anyone is coming.
// 4. WHEN A PERSON IS COMING, THE APP SAYS BY WHEN. The backend stamps an SLA on
//    escalation and the system message carries the time. "Shortly" is what makes
//    people write in three more times.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform,
  KeyboardAvoidingView, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';

// While a human owns the thread there is no push-free way to learn they replied,
// so the screen polls. Only while it is focused and only while a person is
// actually involved — a bot conversation needs no polling because every reply is
// the response to a request this screen made.
const POLL_MS = 6000;

// Openers for the empty state. These are the things people actually write in
// about, in their own words — tapping one is faster than typing and tells the
// customer we already know these problems exist.
const QUICK_STARTS = [
  { key: 'charged', icon: 'wallet-outline' },
  { key: 'callFailed', icon: 'call-outline' },
  { key: 'refund', icon: 'cash-outline' },
  { key: 'order', icon: 'cube-outline' },
];

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={[styles.bubble, styles.agentBubble, styles.typingBubble]}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.25 + i * 0.15, 1] }) },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Auth header for every support call.
 *
 * `Instance` (api/ApiCall.js) has NO request interceptor — it never attaches the
 * token. Every authenticated screen in this app passes the header by hand, and
 * these calls did not, so the backend saw no token, answered 401, and the screen
 * reported "your session has expired" to people whose session was perfectly
 * fine. Reported from a real phone.
 */
async function auth() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function SupportChatScreen({ navigation, route }) {
  const { t } = useContext(LanguageContext);
  const insets = useSafeAreaInsets();

  const [conversationId, setConversationId] = useState(route?.params?.conversationId || null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('bot');
  const [agentName, setAgentName] = useState(null);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [booting, setBooting] = useState(true);
  const [rated, setRated] = useState(false);

  const listRef = useRef(null);
  const pollRef = useRef(null);
  // Guards double-sends from an impatient second tap: a state update would not
  // land before the second press. Same reasoning as the Chat button's guard.
  const sendingRef = useRef(false);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const applyThread = useCallback((data) => {
    setMessages(data.messages || []);
    setStatus(data.status || 'bot');
    const lastHuman = [...(data.messages || [])].reverse().find((m) => m.sender === 'human');
    setAgentName(lastHuman?.agentName || null);
    setRated(data.satisfaction != null);
  }, []);

  const loadThread = useCallback(async (id) => {
    const res = await Instance.get(`/api/support/conversations/${id}`, await auth());
    if (res?.data?.success) applyThread(res.data.data);
  }, [applyThread]);

  // Open an existing conversation, or start one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (conversationId) {
          await loadThread(conversationId);
        } else {
          const res = await Instance.post('/api/support/conversations', {}, await auth());
          if (cancelled) return;
          if (res?.data?.success) {
            setConversationId(res.data.data.id);
            await loadThread(res.data.data.id);
          }
        }
      } catch (e) {
        if (cancelled) return;
        // Rule 1: an error is a message in the thread, not an alert that leaves
        // an empty screen behind it.
        // Not fatal any more: the controls below now create the conversation on
        // demand, so this is an explanation plus an invitation to try, not a
        // dead end.
        setMessages([{
          id: 'boot-error',
          sender: 'system',
          body: `${failureLine(e)} ${t('support.tapToRetry')}`,
        }]);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll only while a person is involved — see POLL_MS.
  useEffect(() => {
    const needsPolling = status === 'awaiting_human' || status === 'human';
    if (!conversationId || !needsPolling) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return undefined;
    }
    pollRef.current = setInterval(() => {
      loadThread(conversationId).catch(() => {});
    }, POLL_MS);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [conversationId, status, loadThread]);

  useEffect(scrollDown, [messages, thinking, scrollDown]);

  /**
   * The conversation id, creating one if we do not have it yet.
   *
   * WHY THIS EXISTS. Every control used to bail on `if (!conversationId) return`.
   * So when the opening create failed — backend not deployed yet, a dropped
   * connection, an expired token — the screen kept its Send button, its quick
   * replies and "Talk to a person", and EVERY ONE OF THEM silently did nothing,
   * for ever, with no way back except leaving the screen. Reported from a real
   * phone: "I am clicking send, nothing happening."
   *
   * Now the first thing any action does is make sure there is a conversation.
   * A failed open becomes a retry on the next tap instead of a dead screen.
   */
  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const res = await Instance.post('/api/support/conversations', {}, await auth());
    const id = res?.data?.data?.id;
    if (!id) throw new Error('NO_CONVERSATION');
    setConversationId(id);
    return id;
  }, [conversationId]);

  // Says what actually went wrong. "Please try again" with no reason is what
  // makes a stuck screen impossible to report usefully.
  const failureLine = (e) => {
    const code = e?.response?.data?.code;
    if (code === 'NOT_MIGRATED') return t('support.notReady');
    const status = e?.response?.status;
    if (status === 401) return t('support.sessionExpired');
    if (!e?.response) return t('support.offline');
    return t('support.sendFailed');
  };

  const send = async (bodyText) => {
    const body = (bodyText != null ? bodyText : text).trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setText('');

    // Optimistic: their words appear instantly. A support screen that lags on the
    // customer's own message reads as broken at the worst possible moment.
    const optimistic = {
      id: `local-${Date.now()}`, sender: 'user', body, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setThinking(true);

    try {
      const id = await ensureConversation();
      await Instance.post(`/api/support/conversations/${id}/messages`, { body }, await auth());
      await loadThread(id);
    } catch (e) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        sender: 'system',
        body: failureLine(e),
      }]);
    } finally {
      setThinking(false);
      sendingRef.current = false;
    }
  };

  const talkToPerson = async () => {
    setThinking(true);
    try {
      const id = await ensureConversation();
      await Instance.post(`/api/support/conversations/${id}/escalate`, {}, await auth());
      await loadThread(id);
    } catch (e) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, sender: 'system', body: failureLine(e) }]);
    } finally {
      setThinking(false);
    }
  };

  const rate = async (rating) => {
    if (!conversationId) return;
    setRated(true);
    try {
      await Instance.post(`/api/support/conversations/${conversationId}/satisfaction`, { rating }, await auth());
      await loadThread(conversationId);
    } catch (_) { /* a failed rating must not interrupt anything */ }
  };

  // Plain words, never internal status strings.
  const statusLine = () => {
    if (status === 'awaiting_human') return t('support.statusConnecting');
    if (status === 'human') return agentName ? t('support.statusWithAgent', { name: agentName }) : t('support.statusTeam');
    if (status === 'resolved') return t('support.statusResolved');
    if (status === 'closed') return t('support.statusClosed');
    return thinking ? t('support.statusTyping') : t('support.statusAssistant');
  };

  const renderItem = ({ item }) => {
    if (item.sender === 'system') {
      return (
        <View style={styles.systemWrap}>
          <Text style={styles.systemText}>{item.body}</Text>
        </View>
      );
    }
    const mine = item.sender === 'user';
    const isHuman = item.sender === 'human';
    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        {!mine && (
          <View style={[styles.avatar, isHuman && styles.avatarHuman]}>
            {/* A headset, not a sparkle: this is customer support, and the
                sparkle read as "AI magic" for a bot that is deliberately a
                fixed set of written answers. The human's avatar stays a
                person, so the two are still distinguishable at a glance. */}
            <Ionicons
              name={isHuman ? 'person' : 'headset'}
              size={moderateScale(14)}
              color="#fff"
            />
          </View>
        )}
        <View style={{ maxWidth: '78%' }}>
          {isHuman && (
            <Text style={styles.senderLabel}>
              {item.agentName ? t('support.fromAgent', { name: item.agentName }) : t('support.fromTeam')}
            </Text>
          )}
          <View style={[styles.bubble, mine ? styles.myBubble : isHuman ? styles.humanBubble : styles.agentBubble]}>
            <Text style={[styles.bubbleText, mine && styles.myBubbleText]}>{item.body}</Text>
          </View>
        </View>
      </View>
    );
  };

  const showQuickStarts = !booting && messages.filter((m) => m.sender === 'user').length === 0;
  const canType = status !== 'closed';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={moderateScale(23)} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('support.chatTitle')}</Text>
          <Text style={styles.headerStatus} numberOfLines={1}>{statusLine()}</Text>
        </View>
        {/* Rule 2 — always here, never buried, until a person already has it. */}
        {status !== 'human' && status !== 'awaiting_human' && (
          <TouchableOpacity style={styles.humanBtn} onPress={talkToPerson} activeOpacity={0.85}>
            <Ionicons name="headset-outline" size={moderateScale(14)} color={COLORS.AstroMaroon} />
            <Text style={styles.humanBtnText}>{t('support.talkToPerson')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {booting ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.AstroMaroon} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {thinking && <TypingDots />}

              {showQuickStarts && (
                <View style={styles.quickWrap}>
                  <Text style={styles.quickHint}>{t('support.quickHint')}</Text>
                  {QUICK_STARTS.map((q) => (
                    <TouchableOpacity
                      key={q.key}
                      style={styles.quickChip}
                      activeOpacity={0.85}
                      onPress={() => send(t(`support.quick.${q.key}`))}>
                      <Ionicons name={q.icon} size={moderateScale(15)} color={COLORS.AstroMaroon} />
                      <Text style={styles.quickChipText}>{t(`support.quick.${q.key}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Asked once, only after it is actually over. A rating prompt on an
                  unresolved issue reads as being hurried out of the door. */}
              {status === 'resolved' && !rated && (
                <View style={styles.rateCard}>
                  <Text style={styles.rateTitle}>{t('support.rateTitle')}</Text>
                  <View style={styles.rateRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity key={n} onPress={() => rate(n)} style={styles.rateStar} activeOpacity={0.7}>
                        <Ionicons name="star" size={moderateScale(26)} color="#E6B800" />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.rateHint}>{t('support.rateHint')}</Text>
                </View>
              )}
            </>
          }
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + verticalScale(10) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={canType ? t('support.messagePlaceholder') : t('support.closedPlaceholder')}
          placeholderTextColor="#9b8f8a"
          multiline
          editable={canType}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || !canType) && styles.sendBtnOff]}
          onPress={() => send()}
          disabled={!text.trim() || !canType}
          activeOpacity={0.85}>
          <Ionicons name="send" size={moderateScale(19)} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f3f1' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
  },
  backBtn: { padding: scale(4), marginRight: scale(6) },
  headerCenter: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: moderateScale(16.5), fontWeight: 'bold' },
  headerStatus: { color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(11.5), marginTop: verticalScale(1) },
  humanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(20),
  },
  humanBtnText: {
    color: COLORS.AstroMaroon,
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    marginLeft: scale(5),
  },

  list: { padding: scale(14), paddingBottom: verticalScale(20) },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: verticalScale(10) },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: scale(26), height: scale(26), borderRadius: scale(13),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center', justifyContent: 'center',
    marginRight: scale(7),
  },
  // A person gets a visibly different mark from the assistant, so the customer
  // can tell at a glance who they are talking to.
  avatarHuman: { backgroundColor: '#1a8f4c' },
  senderLabel: {
    fontSize: moderateScale(10.5),
    color: '#1a8f4c',
    fontWeight: '700',
    marginBottom: verticalScale(3),
    marginLeft: scale(4),
  },

  bubble: { borderRadius: moderateScale(16), paddingHorizontal: scale(13), paddingVertical: verticalScale(10) },
  agentBubble: { backgroundColor: '#fff', borderTopLeftRadius: moderateScale(4), borderWidth: 1, borderColor: '#ecdfd8' },
  humanBubble: { backgroundColor: '#eafaf0', borderTopLeftRadius: moderateScale(4), borderWidth: 1, borderColor: '#bfe6cd' },
  myBubble: { backgroundColor: COLORS.AstroMaroon, borderTopRightRadius: moderateScale(4) },
  bubbleText: { fontSize: moderateScale(14), color: '#2b1a12', lineHeight: moderateScale(20) },
  myBubbleText: { color: '#fff' },

  typingBubble: { flexDirection: 'row', alignSelf: 'flex-start', marginLeft: scale(33), paddingVertical: verticalScale(12) },
  dot: {
    width: scale(6), height: scale(6), borderRadius: scale(3),
    backgroundColor: COLORS.AstroMaroon, marginHorizontal: scale(2),
  },

  systemWrap: { alignItems: 'center', marginVertical: verticalScale(10) },
  systemText: {
    fontSize: moderateScale(11.5),
    color: '#6b574d',
    backgroundColor: '#f0e6e0',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    textAlign: 'center',
  },

  quickWrap: { marginTop: verticalScale(6) },
  quickHint: { fontSize: moderateScale(12), color: '#8a7c76', marginBottom: verticalScale(8), marginLeft: scale(4) },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ecdfd8',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(11),
    marginBottom: verticalScale(8),
  },
  quickChipText: { marginLeft: scale(9), fontSize: moderateScale(13), color: '#2b1a12', flex: 1 },

  rateCard: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    padding: scale(16),
    marginTop: verticalScale(14),
    borderWidth: 1,
    borderColor: '#ecdfd8',
    alignItems: 'center',
  },
  rateTitle: { fontSize: moderateScale(14.5), fontWeight: 'bold', color: '#2b1a12' },
  rateRow: { flexDirection: 'row', marginTop: verticalScale(10) },
  rateStar: { paddingHorizontal: scale(5) },
  rateHint: { fontSize: moderateScale(11.5), color: '#8a7c76', marginTop: verticalScale(8), textAlign: 'center' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: scale(12),
    paddingTop: verticalScale(10),
    backgroundColor: '#f7f3f1',
    borderTopWidth: 1,
    borderTopColor: '#ece1db',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: moderateScale(22),
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(11),
    paddingBottom: verticalScale(11),
    maxHeight: verticalScale(110),
    fontSize: moderateScale(14),
    color: '#2b1a12',
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },
  sendBtn: {
    width: scale(44), height: scale(44), borderRadius: scale(22),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: scale(8),
  },
  sendBtnOff: { opacity: 0.45 },
});
