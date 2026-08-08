import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, ActivityIndicator, Alert, } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { supabase } from '../../api/SupabaseClient';
import { resolveCustomerNames } from '../../utils/customerNames';
import { COLORS } from '../../Theme/Colors';

const ChatHistory = ({ navigation }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch chat data from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        setLoading(false);
        return;
      }

      // Query the live sessions table
      const { data: records, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('vendor_id', astroId)
        .order('created_at', { ascending: false });

      if (error) {
        console.log("Error fetching from Supabase:", error);
      }
      
      if (records) {
        const custMap = await resolveCustomerNames(records.map(r => r.caller_id));

        const formatted = records.map(item => {
          const cust = custMap[item.caller_id];
          const end = new Date(item.ended_at || item.created_at);
          const start = new Date(item.created_at);
          const durationMins = Math.max(1, Math.ceil((end - start) / 60000));
          const earnings = durationMins * (item.per_minute_charge || 0);

          return {
            id: item.id?.toString(),
            session_id: item.request_id || item.id || 'N/A',
            client_name: cust?.name || 'Customer',
            client_avatar: cust?.profileImage || 'https://via.placeholder.com/100',
            last_message_time: item.created_at,
            rate: item.per_minute_charge || 0,
            duration: durationMins,
            deduction: earnings,
            status: item.ended_at ? 'Completed' : 'Ended'
          };
        });
        setData(formatted);
      }

      setLoading(false);

    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  // useEffect for initial data load
  useEffect(() => {
    fetchData();
  }, []);

  // console.log("setData: : ", data);


  const renderChatItem = ({ item }) => {
    const refId = item.session_id || item.room_id || item.id || 'N/A';
    const customerName = item.client_name || 'Unknown User';
    const avatar = item.client_avatar || 'https://via.placeholder.com/100';
    const status = item.status || 'Completed';
    const time = item.last_message_time ? new Date(item.last_message_time).toLocaleString('en-IN') : 'N/A';
    const rate = item.rate || item.charge_per_minute || 0;
    const duration = item.duration || item.duration_minutes || 0;
    const deduction = item.deduction || item.total_charge || (rate * duration);

    return (
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => navigation.navigate('Chat', { user: item, userId: item.id, session: item.session_id, roomId: item.room_id })} 
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.refId}>Reference ID: {refId}</Text>
        </View>
        <View style={styles.divider} />
        
        <View style={styles.body}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: avatar }} style={styles.avatar} />
            <View style={styles.viewProfileBtn}>
              <Text style={styles.viewProfileText}>View Profile</Text>
            </View>
          </View>

          <View style={styles.details}>
            <Text style={styles.name}>{customerName}</Text>
            <Text style={[styles.statusText, status === 'Missed' ? styles.redText : styles.greenText]}>
              {status} Session
            </Text>
            <Text style={styles.meta}>{time}</Text>
            
            <Text style={styles.infoText}>Astrologer Rate: ₹{rate}/min</Text>
            <Text style={styles.infoText}>Duration: {duration} min</Text>
            <Text style={styles.infoText}>Earnings: ₹{deduction}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Rate us: </Text>
          <View style={styles.stars}>
            <Icon name="star" size={16} color="#FFD700" />
            <Icon name="star" size={16} color="#FFD700" />
            <Icon name="star" size={16} color="#FFD700" />
            <Icon name="star" size={16} color="#FFD700" />
            <Icon name="star" size={16} color="#FFD700" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  // Conditional rendering based on loading state
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon || '#000'} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item._id?.toString() || item.id?.toString() || index.toString()}
        renderItem={renderChatItem}
        contentContainerStyle={{ padding: scale(15), paddingBottom: verticalScale(30) }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 }}><Text style={styles.emptyText}>No chat history available.</Text></View>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: moderateScale(16),
    color: 'gray',
  },
  card: {
    backgroundColor: '#F5E6D3',
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(15),
    overflow: 'hidden',
    elevation: 3,
  },
  header: {
    paddingVertical: verticalScale(10),
    alignItems: 'center',
  },
  refId: {
    fontSize: moderateScale(12),
    fontWeight: 'bold',
    color: '#000',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: scale(15),
  },
  body: {
    flexDirection: 'row',
    padding: scale(15),
  },
  avatarContainer: {
    alignItems: 'center',
    marginRight: scale(15),
  },
  avatar: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(30),
    marginBottom: verticalScale(8),
  },
  viewProfileBtn: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
  },
  viewProfileText: {
    color: '#2E7D32',
    fontSize: moderateScale(10),
    fontWeight: 'bold',
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#000',
  },
  statusText: {
    fontSize: moderateScale(12),
    fontWeight: 'bold',
    marginTop: verticalScale(2),
  },
  greenText: {
    color: '#2E7D32',
  },
  redText: {
    color: '#D32F2F',
  },
  meta: {
    fontSize: moderateScale(12),
    color: '#555',
    marginBottom: verticalScale(6),
  },
  infoText: {
    fontSize: moderateScale(12),
    color: '#000',
    fontWeight: 'bold',
    marginTop: verticalScale(2),
  },
  footer: {
    backgroundColor: '#4A2A22',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  footerText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  stars: {
    flexDirection: 'row',
    marginLeft: scale(5),
  },
});

export default ChatHistory;
