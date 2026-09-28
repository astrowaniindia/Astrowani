// ChatHistoryList.js — "Chat History" drawer screen: a WhatsApp-style list of every
// customer this astrologer has ever exchanged chat messages with, most recently
// active first. Tapping a row opens ChatHistoryThread.js, which shows every message
// with that customer merged into one conversation — regardless of how many separate
// paid sessions those messages actually came from.
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
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

// A short, WhatsApp-style relative stamp: time for today, weekday for the last week,
// a plain date otherwise. Chat history is looked at often, so this needs to read at
// a glance, not just be technically correct.
function formatThreadTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const withinWeek = now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000;
  if (withinWeek) return d.toLocaleDateString('en-IN', { weekday: 'short' });

  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const ChatHistoryList = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchThreads = async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/api/vendor/chat-threads', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setThreads(res.data.data || []);
        setFailed(false);
      }
    } catch (e) {
      console.log('[ChatHistoryList] fetch failed:', e.message);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refreshes every time the screen is focused (not just on mount) — a new message
  // sent from an active session elsewhere in the app should bump that customer to
  // the top the next time the astrologer opens this list.
  useFocusEffect(
    useCallback(() => {
      fetchThreads(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const openThread = (item) => {
    navigation.navigate('ChatHistoryThread', {
      customerId: item.customerId,
      name: item.name,
      profileImage: item.profileImage,
    });
  };

  const renderItem = ({ item }) => {
    const preview = item.lastMessageFromMe
      ? `${t('chatHistory.you')}${item.lastMessage}`
      : item.lastMessage;
    return (
      <TouchableOpacity style={styles.row} onPress={() => openThread(item)} activeOpacity={0.7}>
        <Image
          source={item.profileImage ? { uri: item.profileImage } : require('../../assets/images/esoteric.png')}
          style={styles.avatar}
        />
        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.time}>{formatThreadTime(item.lastMessageAt)}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={1}>{preview || ''}</Text>
        </View>
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
        keyExtractor={(item) => String(item.customerId)}
        renderItem={renderItem}
        contentContainerStyle={threads.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchThreads(true)} colors={[COLORS.AstroMaroon]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="chatbubbles-outline" size={moderateScale(52)} color="rgba(89,42,25,0.3)" />
            <Text style={styles.emptyText}>{failed ? t('chatHistory.loadFailed') : t('chatHistory.empty')}</Text>
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
  rowBody: { flex: 1, minWidth: 0 },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(3),
  },
  name: { flex: 1, fontSize: moderateScale(15.5), fontWeight: '700', color: '#241A16', marginRight: scale(8) },
  time: { fontSize: moderateScale(11.5), color: '#8a8a8a' },
  preview: { fontSize: moderateScale(13), color: '#6B5C55' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: verticalScale(80), paddingHorizontal: scale(30) },
  emptyText: { marginTop: verticalScale(12), fontSize: moderateScale(14), color: '#8a8a8a', textAlign: 'center' },
});

export default ChatHistoryList;
