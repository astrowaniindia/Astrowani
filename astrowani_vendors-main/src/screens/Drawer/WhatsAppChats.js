// "WhatsApp Customers" — conversations the shop assistant has handed to me.
//
// The bot sells gemstones and pujas on WhatsApp, but it is a shop assistant, not
// an astrologer. The moment a customer asks what suits THEM — their chart, which
// stone, when to wear it — the bot stops and hands the thread over. This is where
// that lands.
//
// Scoped server-side by the astrologer id inside the JWT (these threads carry
// customers' phone numbers), so this screen never sends an id of its own.
//
// Replying takes the thread: the assistant stays silent until it is released.
// That is deliberate — a customer mid-consultation must not have a bot talking
// over the astrologer.
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });

const stamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? timeFmt.format(d) : `${dayFmt.format(d)} ${timeFmt.format(d)}`;
};

const WhatsAppChats = () => {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);      // the conversation being read
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const auth = async () => ({
    headers: { Authorization: `Bearer ${await AsyncStorage.getItem('token')}` },
  });

  const loadList = useCallback(async () => {
    try {
      const res = await Instance.get('/api/vendor/whatsapp/conversations', await auth());
      if (res.data?.success) setList(res.data.conversations || []);
    } catch (e) {
      console.log('[WhatsAppChats] list failed:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadThread = useCallback(async (id) => {
    try {
      const res = await Instance.get(`/api/vendor/whatsapp/conversations/${id}/messages`, await auth());
      if (res.data?.success) {
        setOpen(res.data.conversation);
        setMessages(res.data.messages || []);
      }
    } catch (e) {
      Alert.alert('Could not open', e.response?.data?.message || e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadList(); }, [loadList]));

  const send = async () => {
    const text = draft.trim();
    if (!text || !open || sending) return;
    setSending(true);
    // Shown immediately — a chat that waits on the network before echoing what
    // you typed feels broken. Replaced by the server's copy on the next load.
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'astrologer', body: text, created_at: new Date().toISOString() }]);
    setDraft('');
    try {
      await Instance.post(`/api/vendor/whatsapp/conversations/${open.id}/reply`, { text }, await auth());
      loadThread(open.id);
    } catch (e) {
      Alert.alert('Not sent', e.response?.data?.message || e.message);
      // Put it back in the box rather than losing what they typed.
      setDraft(text);
      loadThread(open.id);
    } finally {
      setSending(false);
    }
  };

  const release = () => {
    if (!open) return;
    Alert.alert(
      'Hand back to the assistant?',
      'The shop assistant will start answering this customer again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hand back',
          onPress: async () => {
            try {
              await Instance.post(`/api/vendor/whatsapp/conversations/${open.id}/release`, {}, await auth());
              setOpen(null);
              loadList();
            } catch (e) {
              Alert.alert('Could not hand back', e.response?.data?.message || e.message);
            }
          },
        },
      ],
    );
  };

  /* ── one conversation ───────────────────────────────────────────────────── */
  if (open) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.threadHeader}>
          <TouchableOpacity onPress={() => { setOpen(null); loadList(); }} style={styles.backBtn}>
            <Icon name="arrow-back" size={moderateScale(22)} color={COLORS.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.threadName} numberOfLines={1}>{open.name}</Text>
            <Text style={styles.threadPhone}>{open.phone}</Text>
          </View>
          <TouchableOpacity onPress={release} style={styles.releaseBtn}>
            <Text style={styles.releaseTxt}>Hand back</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            if (item.role === 'system') {
              return <Text style={styles.systemLine}>{item.body}</Text>;
            }
            const mine = item.role === 'astrologer' || item.role === 'bot';
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {item.role === 'bot' && <Text style={styles.botTag}>Assistant</Text>}
                <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{item.body}</Text>
                <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{stamp(item.created_at)}</Text>
              </View>
            );
          }}
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Reply to the customer…"
            placeholderTextColor="#9a8b83"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnOff]}
            onPress={send}
            disabled={!draft.trim() || sending}>
            <Icon name="send" size={moderateScale(20)} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ── the list ───────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listPad}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadList(); }} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="chat-bubble-outline" size={moderateScale(40)} color="#c9b8ae" />
            <Text style={styles.emptyTitle}>No customers waiting</Text>
            <Text style={styles.emptyBody}>
              When the shop assistant needs an astrologer, that customer appears here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.waiting && styles.cardWaiting]}
            activeOpacity={0.85}
            onPress={() => loadThread(item.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{stamp(item.lastMessageAt)}</Text>
            </View>
            {item.waiting && <View style={styles.dot}><Text style={styles.dotTxt}>NEW</Text></View>}
            <Icon name="chevron-right" size={moderateScale(22)} color="#b9a79d" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f5f4' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  listPad: { padding: scale(14), flexGrow: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(14),
    marginBottom: verticalScale(10),
    elevation: 2,
  },
  cardWaiting: { borderLeftWidth: 4, borderLeftColor: '#e67e22' },
  name: { fontSize: moderateScale(15), fontWeight: '700', color: '#2b1a12' },
  meta: { fontSize: moderateScale(12), color: '#8a7a71', marginTop: 2 },
  dot: {
    backgroundColor: '#e67e22',
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    marginRight: scale(8),
  },
  dotTxt: { color: '#fff', fontSize: moderateScale(10), fontWeight: '800' },

  empty: { alignItems: 'center', marginTop: verticalScale(80), paddingHorizontal: scale(30) },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#4a352b', marginTop: verticalScale(12) },
  emptyBody: { fontSize: moderateScale(13), color: '#8a7a71', textAlign: 'center', marginTop: verticalScale(6), lineHeight: moderateScale(19) },

  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
  },
  backBtn: { paddingRight: scale(10) },
  threadName: { color: '#fff', fontSize: moderateScale(15), fontWeight: '700' },
  threadPhone: { color: 'rgba(255,255,255,0.75)', fontSize: moderateScale(11) },
  releaseBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
  },
  releaseTxt: { color: '#fff', fontSize: moderateScale(11), fontWeight: '600' },

  thread: { padding: scale(12) },
  bubble: {
    maxWidth: '82%',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    marginBottom: verticalScale(8),
  },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon },
  bubbleTxt: { fontSize: moderateScale(14), color: '#2b1a12', lineHeight: moderateScale(20) },
  bubbleTxtMine: { color: '#fff' },
  bubbleTime: { fontSize: moderateScale(10), color: '#9a8b83', marginTop: 3, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  botTag: { fontSize: moderateScale(10), fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  systemLine: {
    alignSelf: 'center',
    fontSize: moderateScale(11),
    color: '#8a7a71',
    fontStyle: 'italic',
    marginVertical: verticalScale(6),
    textAlign: 'center',
    paddingHorizontal: scale(20),
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: scale(10),
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    maxHeight: verticalScale(110),
    backgroundColor: '#f2efed',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    fontSize: moderateScale(14),
    color: '#2b1a12',
  },
  sendBtn: {
    marginLeft: scale(8),
    backgroundColor: COLORS.AstroMaroon,
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.45 },
});

export default WhatsAppChats;
