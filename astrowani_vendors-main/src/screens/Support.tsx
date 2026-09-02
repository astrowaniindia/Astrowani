// Astrologer support — a real conversation.
//
// WHAT THIS REPLACES, AND WHY IT MATTERED. The old screen was a form with Name,
// Email and Message whose handleSubmit did this:
//
//     showStatusPopup({variant: 'success', message: 'Your inquiry has been sent!'});
//     console.log('Inquiry Submitted:', {name, email, message});
//
// It called no API. Nothing was stored, nothing was sent, nobody was told. Every
// astrologer who ever reported a missing payout through this screen was shown a
// green success popup and their message was written to a console log on their own
// phone. That is worse than having no support screen at all, because it consumed
// the report and told them it had been received.
//
// Now it opens a conversation with the support agent, which can read their own
// payout balance, earnings and account state, and hands to a person for anything
// about money or approval. Same backend as the customer app (src/supportRoutes.js);
// the agent is told it is speaking to an astrologer and answers accordingly.
import React, {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform,
  KeyboardAvoidingView, ActivityIndicator, Animated, Easing,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import Instance from '../api/ApiCall';
import {LanguageContext} from '../context/LanguageContext';

// Only while a human is involved — see the customer screen for the reasoning.
const POLL_MS = 6000;

const QUICK_STARTS = ['payout', 'requests', 'profile', 'charges'];

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, {toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
        Animated.timing(a, {toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={[styles.bubble, styles.agentBubble, styles.typingBubble]}>
      {[0, 1, 2].map(i => (
        <Animated.View
          key={i}
          style={[styles.dot, {opacity: a.interpolate({inputRange: [0, 1], outputRange: [0.25 + i * 0.15, 1]})}]}
        />
      ))}
    </View>
  );
}

export default function Support({navigation}) {
  const {t} = useContext(LanguageContext);

  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('bot');
  const [agentName, setAgentName] = useState(null);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [booting, setBooting] = useState(true);

  const listRef = useRef(null);
  const pollRef = useRef(null);
  const sendingRef = useRef(false);

  const applyThread = useCallback(data => {
    setMessages(data.messages || []);
    setStatus(data.status || 'bot');
    const lastHuman = [...(data.messages || [])].reverse().find(m => m.sender === 'human');
    setAgentName(lastHuman?.agentName || null);
  }, []);

  const loadThread = useCallback(async id => {
    const res = await Instance.get(`/api/support/conversations/${id}`);
    if (res?.data?.success) applyThread(res.data.data);
  }, [applyThread]);

  // Reuse the astrologer's open conversation if there is one, rather than opening
  // a new thread every visit. A payout chased across three separate threads is
  // how a real problem gets lost between them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await Instance.get('/api/support/conversations');
        const open = (list?.data?.data || []).find(c =>
          ['bot', 'awaiting_human', 'human'].includes(c.status));
        if (cancelled) return;

        if (open) {
          setConversationId(open.id);
          await loadThread(open.id);
        } else {
          const res = await Instance.post('/api/support/conversations', {});
          if (cancelled) return;
          if (res?.data?.success) {
            setConversationId(res.data.data.id);
            await loadThread(res.data.data.id);
          }
        }
      } catch (e) {
        if (cancelled) return;
        setMessages([{
          id: 'boot-error',
          sender: 'system',
          body: e?.response?.data?.code === 'NOT_MIGRATED'
            ? t('vsupport.notReady')
            : t('vsupport.couldNotOpen'),
        }]);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const needsPolling = status === 'awaiting_human' || status === 'human';
    if (!conversationId || !needsPolling) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return undefined;
    }
    pollRef.current = setInterval(() => { loadThread(conversationId).catch(() => {}); }, POLL_MS);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [conversationId, status, loadThread]);

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({animated: true}));
  }, [messages, thinking]);

  const send = async bodyText => {
    const body = (bodyText != null ? bodyText : text).trim();
    if (!body || !conversationId || sendingRef.current) return;
    sendingRef.current = true;
    setText('');
    setMessages(prev => [...prev, {id: `local-${Date.now()}`, sender: 'user', body}]);
    setThinking(true);
    try {
      await Instance.post(`/api/support/conversations/${conversationId}/messages`, {body});
      await loadThread(conversationId);
    } catch (_) {
      setMessages(prev => [...prev, {id: `err-${Date.now()}`, sender: 'system', body: t('vsupport.sendFailed')}]);
    } finally {
      setThinking(false);
      sendingRef.current = false;
    }
  };

  const talkToPerson = async () => {
    if (!conversationId) return;
    setThinking(true);
    try {
      await Instance.post(`/api/support/conversations/${conversationId}/escalate`);
      await loadThread(conversationId);
    } catch (_) {
      setMessages(prev => [...prev, {id: `err-${Date.now()}`, sender: 'system', body: t('vsupport.sendFailed')}]);
    } finally {
      setThinking(false);
    }
  };

  const statusLine = () => {
    if (status === 'awaiting_human') return t('vsupport.statusConnecting');
    if (status === 'human') return agentName ? t('vsupport.statusWithAgent', {name: agentName}) : t('vsupport.statusTeam');
    if (status === 'resolved') return t('vsupport.statusResolved');
    return thinking ? t('vsupport.statusTyping') : t('vsupport.statusAssistant');
  };

  const renderItem = ({item}) => {
    if (item.sender === 'system') {
      return <View style={styles.systemWrap}><Text style={styles.systemText}>{item.body}</Text></View>;
    }
    const mine = item.sender === 'user';
    const isHuman = item.sender === 'human';
    return (
      <View style={[styles.row, mine ? styles.rowRight : styles.rowLeft]}>
        {!mine && (
          <View style={[styles.avatar, isHuman && styles.avatarHuman]}>
            <Ionicons name={isHuman ? 'person' : 'sparkles'} size={moderateScale(14)} color="#fff" />
          </View>
        )}
        <View style={{maxWidth: '78%'}}>
          {isHuman && (
            <Text style={styles.senderLabel}>
              {item.agentName ? t('vsupport.fromAgent', {name: item.agentName}) : t('vsupport.fromTeam')}
            </Text>
          )}
          <View style={[styles.bubble, mine ? styles.myBubble : isHuman ? styles.humanBubble : styles.agentBubble]}>
            <Text style={[styles.bubbleText, mine && styles.myBubbleText]}>{item.body}</Text>
          </View>
        </View>
      </View>
    );
  };

  const showQuickStarts = !booting && messages.filter(m => m.sender === 'user').length === 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Ionicons name="arrow-back" size={moderateScale(23)} color="#fff" />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={styles.headerTitle}>{t('vsupport.title')}</Text>
          <Text style={styles.headerStatus} numberOfLines={1}>{statusLine()}</Text>
        </View>
        {status !== 'human' && status !== 'awaiting_human' && (
          <TouchableOpacity style={styles.humanBtn} onPress={talkToPerson} activeOpacity={0.85}>
            <Ionicons name="headset-outline" size={moderateScale(14)} color={COLORS.AstroMaroon} />
            <Text style={styles.humanBtnText}>{t('vsupport.talkToPerson')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {booting ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.AstroMaroon} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <>
              {thinking && <TypingDots />}
              {showQuickStarts && (
                <View style={styles.quickWrap}>
                  <Text style={styles.quickHint}>{t('vsupport.quickHint')}</Text>
                  {QUICK_STARTS.map(k => (
                    <TouchableOpacity key={k} style={styles.quickChip} activeOpacity={0.85} onPress={() => send(t(`vsupport.quick.${k}`))}>
                      <Ionicons name="chatbubble-outline" size={moderateScale(15)} color={COLORS.AstroMaroon} />
                      <Text style={styles.quickChipText}>{t(`vsupport.quick.${k}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('vsupport.messagePlaceholder')}
          placeholderTextColor="#9b8f8a"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]}
          onPress={() => send()}
          disabled={!text.trim()}
          activeOpacity={0.85}>
          <Ionicons name="send" size={moderateScale(19)} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f7f3f1'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
  },
  backBtn: {padding: scale(4), marginRight: scale(6)},
  headerTitle: {color: '#fff', fontSize: moderateScale(16.5), fontWeight: 'bold'},
  headerStatus: {color: 'rgba(255,255,255,0.85)', fontSize: moderateScale(11.5), marginTop: verticalScale(1)},
  humanBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: scale(10), paddingVertical: verticalScale(6), borderRadius: moderateScale(20),
  },
  humanBtnText: {color: COLORS.AstroMaroon, fontSize: moderateScale(11.5), fontWeight: '700', marginLeft: scale(5)},

  list: {padding: scale(14), paddingBottom: verticalScale(20)},
  row: {flexDirection: 'row', alignItems: 'flex-end', marginBottom: verticalScale(10)},
  rowLeft: {justifyContent: 'flex-start'},
  rowRight: {justifyContent: 'flex-end'},
  avatar: {
    width: scale(26), height: scale(26), borderRadius: scale(13),
    backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center', marginRight: scale(7),
  },
  avatarHuman: {backgroundColor: '#1a8f4c'},
  senderLabel: {fontSize: moderateScale(10.5), color: '#1a8f4c', fontWeight: '700', marginBottom: verticalScale(3), marginLeft: scale(4)},

  bubble: {borderRadius: moderateScale(16), paddingHorizontal: scale(13), paddingVertical: verticalScale(10)},
  agentBubble: {backgroundColor: '#fff', borderTopLeftRadius: moderateScale(4), borderWidth: 1, borderColor: '#ecdfd8'},
  humanBubble: {backgroundColor: '#eafaf0', borderTopLeftRadius: moderateScale(4), borderWidth: 1, borderColor: '#bfe6cd'},
  myBubble: {backgroundColor: COLORS.AstroMaroon, borderTopRightRadius: moderateScale(4)},
  bubbleText: {fontSize: moderateScale(14), color: '#2b1a12', lineHeight: moderateScale(20)},
  myBubbleText: {color: '#fff'},

  typingBubble: {flexDirection: 'row', alignSelf: 'flex-start', marginLeft: scale(33), paddingVertical: verticalScale(12)},
  dot: {width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: COLORS.AstroMaroon, marginHorizontal: scale(2)},

  systemWrap: {alignItems: 'center', marginVertical: verticalScale(10)},
  systemText: {
    fontSize: moderateScale(11.5), color: '#6b574d', backgroundColor: '#f0e6e0',
    paddingHorizontal: scale(12), paddingVertical: verticalScale(6),
    borderRadius: moderateScale(12), overflow: 'hidden', textAlign: 'center',
  },

  quickWrap: {marginTop: verticalScale(6)},
  quickHint: {fontSize: moderateScale(12), color: '#8a7c76', marginBottom: verticalScale(8), marginLeft: scale(4)},
  quickChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#ecdfd8', borderRadius: moderateScale(14),
    paddingHorizontal: scale(12), paddingVertical: verticalScale(11), marginBottom: verticalScale(8),
  },
  quickChipText: {marginLeft: scale(9), fontSize: moderateScale(13), color: '#2b1a12', flex: 1},

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: scale(12), paddingVertical: verticalScale(10),
    backgroundColor: '#f7f3f1', borderTopWidth: 1, borderTopColor: '#ece1db',
  },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: moderateScale(22),
    paddingHorizontal: scale(16), paddingTop: verticalScale(11), paddingBottom: verticalScale(11),
    maxHeight: verticalScale(110), fontSize: moderateScale(14), color: '#2b1a12',
    borderWidth: 1, borderColor: '#ecdfd8',
  },
  sendBtn: {
    width: scale(44), height: scale(44), borderRadius: scale(22),
    backgroundColor: COLORS.AstroMaroon, alignItems: 'center', justifyContent: 'center', marginLeft: scale(8),
  },
  sendBtnOff: {opacity: 0.45},
});
