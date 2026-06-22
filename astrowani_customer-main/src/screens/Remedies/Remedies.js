import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { useNavigation } from '@react-navigation/native';

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
const Remedies = () => {
  const navigation = useNavigation()
  const handleBookPuja = item => {
    if (item.title === 'Puja') {
      navigation.navigate('RemedyShop', { type: 'puja', title: 'Puja' });
    } else if (item.title === 'Gemstones') {
      navigation.navigate('RemedyShop', { type: 'gemstone', title: 'Gemstones' });
    } else if (item.title === 'Specific Puja') {
      navigation.navigate('RemedyShop', { type: 'specific_puja', title: 'Specific Puja' });
    }
  };
  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleBookPuja(item)} style={styles.card}>
      <View style={styles.textContainer}>
        <View style={styles.textOverlay}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      </View>
      <Image source={item.image} style={styles.image} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.listContainer, {paddingBottom: verticalScale(85)}]}>
        {data.map((item) => (
          <React.Fragment key={item.id}>
            {renderItem({ item })}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  listContainer: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(15),
  },
  card: {
    flexDirection: 'row',
    marginBottom: verticalScale(10),
    borderRadius: moderateScale(16),
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    height: verticalScale(120),
    borderWidth: 1.5,
    borderColor: '#800000', // COLORS.AstroMaroon
  },
  textContainer: {
    flex: 2,
    justifyContent: 'center',
    paddingHorizontal: scale(5),
    position: 'relative',
  },

  textOverlay: {
    paddingHorizontal: scale(15),
    justifyContent: 'center',
  },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(17),
    marginBottom: verticalScale(13),

    fontFamily: 'Lato-Bold',
  },
  description: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
  },
  image: {
    height: '100%',
    width: scale(120),
    borderTopRightRadius: moderateScale(10),
    borderBottomRightRadius: moderateScale(10),
  },
});

export default Remedies;
