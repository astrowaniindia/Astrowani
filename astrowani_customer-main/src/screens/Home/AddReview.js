import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const AddReview = ({ route, navigation }) => {
  const { person } = route.params;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Please provide a rating.');
      return;
    }
    if (!comment.trim()) {
      Alert.alert('Error', 'Please write a review comment.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Not logged in');

      const response = await Instance.post(
        `/api/reviews/astrologer/${person._id}/review`,
        {
          rating,
          comment
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert('Success', 'Your review has been submitted successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      console.log('Error adding review:', err?.response?.data || err.message);
      Alert.alert('Error', err?.response?.data?.error || 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review {person.name}</Text>
      
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(star)}>
            <MaterialIcons
              name="star"
              size={moderateScale(40)}
              color={star <= rating ? 'orange' : '#ccc'}
            />
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Write your experience..."
        placeholderTextColor="#999"
        multiline
        numberOfLines={6}
        value={comment}
        onChangeText={setComment}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit Review</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: scale(20), backgroundColor: '#fff' },
  title: { fontSize: moderateScale(20), fontFamily: 'Lato-Bold', color: '#000', marginBottom: verticalScale(20), textAlign: 'center' },
  starsContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: verticalScale(20) },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: moderateScale(10),
    padding: scale(15),
    color: '#000',
    fontFamily: 'Lato-Regular',
    textAlignVertical: 'top',
    fontSize: moderateScale(14),
    marginBottom: verticalScale(20)
  },
  submitBtn: {
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(15),
    borderRadius: moderateScale(10),
    alignItems: 'center'
  },
  submitText: { color: '#fff', fontSize: moderateScale(16), fontFamily: 'Lato-Bold' }
});

export default AddReview;
