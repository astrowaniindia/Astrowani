import React from 'react';
import { View, Text, StyleSheet, FlatList, Image } from 'react-native';
import Ionicons  from 'react-native-vector-icons/Ionicons'; // or react-native-vector-icons/Ionicons

const ratingsData = [
  { id: '1', phone: '9198107*****', date: '3 Jun 2025', rating: 2, review: 'test rating' },
  { id: '2', phone: '9182730*****', date: '25 Oct 2024', rating: 3, review: '' },
  { id: '3', phone: '9192627*****', date: '23 Oct 2024', rating: 5, review: '' },
  { id: '4', phone: '9199036*****', date: '14 Oct 2024', rating: 3, review: '' },
  { id: '5', phone: '9163902*****', date: '7 Oct 2024', rating: 5, review: '' },
  { id: '6', phone: '9189793*****', date: '3 Oct 2024', rating: 4, review: '' },
];

export default function RatingReview() {
  const renderStars = (count:any) => {
    let stars = [];
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


  const renderItem = ({ item }:any) => (
    <View style={styles.card}>
      <Image
        source={require('../../assets/images/logo1.png')} // put a default profile image in assets
        style={styles.avatar}
      />
      <View style={styles.info}>
        <Text style={styles.phone}>{item.phone}</Text>
        <Text style={styles.date}>{item.date}</Text>
        {item.review ? <Text style={styles.review}>{item.review}</Text> : null}
        <View style={styles.stars}>{renderStars(item.rating)}</View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Ratings & Reviews</Text>
      <FlatList
        data={ratingsData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 10 },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: 'orange' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 2, // for Android shadow
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 10 },
  info: { flex: 1 },
  phone: { fontWeight: 'bold', fontSize: 16 },
  date: { fontSize: 12, color: '#666', marginBottom: 2 },
  review: { fontSize: 14, color: '#333', marginBottom: 4 },
  stars: { flexDirection: 'row', marginTop: 2 },
});
