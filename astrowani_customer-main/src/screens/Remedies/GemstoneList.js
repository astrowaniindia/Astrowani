import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GemstoneList = ({navigation}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPujas = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Token not found');

        const response = await Instance.get('/api/astro-services/gemstones', {
          headers: {Authorization: `Bearer ${token}`},
        });
        console.log('gemstone', response.data);
        if (response.data) {
          setData(response.data);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPujas();
  }, []);

  const renderItem = ({item}) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('GemstoneDetails', {data: item})}
      style={styles.card}>
      <View style={styles.textContainer}>
        <Image
          source={{
            uri:
              item.images[0] ||
              'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg',
          }}
          style={styles.image}
        />
        <Text style={styles.title}>{item.name || 'name'}</Text>
        <Text style={styles.caret}>{item.carat || '0'} carats</Text>
        <Text style={styles.price}> ₹{item.price || '0'}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        renderItem={renderItem}
        numColumns={2}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item._id}
        showsVerticalScrollIndicator={false}
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
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
  },
  errorText: {
    color: COLORS.red,
    fontSize: moderateScale(16),
    textAlign: 'center',
  },
  card: {
    borderRadius: moderateScale(10),
    marginRight: scale(10),
    marginBottom: scale(10),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  description: {
    width: scale(60),
    alignSelf: 'center',
    color: 'black',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(11),
    marginBottom: verticalScale(8),
  },
  title: {
    color: COLORS.black,
    fontSize: moderateScale(15),
    textAlign: 'center',
    marginTop: verticalScale(10),
    fontFamily: 'Lato-Bold',
  },
  image: {
    height: verticalScale(120),
    width: scale(150),
    borderTopRightRadius: moderateScale(10),
    borderTopLeftRadius: moderateScale(10),
  },
  caret: {
    textAlign: 'center',
    color: COLORS.black,
    fontSize: moderateScale(14),
    textAlign: 'center',
    marginTop: verticalScale(3),
    fontFamily: 'Lato-Bold',
  },
  price: {
    textAlign: 'center',
    color: COLORS.red,
    fontSize: moderateScale(13),
    textAlign: 'center',
    marginVertical: verticalScale(8),
    fontFamily: 'Lato-Bold',
  },
});

export default GemstoneList;
