import {StyleSheet, Text, View, ActivityIndicator} from 'react-native';
import React, {useEffect, useState} from 'react';
import ReusableList from '../component/ReusableList';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const FavoriteScreen = ({navigation}) => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [favorites, setFevorites] = useState(null);

  useEffect(() => {
    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) {
          throw new Error('Token not found');
        }
        const response = await Instance.get('/api/favoriteAstrologer', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log('data', response.data);
        setFevorites(response.data.favoriteAstrologer);
      } catch (err) {
        setError(err.message);
        console.log('error ', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFavorites();
  }, [navigation]);
  const astrologers = [
    {
      id: '1',
      image:
        'https://th.bing.com/th/id/OIP.xHU435DrZMf0aN-ri48zEAHaJQ?w=126&h=180&c=7&r=0&o=5&pid=1.7',
      name: 'Sudipta Astro',
      specialization: 'Vedic Astrology',
      languages: 'English, Hindi, Bengali',
      experience: '10 Years',
      rating: 4,
      reviews: '4142',
      price: '₹50/min',
      offer: 'FREE',

      isLive: true,
    },
    {
      id: '2',
      image:
        'https://th.bing.com/th/id/OIP.xHU435DrZMf0aN-ri48zEAHaJQ?w=126&h=180&c=7&r=0&o=5&pid=1.7',

      name: 'Astro Girish',
      specialization: 'Vedic Astrology',
      languages: 'English, Hindi, Sanskrit',
      experience: '7 Years',
      reviews: '1035',
      price: '₹15/min',
      offer: 'FREE',
      isLive: true,
      rating: 4,
    },
  ];
  const handleViewprofile = item => {
    navigation.navigate('AstrologerInfo', {person: item});
  };
  return (
    <View style={{flex: 1, backgroundColor: COLORS.AstroSoftOrange}}>
      {loading ? (
        <View style={styles.indicator}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : favorites && favorites.length > 0 ? (
        <ReusableList
          data={favorites}
          handleAstrologer={handleViewprofile}
          actionButton={handleViewprofile}
          buttonType="view profile"
        />
      ) : (
        <Text style={styles.notext}>No Favorites</Text>
      )}
    </View>
  );
};

export default FavoriteScreen;

const styles = StyleSheet.create({
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
  notext: {
    textAlign: 'center',
    marginVertical: verticalScale(50),
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#000',
  },
});
