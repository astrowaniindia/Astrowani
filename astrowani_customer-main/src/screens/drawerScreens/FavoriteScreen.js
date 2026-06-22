import {StyleSheet, Text, View, ActivityIndicator} from 'react-native';
import React, {useEffect, useState, useCallback, useRef} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import ReusableList from '../component/ReusableList';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../api/SupabaseClient';
import {moderateScale, verticalScale} from '../../utils/Scaling';

const FavoriteScreen = ({navigation}) => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const channelRef = useRef(null);

  const fetchFavorites = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Token not found');
      const response = await Instance.get('/api/favoriteAstrologer', {
        headers: {Authorization: `Bearer ${token}`},
      });
      setFavorites(response.data.favoriteAstrologer || []);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.log('error ', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on focus + subscribe to Realtime on the customer's favorites so the
  // list updates instantly when the heart is toggled on a profile.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const setup = async () => {
        await fetchFavorites();
        if (!active) return;

        const userDataStr = await AsyncStorage.getItem('userData');
        const user = userDataStr ? JSON.parse(userDataStr) : null;
        if (!user?.id) return;

        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        channelRef.current = supabase
          .channel(`favorites_${user.id}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
          .on(
            'postgres_changes',
            {event: '*', schema: 'public', table: 'favorites', filter: `customer_id=eq.${user.id}`},
            () => { fetchFavorites(); },
          )
          .subscribe();
      };
      setup();
      return () => {
        active = false;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [fetchFavorites]),
  );

  const handleViewprofile = item => {
    navigation.navigate('AstrologerInfo', {person: item});
  };

  return (
    <View style={{flex: 1, backgroundColor: COLORS.AstroSoftOrange}}>
      {loading ? (
        <View style={styles.indicator}>
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
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
        <Text style={styles.notext}>No Favorites yet.{'\n'}Tap the heart on an astrologer's profile to add them here.</Text>
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
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: '#000',
    paddingHorizontal: moderateScale(30),
    lineHeight: moderateScale(24),
  },
});
