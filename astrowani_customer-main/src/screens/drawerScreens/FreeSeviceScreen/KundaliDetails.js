// import {
//   FlatList,
//   Image,
//   ScrollView,
//   StyleSheet,
//   Text,
//   View,
// } from 'react-native';
// import React from 'react';
// import DetailList from '../../component/DetailsList';
// import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
// import {COLORS} from '../../../Theme/Colors';
// import { useRoute } from '@react-navigation/native';

// const KundaliDetails = () => {
//   const panchangData = [
//     {label: 'Name', value: 'Mukesh Dangi'},
//     {label: 'Tithi', value: 'Dashami up to 01:22 AM, August 29'},
//     {label: 'Nakshatra', value: 'Mrigashirsha up to 03:54 PM'},
//     {label: 'Yoga', value: 'Vajra up to 07:09 PM'},
//     {label: 'First Karana', value: 'Vanija up to 01:26 PM'},
//     {label: 'Second Karana', value: 'Vishti up to 01:22 AM, August 29'},
//     {label: 'Vaar', value: 'Wednesday'},
//   ];
//   const Dosh = [
//     {
//       image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
//       name: 'mangal dosh',
//       title: 'yes',
//     },
//     {
//       image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
//       name: 'mangal dosh',
//       title: 'Leo',
//     },
//     {
//       image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
//       name: 'mangal dosh',
//       title: 'yes',
//     },
//     {
//       image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
//       name: 'mangal dosh',
//       title: 'yes',
//     },
//   ];

//   const kundali=useRoute().params;
//   const renderItem = ({item}) => (
//     <View style={styles.item}>
//       <Image style={styles.image} source={{uri: item.image}} />
//       <Text style={styles.name}>{item.name}</Text>
//       <Text style={styles.title}>{item.title}</Text>
//     </View>
//   );

//   console.log('kundali',kundali)

//   return (
//     <View style={styles.main}>
//       <DetailList title="Details" data={panchangData} />
//       <FlatList
//         data={Dosh}
//         renderItem={renderItem}
//         keyExtractor={(item, index) => index.toString()}
//         horizontal
//         showsHorizontalScrollIndicator={false}
//         contentContainerStyle={styles.horizontalView}
//       />
//     </View>
//   );
// };

// export default KundaliDetails;

// const styles = StyleSheet.create({
//   main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
//   horizontalView: {
//     paddingHorizontal: verticalScale(15),
//   },
//   item: {
//     marginRight: scale(10),
//     backgroundColor: '#fff',
//     alignItems: 'center',
//     justifyContent: 'center',
//     width: scale(150),
//     borderRadius: moderateScale(10),
//     height: verticalScale(120),
//     marginBottom: verticalScale(10),
//   },
//   image: {
//     width: scale(45),
//     height: verticalScale(45),
//   },
//   name: {
//     color: '#000',
//     fontFamily: 'Lato-Bold',
//     marginVertical: verticalScale(8),
//   },
//   title: {
//     color: 'red',
//     fontFamily: 'Lato-Bold',
//   },
// });


// import React from 'react';
// import { View, StyleSheet } from 'react-native';
// import DetailList from '../../component/DetailsList';
// import { COLORS } from '../../../Theme/Colors';
// import { useRoute } from '@react-navigation/native';

// const KundaliDetails = () => {
//   const route = useRoute();
//   const { details, name } = route.params;

//   console.log("details are", details)

//   const panchangData = [
//     { label: 'Name', value: name },
//     { label: 'Nakshatra', value: details.nakshatra.name },
//     { label: 'Nakshatra Lord', value: details.nakshatra.lord.name  ? details.nakshatra.lord.name: ""},
//     { label: 'Nakshatra Pada', value: details.nakshatra.pada },
//     { label: 'Rasi', value: details.rasi.name },
//     { label: 'Rasi Lord', value: details.rasi.lord.name },
//     { label: 'Varna', value: details.koot.varna },
//     { label: 'Vasya', value: details.koot.vasya },
//     { label: 'Tara', value: details.koot.tara },
//     { label: 'Yoni', value: details.koot.yoni },
//     { label: 'Graha Maitri', value: details.koot.graha_maitri },
//     { label: 'Gana', value: details.koot.gana },
//     { label: 'Bhakoot', value: details.koot.bhakoot },
//     { label: 'Nadi', value: details.koot.nadi },
//   ];

