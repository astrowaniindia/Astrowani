import React, { useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';
import { COLORS } from '../../Theme/Colors';
import useNotificationBadgeSync from '../../utils/useNotificationBadgeSync';
import { LanguageContext } from '../../context/LanguageContext';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default function Notification() {
  const { t } = useContext(LanguageContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [astroId, setAstroId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem('astroId');
      if (!id) return;
      setAstroId(id);

      const { data: notificationsData, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('astrologer_id', id)
        .order('created_at', { ascending: false });

      if (error) console.log('Supabase error:', error.message);
      setData(notificationsData || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live refresh via the backend's existing socket event (see
  // utils/useNotificationBadgeSync.js) instead of this screen's own direct
  // Supabase Realtime subscription.
  useNotificationBadgeSync(astroId, fetchData);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const markAsRead = async (item) => {
    if (item.is_read) return;
    setData((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationCard, item.is_read ? styles.readCard : styles.unreadCard]}
      onPress={() => markAsRead(item)}>
      <Text style={styles.notificationTitle}>{item.title}</Text>
      <Text style={styles.notificationDescription}>{item.body}</Text>
      <Text style={styles.notificationTime}>{timeAgo(item.created_at)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      ) : (
        <FlatList
          data={data}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.notificationList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="notifications-off" size={60} color="gray" />
              <Text style={styles.noNotificationsText}>{t('notification.noNotifications')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  notificationList: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  notificationCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.AstroMaroon,
  },
  readCard: {
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    opacity: 0.7,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
    marginBottom: 8,
  },
  notificationDescription: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: '#888',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
  },
  noNotificationsText: {
    marginTop: 10,
    fontSize: 16,
    color: '#888',
  },
});
