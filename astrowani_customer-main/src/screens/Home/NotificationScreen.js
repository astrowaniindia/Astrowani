import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const dummyNotifications = [
  { id: '1', title: 'Welcome to Astrowani!', message: 'Thank you for joining our community.', time: 'Just now', read: false },
  { id: '2', title: 'Special Offer', message: 'Get 50% off on your first live session!', time: '2 hours ago', read: false },
  { id: '3', title: 'Daily Horoscope', message: 'Your daily horoscope is ready to read.', time: '1 day ago', read: true },
];

const NotificationScreen = ({ navigation }) => {
  const renderNotification = ({ item }) => (
    <TouchableOpacity style={[styles.notificationCard, item.read ? styles.readCard : styles.unreadCard]}>
      <View style={styles.iconContainer}>
        <Icon name="notifications" size={24} color={COLORS.AstroMaroon} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>{item.time}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={dummyNotifications}
        keyExtractor={item => item.id}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="notifications-off" size={60} color="gray" />
            <Text style={styles.emptyText}>No new notifications</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContainer: {
    padding: scale(15),
  },
  notificationCard: {
    flexDirection: 'row',
    padding: scale(15),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(10),
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.AstroMaroon,
  },
  readCard: {
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    opacity: 0.7,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(15),
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: verticalScale(4),
  },
  message: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginBottom: verticalScale(6),
  },
  time: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: verticalScale(100),
  },
  emptyText: {
    marginTop: verticalScale(10),
    fontSize: moderateScale(16),
    color: 'gray',
    fontFamily: 'Lato-Regular',
  },
});

export default NotificationScreen;
