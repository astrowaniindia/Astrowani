import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import ReusableList from '../component/ReusableList';

const astrologers = [
  {
    id: '1',
    name: 'Sudipta Astro',
    specialization: 'Vedic Astrology',
    languages: 'English, Hindi, Bengali',
    experience: '10 Years',
    rating: 4,
    reviews: '4142',
    price: '₹50/min',
    offer: 'FREE',
    badge: 'Must Try',
    isLive: true,
  },
  {
    id: '2',
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
  {
    id: '3',
    name: 'Dharma',
    rating: 4,
    specialization: 'Vedic Astrology',
    languages: 'Hindi, Bhojpuri',
    experience: '4 Years',
    reviews: '885',
    price: '₹19/min',
    offer: 'FREE',
    isLive: true,
  },
  {
    id: '4',
    name: 'Dharma',
    specialization: 'Vedic Astrology',
    languages: 'Hindi, Bhojpuri',
    experience: '4 Years',
    rating: 4,
    reviews: '885',
    price: '₹19/min',
    offer: 'FREE',
    isLive: true,
  },
  {
    id: '5',
    name: 'Dharma',
    rating: 4,
    specialization: 'Vedic Astrology',
    languages: 'Hindi, Bhojpuri',
    experience: '4 Years',
    reviews: '885',
    price: '₹19/min',
    offer: 'FREE',
    isLive: true,
  },
  {
    id: '6',
    rating: 4,
    name: 'Dharma',
    specialization: 'Vedic Astrology',
    languages: 'Hindi, Bhojpuri',
    experience: '4 Years',
    reviews: '885',
    price: '₹19/min',
    offer: 'FREE',
    isLive: true,
  },
];

const LoveAndRelationScreen = ({handleChat, handleAstrologer}) => {
  return (
    <ReusableList
      data={astrologers}
      buttonType="chat"
      handleAstrologer={handleAstrologer}
      actionButton={handleChat}
    />
  );
};

export default LoveAndRelationScreen;

const styles = StyleSheet.create({});
