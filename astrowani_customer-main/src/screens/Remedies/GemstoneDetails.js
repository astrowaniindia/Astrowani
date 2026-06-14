// import React from 'react';
// import {
//   View,
//   Text,
//   ImageBackground,
//   StyleSheet,
//   TouchableOpacity,
//   ScrollView,
//   Alert,
// } from 'react-native';
// import Icon from 'react-native-vector-icons/FontAwesome';
// import {COLORS} from '../../Theme/Colors';
// import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
// import ImageSlider from '../component/ImageSlider';

// const GemstoneDetails = ({route, navigation}) => {
//   const {data} = route.params || {};
//   const handleBookNow = () => {
//     if (data.availability) {
//       Alert.alert('take to the payment gatway ');
//     } else {
//       Alert.alert('Not available');
//     }
//   };
//   // const imageData = [
//   //   {
//   //     id: 1,
//   //     image:
//   //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//   //   },
//   //   {
//   //     id: 2,
//   //     image:
//   //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//   //   },
//   //   {
//   //     id: 3,
//   //     image:
//   //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//   //   },
//   //   {
//   //     id: 4,
//   //     image:
//   //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//   //   },
//   //   {
//   //     id: 5,
//   //     image:
//   //       'https://th.bing.com/th/id/OIP.XKhDJsAyX2WTH1q0Y-ZtRAHaDu?w=347&h=176&c=7&r=0&o=5&pid=1.7',
//   //   },
//   // ];

//   return (
//     <View style={styles.container}>
//       <ScrollView>
//         <ImageSlider
//           data={data.images || imageData}
//           imageStyle={styles.sliderimage}
//         />

//         <View style={styles.detailsContainer}>
//           <Text style={styles.title}>{data.name || 'name'}</Text>
//           <Text style={styles.price}> ₹{data.price || '0'}</Text>
//           <View style={styles.separator}></View>

//           <Text style={styles.title}>Details:</Text>
//           <Text style={styles.description}>
//             {data.description || 'Description here'}
//           </Text>

//           {/* Benefits Section */}
//         </View>
//       </ScrollView>
//       <View style={styles.footer}>
//         <Text style={styles.price}>
//           {/* <Text style={styles.originalPrice}>₹1500 </Text> */}
//           <Text style={styles.discountedPrice}>₹{data.price || '0'}</Text>
//         </Text>
//         <TouchableOpacity onPress={handleBookNow} style={styles.bookButton}>
//           <Text style={styles.bookButtonText}>Book Now</Text>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: COLORS.AstroSoftOrange,
//   },
//   price: {
//     color: COLORS.red,
//     fontSize: moderateScale(13),
//     marginVertical: verticalScale(8),
//     fontFamily: 'Lato-Bold',
//   },
//   imageBackground: {
//     width: '100%',
//     height: verticalScale(160),
//     justifyContent: 'flex-end',
//   },
//   bannerText: {
//     backgroundColor: COLORS.AstroGold,
//     color: '#000',
//     paddingHorizontal: scale(10),
//     fontSize: moderateScale(12),
//     paddingVertical: verticalScale(3),
//     fontFamily: 'Lato-Bold',
//     borderTopRightRadius: moderateScale(15),
//     borderBottomRightRadius: moderateScale(15),
//     marginVertical: verticalScale(10), // Adds some margin from the edges
//     alignSelf: 'flex-start', // Aligns text to the start of the container
//   },
//   detailsContainer: {
//     paddingHorizontal: scale(15),
//     paddingVertical: verticalScale(15),
//   },
//   title: {
//     fontSize: moderateScale(19),
//     fontFamily: 'Lato-Bold',
//     color: '#000',
//   },

//   description: {
//     fontSize: moderateScale(15),
//     fontFamily: 'Lato-Regular',
//     color: '#000',
//     marginVertical: verticalScale(10),
//   },
//   sliderimage: {
//     height: verticalScale(160),
//   },

//   detailText: {
//     color: '#d9534f',
//     fontWeight: 'bold',
//   },
//   separator: {
//     borderTopWidth: moderateScale(2),
//     width: scale(320),
//     marginVertical: verticalScale(13),
//     alignSelf: 'center',
//     borderTopColor: 'rgba(128, 0, 0, 0.1)',
//   },

//   footer: {
//     position: 'absolute',
//     bottom: 0,
//     right: 0,
//     left: 0,
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     paddingHorizontal: scale(15),
//     paddingVertical: verticalScale(10),
//     backgroundColor: '#F5F5F5',
//     borderTopWidth: verticalScale(1),
//     borderColor: '#ddd',
//   },

//   originalPrice: {
//     textDecorationLine: 'line-through',
//     color: '#000',
//     fontFamily: 'Lato-Bold',
//   },
//   discountedPrice: {
//     color: '#d9534f',
//     fontFamily: 'Lato-Bold',
//   },
//   bookButton: {
//     backgroundColor: COLORS.AstroGold,
//     paddingVertical: verticalScale(7),
//     paddingHorizontal: scale(20),
//     borderRadius: moderateScale(5),
//   },
//   bookButtonText: {
//     color: '#000',
//     fontFamily: 'Lato-Bold',
//   },
// });

// export default GemstoneDetails;
