// ChatHistoryScreen.js — "Chat History" drawer screen: every conversation this
// customer has ever had, most recently active first. Tapping a row opens
// ChatHistoryThreadScreen.js with the full transcript.
//
// Two kinds of row, both served by GET /api/customer/chat-threads:
//   - `astrologer` — a real paid consultation. All of a customer's sessions with
//     one astrologer merge into ONE row/thread, because the backend keys the
//     thread on sender/receiver rather than session_id (see that endpoint).
//   - `free_chat`  — the free 5-minute welcome chat. Shown with the app's own
//     "Free Chat" label and icon rather than a name, since the persona behind it
//     is admin-editable and a stored name would go stale.
import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';

// A short, WhatsApp-style relative stamp: time for today, "Yesterday", then a
// weekday inside the last week, a plain date beyond it. This list is scanned at a
// glance, so it needs to read quickly rather than be precise.
function formatThreadTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const ChatHistoryScreen = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchThreads = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/customer/chat-threads', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setThreads(res.data.data || []);
        setFailed(false);
      }
    } catch (e) {
      console.warn('Chat history fetch error', e.message);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refetched on every focus, not just mount: a chat finished elsewhere in the
  // app should be at the top the next time this screen is opened.
  useFocusEffect(
    useCallback(() => {
      fetchThreads();
    }, []),
  );

  const openThread = (item) => {
    const isFree = item.kind === 'free_chat';
    captureEvent('chat_history_thread_opened', { kind: item.kind || 'astrologer' });
    navigation.navigate('ChatHistoryThread', {
      kind: item.kind || 'astrologer',
      astrologerId: item.astrologerId,
      name: isFree ? t('chatHistory.freeChat') : item.name,
      profileImage: item.profileImage || null,
    });
  };

  const renderItem = ({ item }) => {
    const isFree = item.kind === 'free_chat';
    const title = isFree ? t('chatHistory.freeChat') : item.name;
    const preview = item.lastMessageFromMe
      ? `${t('chatHistory.you')}${item.lastMessage || ''}`
      : item.lastMessage || '';

    return (
      <TouchableOpacity style={styles.row} onPress={() => openThread(item)} activeOpacity={0.7}>
        {isFree ? (
          <View style={styles.freeAvatar}>
            <Icon name="sparkles" size={moderateScale(22)} color="#fff" />
          </View>
        ) : (
          <Image
            source={item.profileImage ? { uri: item.profileImage } : require('../../assets/images/esoteric.png')}
            style={styles.avatar}
          />
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={styles.name} numberOfLines={1}>{title}</Text>
            <Text style={styles.time}>{formatThreadTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowBottomLine}>
            <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
            {isFree && (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>{t('chatHistory.freeTag')}</Text>
              </View>
            )}
          </View>
        </View>
        <Icon name="chevron-forward" size={moderateScale(18)} color="rgba(89,42,25,0.3)" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={threads}
        // The free chat has no astrologer id of its own, so its synthetic
        // 'free_chat' key doubles as the list key.
        keyExtractor={(item) => String(item.astrologerId || item.kind)}
        renderItem={renderItem}
        contentContainerStyle={threads.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchThreads(true)} colors={[COLORS.AstroMaroon]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="chatbubbles-outline" size={moderateScale(52)} color="rgba(89,42,25,0.3)" />
            <Text style={styles.emptyText}>
              {failed ? t('chatHistory.loadFailed') : t('chatHistory.empty')}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  listContent: { paddingBottom: verticalScale(10) },
  emptyContainer: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  avatar: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    marginRight: scale(12),
    backgroundColor: '#eee',
  },
  freeAvatar: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    marginRight: scale(12),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(3),
  },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, fontSize: moderateScale(15.5), fontWeight: '700', color: '#241A16', marginRight: scale(8) },
  time: { fontSize: moderateScale(11.5), color: '#8a8a8a' },
  preview: { flex: 1, fontSize: moderateScale(13), color: '#6B5C55' },
  freeBadge: {
    marginLeft: scale(8),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(10),
    backgroundColor: 'rgba(89,42,25,0.08)',
  },
  freeBadgeText: {
    fontSize: moderateScale(9.5),
    fontWeight: '700',
    color: COLORS.AstroMaroon,
    letterSpacing: 0.4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: verticalScale(80),
    paddingHorizontal: scale(30),
  },
  emptyText: { marginTop: verticalScale(12), fontSize: moderateScale(14), color: '#8a8a8a', textAlign: 'center' },
});

export default ChatHistoryScreen;
