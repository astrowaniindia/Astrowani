import React, {useState} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  FlatList,
} from 'react-native';

import {scale, moderateScale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';

const VratData = [
  {
    id: 1,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
  {
    id: 2,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
  {
    id: 3,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
  {
    id: 4,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
  {
    id: 5,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
  {
    id: 6,
    month: 'January.2024',
    date: '25',
    monthss: 'January',
    months: '(Thursday)',
    Vratname: 'Paush Purnima\nShakambhari Purnima',
    TithiTime: 'Check Panchang',
  },
];

const VrataUpvaas = () => {
  const [activeTab, setActiveTab] = useState('Purnima Vrat');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Purnima Vrat':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}> {item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      case 'Amavasya Dates':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      case 'Ekasashi Vrat':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}> {item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      case 'Paradosh Vrat':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      case 'Sankashti Chaturthi':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      case 'Vinayak Chaturthi':
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
      default:
        return (
          <FlatList
            data={VratData}
            keyExtractor={item => item.id.toString()}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <View style={styles.cardContainer}>
                <Text style={styles.monthTexttt}>{item.month}</Text>
                <View style={styles.cardContent}>
                  <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{item.date}</Text>
                    <Text style={styles.monthText}>{item.monthss}</Text>
                    <Text style={styles.Days}>{item.months}</Text>
                  </View>
                  <View style={styles.infoContainer}>
                    <Text style={styles.VRATNAME}>
                      Vrat Name:
                      <Text style={styles.VRATNAME2}>{item.Vratname}</Text>
                    </Text>
                    <Text style={styles.TITHITIME}>
                      Tithi Time:
                      <Text style={styles.TITHITIME2}>{item.TithiTime}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        );
    }
  };

  const items = [
    'Purnima Vrat',
    'Amavasya Dates',
    'Ekasashi Vrat',
    'Paradosh Vrat',
    'Sankashti Chaturthi',
    'Vinayak Chaturthi',
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContainer}>
          {items.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText,
                ]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={styles.tabContent}>{renderTabContent()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  tabContainer: {
    backgroundColor: COLORS.white,
    paddingVertical: scale(5),
  },
  tabScrollContainer: {
    flexDirection: 'row',
  },
  tab: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    marginHorizontal: scale(4),
    borderRadius: scale(5),
  },
  activeTab: {
    backgroundColor: COLORS.AstroSoftOrange,
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    paddingVertical: verticalScale(8),
  },
  tabText: {
    fontSize: moderateScale(14),
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
  },
  activeTabText: {
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(14),
  },
  tabContent: {
    padding: scale(10),
    marginBottom: verticalScale(50),
  },
  cardContainer: {
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(10),
    marginBottom: scale(15),
    padding: scale(10),
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    paddingVertical: scale(5),
    backgroundColor: COLORS.white,
  },
  dateContainer: {
    borderRightWidth: scale(1),
    borderColor: COLORS.AshGray,
    alignItems: 'center',
    paddingVertical: verticalScale(5),
    paddingHorizontal: scale(15),
  },
  dateText: {
    fontSize: moderateScale(17),
    fontWeight: 'bold',
    color: COLORS.red,
  },
  monthText: {
    fontSize: moderateScale(15),
    textAlign: 'center',
    color: COLORS.black,
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(5),
  },
  monthTexttt: {
    fontSize: moderateScale(16),
    textAlign: 'center',
    fontFamily: 'Lato-Bold',
    color: COLORS.red,
    bottom: scale(5),
  },
  Days: {
    fontSize: moderateScale(15),
    textAlign: 'center',
    fontFamily: 'Lato-Regular',

    color: COLORS.red,
  },
  infoContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: scale(20),
  },
  VRATNAME2: {
    color: COLORS.black,
    fontFamily: 'Lato-Regular',

    marginLeft: scale(5),
  },
  VRATNAME: {
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(15),
  },
  TITHITIME: {
    color: COLORS.black,
    fontFamily: 'Lato-Bold',
    paddingVertical: verticalScale(5),
    fontSize: moderateScale(15),
  },
  TITHITIME2: {
    color: COLORS.black,
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(14),

    marginLeft: scale(5),
  },
});

export default VrataUpvaas;
