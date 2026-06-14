// import {StyleSheet, Text, FlatList, View, Image} from 'react-native';
// import React from 'react';
// import {verticalScale, moderateScale, scale} from '../../../utils/Scaling';
// import {COLORS} from '../../../Theme/Colors';
// import DetailList from '../../component/DetailsList';

// const BasicDetails = ({data, listData}) => {
//   const renderItem = ({item}) => (
//     <View style={styles.item}>
//       <Image style={styles.image} source={{uri: item.image}} />
//       <Text style={styles.name}>{item.name}</Text>
//       <Text style={styles.title}>{item.title}</Text>
//     </View>
//   );
//   return (
//     <View style={{backgroundColor: COLORS.AstroSoftOrange, flex: 1}}>
//       <DetailList title="Basic Details" data={data} />
//       <FlatList
//         data={listData}
//         renderItem={renderItem}
//         keyExtractor={(item, index) => index.toString()}
//         horizontal
//         showsHorizontalScrollIndicator={false}
//         contentContainerStyle={styles.horizontalView}
//       />
//     </View>
//   );
// };

// export default BasicDetails;

// const styles = StyleSheet.create({
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
//     fontFamily: 'Lato-Regular',
//   },
// });



import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../../Theme/Colors';
import DetailList from '../../component/DetailsList';

const BasicDetails = ({ boyInfo, girlInfo }) => {
  const boyData = [
    { label: 'Nakshatra', value: boyInfo.nakshatra.name },
    { label: 'Rasi', value: boyInfo.rasi.name },
    { label: 'Varna', value: boyInfo.koot.varna },
    { label: 'Vasya', value: boyInfo.koot.vasya },
    { label: 'Yoni', value: boyInfo.koot.yoni },
    { label: 'Gana', value: boyInfo.koot.gana },
  ];

  const girlData = [
    { label: 'Nakshatra', value: girlInfo.nakshatra.name },
    { label: 'Rasi', value: girlInfo.rasi.name },
    { label: 'Varna', value: girlInfo.koot.varna },
    { label: 'Vasya', value: girlInfo.koot.vasya },
    { label: 'Yoni', value: girlInfo.koot.yoni },
    { label: 'Gana', value: girlInfo.koot.gana },
  ];

  return (
    <View style={styles.container}>
      <DetailList title="Boy's Details" data={boyData} />
      <DetailList title="Girl's Details" data={girlData} />
    </View>
  );
};

export default BasicDetails;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
});
