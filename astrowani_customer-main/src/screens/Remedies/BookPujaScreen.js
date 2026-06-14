// import React, {useEffect, useState} from 'react';
// import {
//   View,
//   Text,
//   ImageBackground,
//   StyleSheet,
//   TouchableOpacity,
//   FlatList,
//   ActivityIndicator,
// } from 'react-native';
// import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
// import {COLORS} from '../../Theme/Colors';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import Instance from '../../api/ApiCall';
// import { useRoute } from '@react-navigation/native';

// // const data = [
// //   {
// //     id: '1',
// //     title: 'Navgrah Shanti Puja',
// //     description: 'Kundali Mein Bure Graho Ki Shanti Karein Aur Success P...',
// //     originalPrice: '₹1500',
// //     discountedPrice: '₹799',
// //     label: 'For Peace & Happiness In Life',
// //     image:
// //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
// //   },
// //   {
// //     id: '2',
// //     title: 'Rahu-Ketu Shanti Puja',
// //     description: 'Apni Har Pareshani Aur Negativity Ko Door Karne Ke Liye...',
// //     originalPrice: '₹1500',
// //     discountedPrice: '₹699',
// //     label: 'Apna Har Kaam Bane',
// //     image:
// //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
// //   },
// //   {
// //     id: '3',
// //     title: 'Mangal Dosh Nivaran Puja',
// //     description: 'Mangal Dosh Se Mukti Ke Liye Vishesh Puja',
// //     originalPrice: '₹1500',
// //     discountedPrice: '₹699',
// //     label: 'Resolves Problems In Married Life',
// //     image:
// //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
// //   },
// // ];

// const BookPujaScreen = ({navigation}) => {
//   const [pujas, setPujas] = useState(null);
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(true);

//   const route = useRoute();
// console.log("Pooja", route.params?.pujas)
//   useEffect(() => {
//     const fetchPujas = async () => {
//       try {
//         const token = await AsyncStorage.getItem('token');
//         if (!token) throw new Error('Token not found');

//         const response = await Instance.get('/api/astro-services/pujas', {
//           headers: {Authorization: `Bearer ${token}`},
//         });
//         // console.log('Puja', response.data);
//         if (response.data) {
//           setPujas(response.data);
//         }
//       } catch (err) {
//         setError(err.message);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchPujas();
//   }, []);

//   const renderItem = ({item}) => (
//     <View style={styles.card}>
//       <ImageBackground
//         source={{
//           uri:
//             item.image ||
//             'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//         }}
//         style={styles.imageBackground}>
//         <View style={styles.textContainer}>
//           {item.label ? <Text style={styles.label}>{item.label}</Text> : null}
//           <Text style={styles.title}>{item.PujaName || 'Puja name'}</Text>
//           <Text
//             style={styles.description}
//             ellipsizeMode="tail"
//             numberOfLines={2}>
//             {item.description || 'puja description'}
//           </Text>
//         </View>
//       </ImageBackground>
//       <View style={styles.priceContainer}>
//         {/* <Text style={styles.originalPrice}>{item.originalPrice}</Text> */}
//         <Text style={styles.discountedPrice}> ₹{item.price || '100'} </Text>
//         <TouchableOpacity
//           onPress={() => navigation.navigate('PujaDetails', {data: item})}
//           style={styles.bookNowButton}>
//           <Text style={styles.bookNowText}>Book Now</Text>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );

//   return (
//     <View style={styles.container}>
//       {loading ? (
//         <View style={styles.indicator}>
//           <ActivityIndicator size="small" color={COLORS.primary} />
//         </View>
//       ) : error ? (
//         <Text style={styles.errorText}>{error}</Text>
//       ) : pujas === null ? (
//         <Text style={styles.errorText}>data not available</Text>
//       ) : (
//         <FlatList
//           data={pujas}
//           renderItem={renderItem}
//           keyExtractor={item => item._id}
//           contentContainerStyle={styles.listContainer}
//         />
//       )}
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: COLORS.AstroSoftOrange,
//   },
//   listContainer: {
//     padding: scale(15),
//   },
//   card: {
//     backgroundColor: 'white',
//     borderRadius: moderateScale(10),
//     marginBottom: verticalScale(15),
//     overflow: 'hidden',
//     elevation: verticalScale(3), // For Android shadow
//     shadowColor: '#000', // For iOS shadow
//     shadowOffset: {width: 0, height: verticalScale(2)}, // For iOS shadow
//     shadowOpacity: 0.1, // For iOS shadow
//     shadowRadius: moderateScale(5), // For iOS shadow
//   },
//   imageBackground: {
//     width: '100%',
//     height: verticalScale(140),
//     justifyContent: 'flex-end',
//   },
//   textContainer: {
//     backgroundColor: 'rgba(0, 0, 0, 0.4)',
//     padding: scale(10),
//     height: scale(140),
//   },
//   label: {
//     backgroundColor: COLORS.AstroGold,
//     color: 'black',
//     fontSize: moderateScale(12),
//     fontFamily: 'Lato-Regular',
//     paddingVertical: verticalScale(4),
//     paddingHorizontal: scale(5),
//     borderRadius: moderateScale(3),
//     alignSelf: 'flex-start',
//     marginBottom: verticalScale(8),
//   },
//   title: {
//     fontSize: moderateScale(17),
//     fontFamily: 'Lato-Bold',
//     color: 'white',
//     marginBottom: verticalScale(6),
//   },
//   description: {
//     fontSize: moderateScale(13),
//     color: 'white',
//     fontFamily: 'Lato-Regular',
//   },
//   priceContainer: {
//     paddingVertical: verticalScale(5),
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingHorizontal: scale(10),
//   },
//   originalPrice: {
//     fontSize: moderateScale(14),
//     color: 'gray',
//     textDecorationLine: 'line-through',
//     fontFamily: 'Lato-Bold',
//     color: '#000',

