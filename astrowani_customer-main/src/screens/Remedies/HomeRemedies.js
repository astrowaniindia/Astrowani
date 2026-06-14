import React from 'react';
import { View, Text, Image, StyleSheet, FlatList, TouchableOpacity, } from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';

const data = [
  {
    id: '1',
    title: 'Puja',
    description: 'Join shared rituals by renowned Purohits and Pandits for blessings and positivity.',
    image: require('../../assets/images/specificPuja.jpg'),
    // image: 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg',
  },
  {
    id: '3',
    title: 'Gemstones',
    description: 'Buy certified gemstones to balance energies and support your astrological goals.',
    image: require('../../assets/images/gemsStones.jpg'),
    // image: 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg',
  },
  {
    id: '4',
    title: 'Specific Puja',
    description: 'Buy certified gemstones to balance energies and support your astrological goals.',
    image: require('../../assets/images/groupPuja.jpg'),
  },
];

const HomeRemedies = ({ navigation }) => {
  const handleBookPuja = item => {
    if (item.title === 'Puja') {
      navigation.navigate('PujaDetails');
    } else if (item.title === 'Gemstones') {
      navigation.navigate('GemstoneDetails');
    } else if (item.title === 'Specific Puja') {
      navigation.navigate('SpecificPuja');
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleBookPuja(item)} style={styles.card}>
      <View style={styles.textContainer}>
        <Image source={item.image} style={styles.image} />
        {/* <Image source={{ uri: item.image }} style={styles.image} /> */}

        <Text style={styles.title}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingVertical: verticalScale(15),
    paddingHorizontal: scale(15),
  },
  card: {
    borderRadius: moderateScale(10),

    marginRight: scale(10),
    backgroundColor: COLORS.AstroSoftOrange,
  },

  title: {
    color: COLORS.black,
    fontSize: moderateScale(13),
    textAlign: 'center',
    marginVertical: verticalScale(10),

    fontFamily: 'Lato-Bold',
  },

  image: {
    height: verticalScale(100),
    width: scale(130),
    borderTopRightRadius: moderateScale(10),
    borderTopLeftRadius: moderateScale(10),
  },
});

export default HomeRemedies;
