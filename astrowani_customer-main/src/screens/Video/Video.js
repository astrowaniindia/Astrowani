import {StyleSheet, Text, View, ActivityIndicator} from 'react-native';
import React, {useEffect, useState} from 'react';
import ReusableList from '../component/ReusableList';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';

const Video = ({navigation}) => {
  const [astrologer, setAstrologer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAstrologer = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');
        const response = await Instance.get('/api/astrologers', {
          headers: {Authorization: token},
        });
        setAstrologer(response.data.data);
        console.log('chat');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAstrologer();
  }, []);

  const handleVideoCall = () => {
    navigation.navigate('EnxConferenceScreen')
  };
  const handleAstrologer = item => {
    navigation.navigate('AstrologerInfo', {
      person: item,
    });
  };

  if (loading) {
    return (
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return <Text style={styles.errorText}>Error: {error}</Text>;
  }
  return (
    <ReusableList
      data={astrologer}
      handleAstrologer={handleAstrologer}
      actionButton={handleVideoCall}
      buttonType="video"
    />
  );
};

export default Video;

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
});
