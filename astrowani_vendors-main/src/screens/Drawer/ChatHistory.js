import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, ActivityIndicator, Alert, } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { supabase } from '../../api/SupabaseClient';
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

      // Query the Supabase table (which will be empty for now)
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('astrologer_id', astroId)
        .order('last_message_time', { ascending: false });

      if (error) {
        console.log("Error fetching from Supabase:", error);
      }

      setData(data || []);
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
    return (
      <TouchableOpacity onPress={() => navigation.navigate('Chat', { user: item, userId: item.id, session: item.session_id, roomId: item.room_id })} style={styles.chatItem}>
        <Image source={{ uri: item.client_avatar || 'https://cdn-icons-png.flaticon.com/128/149/149071.png' }} style={styles.profileImage} />
        <View style={styles.chatDetails}>
          <View style={styles.header}>
            <Text style={styles.name} >{item.client_name || 'Unknown User'}</Text>
            <Text style={styles.email}>{item.client_email}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.arrowIcon}>
          <Icon name="chevron-forward-outline" size={20} color="black" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };
  // Conditional rendering based on loading state
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.AstroSoftOrange || '#000'} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat History</Text>
      </View>
      <FlatList
        data={data}
        keyExtractor={item => item._id || item.id}
        renderItem={renderChatItem}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyText}>No chat history available.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: COLORS.AstroMaroon,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(15),
    paddingHorizontal: scale(10),
  },
  backButton: {
    paddingRight: scale(15),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: '#fff',
  },
  container: {
    padding: scale(10),
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: scale(15),
    marginVertical: verticalScale(5),
    borderRadius: moderateScale(10),
    elevation: verticalScale(2),
  },
  profileImage: {
    width: scale(50),
    height: scale(50),
    borderRadius: moderateScale(25),
    marginRight: scale(15),
  },
  chatDetails: {
    flex: 1,
  },
  header: {
    // flexDirection: 'row',
    // alignItems: 'center',
    // justifyContent: 'space-between',
  },
  name: {
    fontWeight: 'bold',
    fontSize: moderateScale(16),
    color: '#000',
    width: scale(100),
  },
  email: {
    fontSize: moderateScale(12),
    color: '#555',
  },
  arrowIcon: {
    justifyContent: 'center',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: moderateScale(16),
    color: 'gray',
    marginTop: verticalScale(20),
  },
});

export default ChatHistory;
