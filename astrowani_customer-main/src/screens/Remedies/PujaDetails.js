import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';


const PujaDetails = ({ navigation }) => {
  const [pujaData, setPujaData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPujaDetails = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get('/api/astro-services/pujas', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.data && response.data.pujas) {
          setPujaData(response.data.pujas);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPujaDetails();
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('BookPujaScreen', { pujas: item })} style={styles.card}>
      <Image source={{ uri: item.image || 'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7', }} style={styles.image} />
      <View style={styles.infoContainer}>
        <Text style={styles.title}>{item.pujaName || 'Puja name'}</Text>
        <Text style={styles.description}>{item.description || 'No description available'}</Text>

        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Icon name="clock-o" size={moderateScale(16)} color={COLORS.AstroGold} />
            <Text style={styles.detailText}>{item.duration || 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Icon name="user" size={moderateScale(16)} color={COLORS.AstroGold} />
            <Text style={styles.detailText}>{item.pujaGodGoddes || 'N/A'}</Text>
          </View>
        </View>

        <Text style={styles.price}>₹{item.price || '0'}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.AstroGold} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList data={pujaData} renderItem={renderItem} keyExtractor={item => item._id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  listContainer: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(15),
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  errorText: {
    color: COLORS.red,
    fontSize: moderateScale(16),
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(15),
    overflow: 'hidden',
    elevation: 3,
  },
  image: {
    width: scale(120),
    height: verticalScale(150),
  },
  infoContainer: {
    flex: 1,
    padding: moderateScale(10),
  },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(5),
  },
  description: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(10),
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: verticalScale(10),
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    marginLeft: scale(5),
  },
  price: {
    color: COLORS.AstroGold,
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    alignSelf: 'flex-end',
  },
});

export default PujaDetails;