//   return (
//     <View style={styles.main}>
//       <DetailList title="Kundali Details" data={panchangData} />
//     </View>
//   );
// };

// export default KundaliDetails;

// const styles = StyleSheet.create({
//   main: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
// });


import React from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DetailList from '../../component/DetailsList';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import { useRoute } from '@react-navigation/native';

const KundaliDetails = () => {
  const route = useRoute();
  const kundaliData = route.params?.kundaliData || {};

  console.log('kundaliData', route.params);

  // console.log('kundaliData', kundaliData);

  const panchangData = [
    { label: 'Name', value:  route.params?.name || 'N/A' },
    {label: 'Nakshatra', value: kundaliData?.nakshatra_details?.nakshatra?.name || 'N/A'},
    {label: 'Chandra Rasi', value: kundaliData?.nakshatra_details?.chandra_rasi?.name || 'N/A'},
    {label: 'Soorya Rasi', value: kundaliData?.nakshatra_details?.soorya_rasi?.name || 'N/A'},
    {label: 'Zodiac', value: kundaliData?.nakshatra_details?.zodiac?.name || 'N/A'},
    {label: 'Deity', value: kundaliData?.nakshatra_details?.additional_info?.deity || 'N/A'},
    {label: 'Ganam', value: kundaliData?.nakshatra_details?.additional_info?.ganam || 'N/A'},
    {label: 'Symbol', value: kundaliData?.nakshatra_details?.additional_info?.symbol || 'N/A'},
  ];

  const Dosh = [
    {
      image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
      name: 'Mangal Dosh',
      title: kundaliData?.mangal_dosha?.has_dosha ? 'Yes' : 'No',
    },
    ...(kundaliData?.yoga_details || []).map(yoga => ({
      image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
      name: yoga.name || 'Unknown Yoga',
      title: yoga.description || 'No description available',
    })),
  ];

  const renderItem = ({item}) => (
    <View style={styles.item}>
      <Image style={styles.image} source={{uri: item.image}} />
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.title}>{item.title}</Text>
    </View>
  );

  if (!kundaliData || Object.keys(kundaliData).length === 0) {
    return (
      <View style={[styles.main, styles.centerContent]}>
        <Text style={styles.errorText}>No Kundali data available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.main}>
      <DetailList title="Nakshatra Details" data={panchangData} />
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>Doshas and Yogas</Text>
        <FlatList
          data={Dosh}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalView}
        />
      </View>
      {kundaliData?.mangal_dosha?.has_dosha && (
        <View style={styles.mangalDoshaContainer}>
          <Text style={styles.mangalDoshaTitle}>Mangal Dosha Description</Text>
          <Text style={styles.mangalDoshaDescription}>
            {kundaliData.mangal_dosha.description || 'No description available'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

export default KundaliDetails;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  sectionContainer: {
    marginTop: verticalScale(20),
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    marginBottom: verticalScale(10),
  },
  horizontalView: {
    paddingHorizontal: verticalScale(15),
  },
  item: {
    marginRight: scale(10),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    width: scale(150),
    borderRadius: moderateScale(10),
    height: verticalScale(120),
    marginBottom: verticalScale(10),
  },
  image: {
    width: scale(45),
    height: verticalScale(45),
  },
  name: {
    color: '#000',
    fontFamily: 'Lato-Bold',
    marginVertical: verticalScale(8),
  },
  title: {
    color: 'red',
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
  },
  mangalDoshaContainer: {
    margin: scale(15),
    padding: scale(10),
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
  },
  mangalDoshaTitle: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(5),
  },
  mangalDoshaDescription: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
});


