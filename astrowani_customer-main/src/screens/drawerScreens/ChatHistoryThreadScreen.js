// ChatHistoryThreadScreen.js — the full transcript of ONE conversation, reached
// from ChatHistoryScreen.js.
//
// Read-only on purpose: there is no text box. Sending a message only means
// anything inside a live, billed session (ChatSessionScreen.js); what this adds
// is the ability to look back at what was already said.
//
// Serves both kinds of thread, which differ only in which endpoint they read:
//   - `astrologer` — GET /api/customer/chat-threads/:astrologerId, every message
//     ever exchanged with that astrologer, merged across all their sessions.
//   - `free_chat`  — GET /api/customer/free-chat-thread, the free welcome chat's
//     transcript (stored by POST /api/free-bot-chat/messages while it happens).
// Both return the same message shape — { id, message, created_at, fromMe } — so
// everything below this fetch is shared.
import React, { useContext, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

const ChatHistoryThreadScreen = ({ navigation, route }) => {
  const { t } = useContext(LanguageContext);
  const { kind, astrologerId, name: routeName } = route.params || {};
  const isFree = kind === 'free_chat';

  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState(routeName || '');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || t('chatHistory.title') });
  }, [navigation, title, t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const url = isFree
          ? '/api/customer/free-chat-thread'
          : `/api/customer/chat-threads/${astrologerId}`;
        const res = await Instance.get(url, { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (res.data?.success) {
          setMessages(res.data.data || []);
          // The astrologer's current name wins over whatever the list row was
          // built with — they may have changed it since that message was sent.
          if (!isFree && res.data.astrologer?.name) setTitle(res.data.astrologer.name);
          setFailed(false);
        }
      } catch (e) {
        console.warn('Chat history thread fetch error', e.message);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [astrologerId, isFree]);

  const renderMessage = ({ item }) => {
    const time = item.created_at
      ? new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <View style={[styles.bubble, item.fromMe ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, item.fromMe && styles.myBubbleText]}>{item.message}</Text>
        <Text style={[styles.timeText, item.fromMe && styles.myTimeText]}>{time}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.hintBar}>
        <Icon name="information-circle-outline" size={moderateScale(15)} color="#6B5C55" style={styles.hintIcon} />
        <Text style={styles.hintText} numberOfLines={2}>
          {isFree ? t('chatHistory.freeChatHint') : t('chatHistory.readOnlyHint')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
        </View>
      ) : (
        <ImageBackground
          source={require('../../assets/images/background.jpg')}
          style={styles.flex}
          imageStyle={styles.bgImage}
        >
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.messagesList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {failed ? t('chatHistory.loadFailed') : t('chatHistory.noMessages')}
                </Text>
              </View>
            }
          />
        </ImageBackground>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  bgImage: { opacity: 0.12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(89,42,25,0.06)',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(89,42,25,0.15)',
  },
  hintIcon: { marginRight: scale(6), marginTop: verticalScale(1) },
  hintText: { flex: 1, fontSize: moderateScale(11.5), color: '#6B5C55', lineHeight: moderateScale(16) },
  messagesList: { padding: scale(12), paddingBottom: verticalScale(20), flexGrow: 1 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: scale(30) },
  emptyText: { fontSize: moderateScale(13.5), color: '#6B5C55', textAlign: 'center' },
  bubble: {
    maxWidth: '80%',
    borderRadius: moderateScale(18),
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(9),
    marginBottom: verticalScale(10),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: moderateScale(4) },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: moderateScale(4) },
  bubbleText: { color: '#2c3e50', fontSize: moderateScale(14.5), lineHeight: moderateScale(21) },
  myBubbleText: { color: '#fff' },
  timeText: { fontSize: moderateScale(10), color: '#888', alignSelf: 'flex-end', marginTop: verticalScale(3) },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },
});

export default ChatHistoryThreadScreen;
