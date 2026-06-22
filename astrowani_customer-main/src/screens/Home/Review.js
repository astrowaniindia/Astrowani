import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, ScrollView } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import StarRating from '../../components/StarRating';

const CustomerReview = ({ review }) => {
  const [user, setUser] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  // console.log(feedback, 'this  is feedback');
  /* const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Token not found');
      }
      const response = await Instance.get('/api/users/profile', {headers: {Authorization: `Bearer ${token}`,},});
      feedbackData()
      if (response.data) {
        setUser(response.data.data);
        // console.log('user', response.data.data);
      }
      // setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
    }
  }; */

  const feedbackData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }
      const response = await Instance.get(`/api/reviews/astrologers/reviews`, { headers: { Authorization: `Bearer ${token}`, }, },);
      // console.log("resposne of the blog data", response.data);

      if (response.data) {
        setFeedback(response.data);
        // console.log('user', response.data);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // fetchUserProfile();
    feedbackData();
  }, []);

  // Nothing real to show yet — don't render a fake/empty carousel.
  if (!feedback || feedback.length === 0) return null;

  return (
    <View style={{ padding: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: COLORS.black, }}>Get Best Solutions</Text>
      <FlatList
        data={feedback}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => String(index)}
        renderItem={({ item }) => (
          <View style={styles.reviewCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>{(item?.user?.firstName || 'C').charAt(0)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>{item?.user?.firstName || 'Customer'}</Text>
            {!!item?.astrologerName && (
              <Text style={styles.forAstro} numberOfLines={1}>for {item.astrologerName}</Text>
            )}
            <StarRating rating={item?.rating} size={16} style={styles.starContainer} />
            {!!item?.comment && <Text style={styles.title} numberOfLines={3}>{item.comment}</Text>}
          </View>
        )}
      />
    </View>
  );
};

const styles = {
  reviewCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#800000', // COLORS.AstroMaroon
    alignItems: 'center',
    marginRight: 10,
    width: 150,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
    marginVertical: 10,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 5,
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  forAstro: {
    fontSize: 11,
    color: COLORS.AstroMaroon,
    marginTop: 2,
  },
  starContainer: {
    flexDirection: 'row',
    marginVertical: 5,
  },
  title: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
  },
};

export default CustomerReview;
