import { StyleSheet, Text, View, FlatList, Image } from 'react-native'
import React, { useEffect, useState } from 'react'
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';

const CallHistory = ({ navigation }: any) => {
  const [callData, setCallData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // const [callHIstory, setCallHistory] = useState<any>([])


  const getAllCallHistory = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        setLoading(false);
        return;
      }

      // Query the Supabase table (which will be empty for now)
      const { data, error } = await supabase
        .from('call_history')
        .select('*')
        .eq('astrologer_id', astroId)
        .order('start_time', { ascending: false });

      if (error) {
        console.log("Error fetching from Supabase:", error);
      }

      setCallData(data || []);
      setLoading(false);

    } catch (error) {
      console.log("Error fetching call history: ", error);
      setLoading(false);
    }
  };


  useEffect(() => {
    getAllCallHistory();
  }, []);

  const renderItem = ({ item }: any) => {
    const refId = item.session_id || item.id || 'N/A';
    const customerName = item.client_name || item.customer_name || 'Customer';
    const avatar = item.client_avatar || item.customer_avatar || 'https://via.placeholder.com/100';
    const status = item.status || 'Completed';
    const time = new Date(item.start_time || item.created_at || Date.now()).toLocaleString('en-IN');
    const rate = item.rate || item.charge_per_minute || 0;
    const duration = item.duration || item.duration_minutes || 0;
    const deduction = item.deduction || item.total_charge || (rate * duration);

    return (
      <View style={styles.card}>
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
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'black' }}>Loading...</Text>
        </View>
      ) :
        <FlatList
          data={callData}
          renderItem={renderItem}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          contentContainerStyle={{ paddingBottom: verticalScale(30) }}
          ListEmptyComponent={!loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 }}><Text>No call history found</Text></View> : null}
        />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: scale(15),
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

export default CallHistory;
