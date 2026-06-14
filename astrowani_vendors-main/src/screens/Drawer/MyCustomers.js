import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../api/SupabaseClient';

const MyCustomers = () => {
  const navigation = useNavigation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const astroId = await AsyncStorage.getItem('astroId');
      if (!astroId) {
        setLoading(false);
        return;
      }

      const { data: customerData, error } = await supabase
        .from('customers')
        .select('*')
        .eq('astrologer_id', astroId)
        .order('last_connected', { ascending: false });

      if (error) {
        console.log('Supabase error:', error);
      }

      setData(customerData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const renderCustomerItem = ({ item }) => (
    <View style={styles.customerItem}>
      <View style={styles.customerRow}>
        <Image source={{ uri: item.profilePic }} style={styles.profileImage} />
        <View style={styles.customerDetails}>
          <Text style={styles.customerName}>{item.firstName} {item.lastName}</Text>
          <Text style={styles.customerInfo}>Last connected on:{' '}
            <Text style={{ fontWeight: 'bold' }}>{new Date(item.endTime).toLocaleString()}</Text>
          </Text>

          <Text style={styles.customerInfo}>Session type:{' '}
            <Text style={{ color: 'green', fontWeight: 'bold' }}>{item.sessionType}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Icon name="heart-outline" size={20} color="red" />
          <Text style={styles.actionText}>Mark as Favorite</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Icon name="close-circle-outline" size={20} color="black" />
          <Text style={styles.actionText}>Block</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Chat', { roomId: item.sessionId, users: item })} style={styles.actionButton}>
          <Icon name="chatbubble-ellipses-outline" size={20} color="black" />
          <Text style={styles.actionText}>Send Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id || item.sessionId}
          renderItem={renderCustomerItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No customers found.</Text>}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(10),
  },
  listContent: {
    paddingBottom: verticalScale(10),
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',

    borderBottomColor: COLORS.AshGray,
    borderBottomWidth: verticalScale(1),
    paddingBottom: verticalScale(10),
  },
  customerItem: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(15),
    marginVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    elevation: verticalScale(2),
  },
  profileImage: {
    width: scale(55),
    height: scale(55),
    borderRadius: moderateScale(30),
    marginRight: scale(10),
  },
  customerDetails: {},
  customerName: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: verticalScale(4),
  },
  customerInfo: {
    fontSize: moderateScale(12),
    color: '#000',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: verticalScale(10),
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: moderateScale(12),
    marginLeft: scale(2),
    fontWeight: 'bold',
    color: COLORS.AstroMaroon,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: moderateScale(16),
    color: 'gray',
    marginTop: verticalScale(20),
  },
});

export default MyCustomers;
