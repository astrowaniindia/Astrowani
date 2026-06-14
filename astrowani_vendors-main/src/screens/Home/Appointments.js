import { StyleSheet, Text, View, Alert, Image, ScrollView, } from 'react-native';
import React, { useEffect, useState } from 'react';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scale } from '../../utils/Scaling';

export default function Appointments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        Alert.alert('Error', 'Token is missing. Please log in again.');
        return;
      }
      const response = await Instance.get('/api/appointments/get-all-astrologer-appointments', { headers: { Authorization: `Bearer ${token}`, }, });
      console.log("response: ", response?.data);

      if (response.data.success) {
        setData(response.data.data);
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


  const renderAppointments = () => {
    if (!data) return null;
    return (
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          <Image style={styles.userImage} source={{ uri: data.profileImage }} />
        </View>
        <Text style={styles.nameText}>{data.name}</Text>
        <Text style={styles.bioText}>{data.bio}</Text>
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Email:</Text> {data.email}
          </Text>

          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Specialties:</Text>{' '}{data.specialties.map(s => s.name).join(', ')}
          </Text>

          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Experience:</Text> {data.experience}{' '}years
          </Text>

          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Rating:</Text> {data.rating} ★
          </Text>

          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Pricing:</Text> ₹{data.pricing}/session
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* {loading ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : (
        renderAppointments()
      )} */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5F5F5',
    // padding: 16,
    // alignItems: 'center',
    // justifyContent: 'center',
    marginHorizontal: scale(14),
    marginTop: scale(10),
    alignSelf: 'center',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 18,
    color: '#777',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 8,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 16,
  },
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 10,
  },
  userImage: {
    width: '100%',
    height: '100%',
  },
  nameText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#777',
    textAlign: 'center',
    marginBottom: 15,
  },
  infoContainer: {
    alignSelf: 'stretch',
    marginVertical: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  infoLabel: {
    fontWeight: 'bold',
    color: '#333',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#FF6347',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: 'bold',
  },
});
