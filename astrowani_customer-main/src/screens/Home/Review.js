import React, { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { COLORS } from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';

const reviews = [
  {
    id: '1',
    name: 'John Doe',
    image: 'https://randomuser.me/api/portraits/men/1.jpg',
    rating: 5,
    title: 'Great Service!',
  },
  {
    id: '2',
    name: 'Jane Smith',
    image: 'https://randomuser.me/api/portraits/women/2.jpg',
    rating: 4,
    title: 'Good experience',
  },
  {
    id: '3',
    name: 'Michael Lee',
    image: 'https://randomuser.me/api/portraits/men/3.jpg',
    rating: 5,
    title: 'Highly recommended!',
  },
];

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

  return (
    <View style={{ padding: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: COLORS.black, }}>Customer Reviews</Text>
      <FlatList
        data={feedback}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.reviewCard}>
            <Image source={{ uri: item?.user?.profilePic }} style={styles.profileImage} />
            <Text style={styles.name}>{item?.user?.firstName + " " + item?.user?.lastName || 'Anonymous'}</Text>
            <View style={styles.starContainer}>
              {[...Array(5)].map((_, index) => (
                <Icon key={index} name="star" size={18} color={index < item.rating ? '#FFD700' : '#ccc'} />
              ))}
            </View>
            <Text style={styles.title}>{item?.comment}</Text>
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
    borderRadius: 10,
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
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 5,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
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
