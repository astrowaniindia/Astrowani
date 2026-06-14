import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';

export default function Consultation() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');8210574144
      if (!token) {
        Alert.alert('Error', 'Token is missing. Please log in again.');
        return;
      }
      const response = await Instance.get('/api/consultations/get-astrologer-consultations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.data && response.data) {
        setData(response.data); 
        console.log('Profile data fetched successfully88888:', response.data);
      } else {
        Alert.alert('Error', response.data.message || 'Failed to fetch data.'); 
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Consultation Type: {item.type }</Text>
      <Text style={styles.cardContent}>
        Scheduled At: {new Date(item.scheduledAt).toLocaleString()}
      </Text>
      <Text style={styles.cardContent}>Duration: {item.duration} minutes</Text>
      <Text style={styles.cardContent}>Charge: ₹{item.charge}</Text>
      <Text style={styles.cardContent}>
        Name: {item.userId?.firstName} {item.userId?.lastName || ''}
      </Text>
      <Text style={styles.cardContent}>
        Mobile: {item.userId?.phoneNumber}
      </Text>
      <Text style={styles.cardContent}>Notes: {item.notes}</Text>
    </View>
  );
  
  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#FF6347" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item._id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      ) : (
        <Text style={styles.noDataText}>No consultations available.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginTop: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6347',
    marginBottom: 8,
  },
  cardContent: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#FF6347',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  list: {
    paddingBottom: 16,
  },
});
