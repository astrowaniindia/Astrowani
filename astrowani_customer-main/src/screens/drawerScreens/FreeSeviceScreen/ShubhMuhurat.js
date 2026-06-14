import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import MuhuratCard from '../../component/MuhuratCard';
import DetailList from '../../component/DetailsList';

const tabs = [
  {id: '1', title: 'Choghadiya'},
  {id: '2', title: 'Shubh Hora'},
  {id: '3', title: 'Gowri Panchangam'},
  {id: '4', title: 'Rahu Kaal'},

];
const choghadiyaData = [
  {
    name: 'Amrit',
    time: '06:02 - 07:37',
    description: 'All type of works (Specially Milk Product Related)',
  },
  {
    name: 'Kaal',
    time: '07:37 - 09:11',
    description: 'Machine, Construction and Agriculture related activities',
    icon: 'alert-circle-outline',
    subText: 'Kaal Vela',
  },
  {
    name: 'Shubh',
    time: '09:11 - 10:45',
    description: 'Marriage, Religious, Education activities',
  },
  {
    name: 'Rog',
    time: '10:45 - 12:19',
    description: 'Debate, Contest, Dispute Settlement',
  },
  {
    name: 'Udveg',
    time: '12:19 - 13:53',
    description: 'Government related work',
  },
  {
    name: 'Char',
    time: '13:53 - 15:28',
    description: 'Travel, Beauty/Dance/Cultural activities',
  },
  {
    name: 'Labh',
    time: '15:28 - 17:02',
    description: 'Start new business, Education',
    icon: 'check-circle-outline',
    subText: 'Vaar Vela',
  },
  {
    name: 'Amrit',
    time: '17:02 - 18:36',
    description: 'All type of works (Specially Milk Product Related)',
  },
];
const ShubhHoraData = [
  {
    time: '06:02 - 07:37',
    description: 'Mars',
  },
  {
    time: '07:37 - 09:11',
    description: 'Sun',
  },
  {
    time: '06:02 - 07:37',
    description: 'Mars',
  },
  {
    time: '07:37 - 09:11',
    description: 'Sun',
  },
];

const RahukaalData = [
  {
    name: 'Monday',
    description: '06:02 - 07:37',
  },
  {
    name: 'Monday',
    description: '06:02 - 07:37',
  },
  {
    name: 'Monday',
    description: '06:02 - 07:37',
  },
  {
    name: 'Monday',
    description: '06:02 - 07:37',
  },
  {
    name: 'Monday',
    description: '06:02 - 07:37',
  },
];
const ShubhMuhurat = ({navigation}) => {
  const [activeTab, setActiveTab] = useState('Choghadiya');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Choghadiya':
        return <MuhuratCard title="Day Choghadiya" data={choghadiyaData} />;
      case 'Shubh Hora':
        return <MuhuratCard title="Day Hora" data={ShubhHoraData} />;
      case 'Gowri Panchangam':
        return <MuhuratCard title="Gowri Panchangam" data={ShubhHoraData} />;

      case 'Rahu Kaal':
        return (
          <View style={{flex: 1, backgroundColor: COLORS.AstroSoftOrange}}>
            <View style={styles.rahukaalrow}>
              <View>
                <Text style={styles.rahukaalTxt}>Rahu Kaal Time</Text>
                <Text style={styles.rahukaal}>12:18 to 13:52</Text>
              </View>
              <View>
                <Text style={styles.rahukaalTxt}>Duration</Text>
                <Text style={styles.rahukaal}>01 hr 40 minutes</Text>
              </View>
            </View>
            <MuhuratCard title="Rahu Kaal" data={RahukaalData} />
          </View>
        );

      default:
        return null;
    }
  };
  const renderTab = ({item}) => (
    <TouchableOpacity
      style={[styles.tab, activeTab === item.title && styles.activeTab]}
      onPress={() => setActiveTab(item.title)}>
      <Text
        style={[
          styles.tabText,
          activeTab === item.title && styles.activeTabText,
        ]}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.main}>
      <View style={styles.tabContainer}>
        <FlatList
          data={tabs}
          renderItem={renderTab}
          keyExtractor={item => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
      </View>
      {renderTabContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  container: {
    padding: scale(10),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
    padding: scale(10),
    marginBottom: verticalScale(10),
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: verticalScale(-10),
    left: scale(-10),
    backgroundColor: 'red',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(5),
    borderTopLeftRadius: moderateScale(10),
    borderBottomRightRadius: moderateScale(10),
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: scale(60),
    height: verticalScale(60),
    borderRadius: moderateScale(30),
    marginRight: scale(10),
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: moderateScale(16),
    color: 'black',
    fontWeight: 'bold',
  },
  specialization: {
    fontSize: moderateScale(14),
    color: '#666',
  },
  languages: {
    fontSize: moderateScale(12),
    color: '#666',
  },
  experience: {
    fontSize: moderateScale(12),
    color: '#666',
  },
  reviews: {
    fontSize: moderateScale(12),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    textDecorationLine: 'line-through',
    fontSize: moderateScale(12),
    color: '#666',
  },
  offer: {
    fontSize: moderateScale(12),
    color: 'red',
    marginLeft: scale(5),
  },
  chatButton: {
    backgroundColor: '#00C853',
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(5),
  },
  chatText: {
    color: '#fff',
    fontWeight: 'bold',
  },

  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(5),
  },
  tab: {
    paddingHorizontal: scale(10),
    marginLeft: scale(5),
    paddingVertical: verticalScale(5),
  },
  tabText: {
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
    paddingHorizontal: scale(10),
  },
  activeTab: {
    marginLeft: scale(5),
    paddingVertical: verticalScale(6),
    borderWidth: moderateScale(1),
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  activeTabText: {
    paddingHorizontal: scale(10),
    color: 'black',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
  },
  activeMain: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  rahukaalrow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: scale(15),
    marginTop: verticalScale(5),
    padding: scale(10),
    backgroundColor: 'pink',
    borderRadius: moderateScale(10),
  },
  rahukaalTxt: {
    color: '#000',
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
  },
  rahukaal: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    marginTop: verticalScale(3),
  },
});

export default ShubhMuhurat;
