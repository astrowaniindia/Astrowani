import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, Alert, ActivityIndicator, } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';

export default function Notification() {
  const [data, setData] = useState([]); // To store notifications
  const [loading, setLoading] = useState(false); // To handle loading state

  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        setLoading(false);
        return;
      }

      const { data: notificationsData, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('astrologer_id', astroId)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Supabase error:', error);
      }

      setData(notificationsData || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // Run only once when the component is mounted

  const renderNotificationItem = ({ item }) => (
    <View style={styles.notificationCard}>
      <Text style={styles.notificationTitle}>{item.title}</Text>
      <Text style={styles.notificationDescription}>{item.message}</Text>
      <Text style={styles.notificationTime}>
        {new Date(item.createdAt).toLocaleTimeString()} {/* Format the creation time */}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? ( // Show loading indicator when data is being fetched
        <ActivityIndicator size="large" color="#FF6347" />
      ) : data.length === 0 ? ( // Show message if no notifications are available
        <Text style={styles.noNotificationsText}>No notifications</Text>
      ) : (
        <FlatList
          data={data}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id || item._id}
          contentContainerStyle={styles.notificationList}
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
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6347',
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
  noNotificationsText: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
});
