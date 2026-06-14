import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../../utils/Scaling';
import { COLORS } from '../../../Theme/Colors';

const ariesData = {
  sign: 'aries',
  name: 'Aries',
  dateRange: { start: '2024-03-21', end: '2024-04-19' }
};

const Horoscope = ({ navigation }) => {
  const [horoscopeData, setHoroscopeData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatDate = dateString => {
    const date = new Date(dateString);
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const fetchHoroscope = async () => {
    try {
      const response = await fetch('https://astrowani-fb6pi.ondigitalocean.app/api/free-services/horoscope?sign=aries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // if (!response.ok) {
      //   throw new Error(`HTTP error! status: ${response.status}`);
      // }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching horoscope for Aries:', error);
      throw error;
    }
  };

  useEffect(() => {
    const fetchAries = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetchHoroscope();

        console.log("response", response)
        setHoroscopeData({
          _id: ariesData.sign,
          zodiacSign: response.data.daily_prediction.sign_name,
          dateRange: ariesData.dateRange,
          prediction: response.data.daily_prediction.prediction,
          date: response.data.daily_prediction.date,
        });
      } catch (err) {
        console.error('Failed to fetch horoscope for Aries:', err);
        setError('Unable to fetch horoscope data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchAries();
  }, []);

  const renderAries = () => (
    <TouchableOpacity
      onPress={() => navigation.navigate('HoroscopeDetails', { data: horoscopeData })}
      style={styles.signContainer}>
      <View style={styles.imageWrapper}>
        <Image
          source={{
            uri: 'https://www.bing.com/th?id=OIP.CtB9-R0mxlASJmUU3FkwKgHaHa&w=142&h=150&c=8&rs=1&qlt=90&o=6&pid=3.1&rm=2',
          }}
          style={styles.signImage}
        />
      </View>
      <Text style={styles.signName}>{horoscopeData.zodiacSign}</Text>
      <Text style={styles.signDate}>
        {`${formatDate(horoscopeData.dateRange.start)} - ${formatDate(horoscopeData.dateRange.end)}`}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aries Horoscope</Text>
      {loading ? (
        <View style={styles.indicator}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : horoscopeData ? (
        renderAries()
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    paddingTop: verticalScale(20),
    alignItems: 'center',
  },
  title: {
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(20),
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    paddingVertical: verticalScale(10),
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  signContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(25),
  },
  signImage: {
    width: scale(50),
    height: scale(50),
    marginBottom: verticalScale(10),
  },
  signName: {
    fontSize: moderateScale(16),
    marginBottom: verticalScale(3),
    fontFamily: 'Lato-Regular',
    color: '#d32f2f',
  },
  signDate: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
  },
});

export default Horoscope;