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

// const KundaliMatchingDetailsScreen = () => {
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

//   console.log('kundali',kundali)
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
// const styles = StyleSheet.create({
//   main: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
// });

// export default KundaliMatchingDetailsScreen;

import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    View,
  } from 'react-native';
  import React from 'react';
  import DetailList from '../../component/DetailsList';
  import { moderateScale, scale, verticalScale } from '../../../utils/Scaling';
  import { COLORS } from '../../../Theme/Colors';
  import { useRoute } from '@react-navigation/native';
  
  const KundaliMatchingDetailsScreen = () => {
    const route = useRoute();
    const { kundaliData, name } = route.params;
  
    const panchangData = [
      { label: 'Name', value: name },
      { label: 'Varna', value: kundaliData.koot.varna },
      { label: 'Vasya', value: kundaliData.koot.vasya },
      { label: 'Tara', value: kundaliData.koot.tara },
      { label: 'Yoni', value: kundaliData.koot.yoni },
      { label: 'Graha Maitri', value: kundaliData.koot.graha_maitri },
      { label: 'Gana', value: kundaliData.koot.gana },
      { label: 'Bhakoot', value: kundaliData.koot.bhakoot },
      { label: 'Nadi', value: kundaliData.koot.nadi },
      { label: 'Nakshatra', value: kundaliData.nakshatra.name },
      { label: 'Nakshatra Lord', value: kundaliData.nakshatra.lord.name },
      { label: 'Nakshatra Pada', value: kundaliData.nakshatra.pada.toString() },
      { label: 'Rasi', value: kundaliData.rasi.name },
      { label: 'Rasi Lord', value: kundaliData.rasi.lord.name },
    ];
  
    const Dosh = [
      {
        image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
        name: 'Varna',
        title: kundaliData.koot.varna,
      },
      {
        image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
        name: 'Vasya',
        title: kundaliData.koot.vasya,
      },
      {
        image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
        name: 'Tara',
        title: kundaliData.koot.tara,
      },
      {
        image: 'https://cdn-icons-png.flaticon.com/128/815/815887.png',
        name: 'Yoni',
        title: kundaliData.koot.yoni,
      },
    ];
  
    const renderItem = ({ item }) => (
      <View style={styles.item}>
        <Image style={styles.image} source={{ uri: item.image }} />
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.title}>{item.title}</Text>
      </View>
    );
  
    return (
      <View style={styles.main}>
        <DetailList title="Kundali Details" data={panchangData} />
        <FlatList
          data={Dosh}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalView}
        />
      </View>
    );
  };
  
  const styles = StyleSheet.create({
    main: { 
      flex: 1, 
      backgroundColor: COLORS.AstroSoftOrange ,
    },
    item: {
      alignItems: 'center',
      marginRight: moderateScale(10),
    },
    image: {
      width: scale(50),
      height: scale(50),
      marginBottom: verticalScale(5),
    },
    name: {
      fontSize: moderateScale(12),
      color: COLORS.AstroBlack,
    },
    title: {
      fontSize: moderateScale(14),
      fontWeight: 'bold',
      color: COLORS.AstroBlack,
    },
    horizontalView: {
      padding: moderateScale(10),
    },
  });
  
  export default KundaliMatchingDetailsScreen;