//     paddingHorizontal: scale(10),
//   },
//   discountedPrice: {
//     fontSize: moderateScale(14),
//     color: '#FF6347',
//     fontFamily: 'Lato-Bold',
//   },
//   bookNowButton: {
//     backgroundColor: COLORS.AstroGold,
//     paddingVertical: verticalScale(6),
//     paddingHorizontal: scale(15),
//     borderRadius: moderateScale(20),
//     marginLeft: 'auto',

//     marginVertical: verticalScale(5),
//   },
//   bookNowText: {
//     fontSize: moderateScale(12),
//     color: 'black',
//     fontFamily: 'Lato-Bold',
//   },
//   errorText: {
//     color: 'red',
//     textAlign: 'center',
//     paddingVertical: verticalScale(10),
//   },
//   indicator: {
//     flex: 1,
//     alignItems: 'center',
//     justifyContent: 'center',
//     marginVertical: verticalScale(10),
//   },
// });

// export default BookPujaScreen;


import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import ImageSlider from '../component/ImageSlider';

const BookPujaScreen = ({ route, navigation }) => {
const data= route.params?.pujas || {};

  const handleBookNow = () => {
    // Add your booking logic here
    Alert.alert('Booking', 'Proceeding to book the puja...');
  };

  const imageData = [{ id: 1, image: data.image }];

  return (
    <View style={styles.container}>
      <ScrollView>
        <ImageSlider
          data={imageData}
          imageStyle={styles.sliderImage}
        />
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>02 h : 27 m : 01 s left</Text>
        </View>
        <View style={styles.detailsContainer}>
          <Text style={styles.title}>{data.pujaName}</Text>
          <Text style={styles.subtitle}>{data.bio}</Text>
          
          <View style={styles.ratingContainer}>
            <Text style={styles.soldText}>{data.pujaSold} Puja Sold</Text>
            <Text style={styles.ratingText}>★★★★★ 4.8</Text>
          </View>

          <View style={styles.separator}></View>

          <Text style={styles.description}>{data.description}</Text>

          <Text style={styles.detailTitle}>Details:</Text>
          <Text style={styles.detailText}>• Duration: {data.duration}</Text>
          <Text style={styles.detailText}>• Pooja God or Goddess: {data.pujaGodGoddes}</Text>
          <Text style={styles.detailText}>• Location: {data.location}</Text>
          <Text style={styles.detailText}>• Date: {new Date(data.date).toLocaleDateString()}</Text>

          <Text style={styles.benefitsTitle}>Benefits:</Text>
          {data.Benefits.map((benefit, index) => (
            <Text key={index} style={styles.benefitText}>✓ {benefit}</Text>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View>
          <Text style={styles.originalPrice}>₹{data.price}</Text>
          <Text style={styles.discountedPrice}>₹699</Text>
          <Text style={styles.groupText}>Group Puja</Text>
        </View>
        <TouchableOpacity onPress={handleBookNow} style={styles.bookButton}>
          <Text style={styles.bookButtonText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  sliderImage: {
    height: verticalScale(200),
  },
  timerContainer: {
    backgroundColor: COLORS.AstroGold,
    padding: scale(10),
  },
  timerText: {
    color: '#000',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(16),
    textAlign: 'center',
  },
  detailsContainer: {
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(15),
  },
  title: {
    fontSize: moderateScale(22),
    fontFamily: 'Lato-Bold',
    color: '#000',
  },
  subtitle: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Regular',
    color: '#000',
    marginTop: verticalScale(5),
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: verticalScale(10),
  },
  soldText: {
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(14),
    color: '#000',
  },
  ratingText: {
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
    color: COLORS.AstroGold,
  },
  separator: {
    borderTopWidth: moderateScale(2),
    borderTopColor: 'rgba(128, 0, 0, 0.1)',
    marginVertical: verticalScale(15),
  },
  description: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    color: '#000',
    marginBottom: verticalScale(15),
  },
  detailTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#000',
    marginBottom: verticalScale(10),
  },
  detailText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
    marginBottom: verticalScale(5),
  },
  benefitsTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: '#000',
    marginTop: verticalScale(15),
    marginBottom: verticalScale(10),
  },
  benefitText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
    marginBottom: verticalScale(5),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(10),
    backgroundColor: '#F5F5F5',
    borderTopWidth: verticalScale(1),
    borderColor: '#ddd',
  },
  originalPrice: {
    textDecorationLine: 'line-through',
    color: '#000',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(14),
  },
  discountedPrice: {
    color: COLORS.red,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(18),
  },
  groupText: {
    color: '#000',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(12),
  },
  bookButton: {
    backgroundColor: COLORS.AstroGold,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(30),
    borderRadius: moderateScale(5),
  },
  bookButtonText: {
    color: '#000',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(16),
  },
});

export default BookPujaScreen;
