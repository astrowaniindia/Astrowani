import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
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

const NotificationScreen = () => {
  const { t } = React.useContext(LanguageContext);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const customerIdRef = useRef(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) { setLoading(false); return; }
      const userData = JSON.parse(userDataStr);
      if (!userData?.id) { setLoading(false); return; }
      customerIdRef.current = userData.id;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('customer_id', userData.id)
        .order('created_at', { ascending: false });
      if (error) console.log('Notification fetch error:', error.message);
      setNotifications(data || []);
    } catch (e) {
      console.log('Error loading notifications:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [load]);

  useEffect(() => {
    const setupChannel = async () => {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (!userDataStr) return;
      const userData = JSON.parse(userDataStr);
      if (!userData?.id) return;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase
        .channel(`customer_notifications_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `customer_id=eq.${userData.id}` }, () => {
          load();
        })
        .subscribe();
    };
    setupChannel();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const markAsRead = async (item) => {
    if (item.is_read) return;
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
  };

  const renderNotification = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationCard, item.is_read ? styles.readCard : styles.unreadCard]}
      onPress={() => markAsRead(item)}>
      <View style={styles.iconContainer}>
        <Icon name="notifications" size={24} color={COLORS.AstroMaroon} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.message}>{item.body}</Text>
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Icon name="notifications-off" size={60} color="gray" />
              <Text style={styles.emptyText}>{t('notifications.none')}</Text>
            </View>
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContainer: {
    padding: scale(15),
    flexGrow: 1,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: scale(15),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(10),
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(15),
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: verticalScale(4),
  },
  message: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(6),
  },
  time: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(100),
  },
  emptyText: {
    marginTop: verticalScale(10),
    fontSize: moderateScale(16),
    color: 'gray',
    fontFamily: 'Lato-Regular',
  },
});

export default NotificationScreen;
