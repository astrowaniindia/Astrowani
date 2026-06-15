import { StyleSheet, Text, View, FlatList, ActivityIndicator } from 'react-native';
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';

export default function ChatHistorys() {
  const [chatData, setChatData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const userStr = await AsyncStorage.getItem('userData');
        const user = userStr ? JSON.parse(userStr) : null;
        const myId = user?._id || user?.id || user?.userId;
        if (!myId) return;

        const { data: records, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('vendor_id', myId)
          .order('created_at', { ascending: false });
        
        if (records) {
          const { data: customers } = await supabase.from('customers').select('id, first_name, last_name');
          const custMap = {};
          if (customers) customers.forEach(c => custMap[c.id] = c);

          const formatted = records.map(item => {
            const cust = custMap[item.caller_id];
            const name = cust ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : 'Customer';
            const start = new Date(item.created_at);
            const end = item.ended_at ? new Date(item.ended_at) : new Date();
            const durationMins = Math.max(1, Math.ceil((end - start) / 60000));
            const earnings = durationMins * (item.per_minute_charge || 0);

            return {
              id: item.id?.toString(),
              name: name || 'Customer',
              lastMessage: `Duration: ${durationMins} min | Earned: ₹${earnings}`,
              time: start.toLocaleDateString('en-IN')
            };
          });
          setChatData(formatted);
        }
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Chat History</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#800000" />
      ) : (
        <FlatList
          data={chatData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.chatItem}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={{fontSize: 12, color: '#888'}}>{item.time}</Text>
              </View>
              <Text style={styles.message}>{item.lastMessage}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>No chat history found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  chatItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  message: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
});
