import { StyleSheet, Text, View, FlatList, Image, StatusBar, TouchableOpacity } from 'react-native'
import React, { useEffect, useState } from 'react'
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';


const callData = [
  {
    id: '1',
    name: 'John Doe',
    time: 'Today, 10:30 AM',
    type: 'Incoming',
    status: 'Missed',
    avatar: 'https://i.pravatar.cc/100?img=1'
  },
  {
    id: '2',
    name: 'Jane Smith',
    time: 'Yesterday, 8:15 PM',
    type: 'Outgoing',
    status: 'Completed',
    avatar: 'https://i.pravatar.cc/100?img=2'
  },
  {
    id: '3',
    name: 'Alex Lee',
    time: 'Monday, 5:45 PM',
    type: 'Incoming',
    status: 'Completed',
    avatar: 'https://i.pravatar.cc/100?img=3'
  },
]

export default function CallHistory({ navigation }: any) {
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

  const renderItem = ({ item }: any) => (
    <View style={styles.item}>
      <Image source={{ uri: item?.avatar }} style={styles.avatar} />
      <View style={styles.details}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>{item.time} · {item.type}</Text>
      </View>
      <Text style={[styles.status, item.status === 'missed' ? styles.missed : styles.completed]}>{item.status}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar />
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call History</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'black' }}>Loading...</Text>
        </View>
      ) :
        <FlatList
          data={callData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={!loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>No call history found</Text></View> : null}
        />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#800000', // AstroMaroon equivalent
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 10,
  },
  backButton: {
    paddingRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc'
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25
  },
  details: {
    flex: 1,
    marginLeft: 12
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  meta: {
    fontSize: 14,
    color: '#666'
  },
  status: {
    fontSize: 14,
    fontWeight: '600'
  },
  missed: {
    color: 'red'
  },
  completed: {
    color: 'green'
  }
})
