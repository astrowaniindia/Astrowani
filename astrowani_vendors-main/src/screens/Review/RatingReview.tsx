import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';

export default function RatingReview() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const astroId = await AsyncStorage.getItem('astroId');
        if (!astroId) { setLoading(false); return; }
        // Public reviews endpoint — non-hidden reviews for this astrologer.
        const res = await Instance.get(`/api/reviews/astrologer/${astroId}`);
        setReviews(res.data || []);
      } catch (e) {
        console.log('[RatingReview] load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const renderStars = (count: any) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= count ? 'star' : 'star-outline'}
          size={18}
          color="#f5c518"
          style={{ marginRight: 2 }}
        />
      );
    }
    return stars;
  };

  const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB') : '');

  const renderItem = ({ item }: any) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>
          {(item?.user?.firstName || 'C').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.phone}>{item?.user?.firstName || 'Customer'}</Text>
        <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
        {item.comment ? <Text style={styles.review}>{item.comment}</Text> : null}
        <View style={styles.stars}>{renderStars(item.rating)}</View>
        {item.adminReply ? <Text style={styles.adminReply}>↳ Astrowani: {item.adminReply}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Ratings & Reviews</Text>
      {loading ? (
        <ActivityIndicator size="large" color="orange" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={reviews}
          renderItem={renderItem}
          keyExtractor={(_, index) => String(index)}
          ListEmptyComponent={<Text style={styles.empty}>No reviews yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 10 },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: 'orange' },
  empty: { textAlign: 'center', color: '#888', marginTop: 30, fontSize: 14 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25, marginRight: 10,
    backgroundColor: '#592a19', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  info: { flex: 1 },
  phone: { fontWeight: 'bold', fontSize: 16 },
  date: { fontSize: 12, color: '#666', marginBottom: 2 },
  review: { fontSize: 14, color: '#333', marginBottom: 4 },
  stars: { flexDirection: 'row', marginTop: 2 },
  adminReply: { fontSize: 12, color: '#592a19', fontStyle: 'italic', marginTop: 4 },
});
