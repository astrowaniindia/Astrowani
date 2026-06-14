import React from 'react';
import {View, Text, StyleSheet, ScrollView, Image} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {COLORS} from '../../Theme/Colors';
const HoroscopeCard = ({data, daily, tab}) => {

  console.log("datata is", data)
  const getCurrentDate = () => {
    const date = new Date();
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return date.toLocaleDateString('en-US', options);
  };

  const getCurrentMonth = () => {
    const date = new Date();
    return date.toLocaleString('en-US', {month: 'long', year: 'numeric'});
  };

  const getCurrentYear = () => {
    const date = new Date();
    return date.getFullYear();
  };

  const renderDate = () => {
    if (tab === 'monthly') {
      return getCurrentMonth();
    } else if (tab === 'yearly') {
      return getCurrentYear();
    } else {
      return getCurrentDate();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.horoscopeContainer}>
        <View style={styles.imageWrapper}>
          <Image
            style={styles.signImage}
            source={{
              uri:
                data.zodiacImage ||
                'https://www.bing.com/th?id=OIP.CtB9-R0mxlASJmUU3FkwKgHaHa&w=142&h=150&c=8&rs=1&qlt=90&o=6&pid=3.1&rm=2',
            }}
          />
        </View>
        <Text style={styles.titleText}>{data.zodiacSign || 'Sign'}</Text>
        <View style={styles.dateContainer}>
          <Text style={styles.dateText}>{renderDate()}</Text>
        </View>
        <View>
        <Text style={styles.descriptionText}>
       { data.prediction}
        </Text>
        </View>
        {/* <Text style={styles.descriptionText}>
          {tab === 'daily' && data?.daily?.description
            ? data.daily.description
            : tab === 'monthly' && data?.monthly?.description
            ? data.monthly.description
            : tab === 'yearly' && data?.yearly?.description
            ? data.yearly.description
            : 'Description not available'}
        </Text> */}

        {/* {tab === 'monthly' && data?.monthly?.career ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Career:</Text>
            <Text style={styles.factorDetail}>{data?.monthly?.career}</Text>
          </View>
        ) : tab === 'yearly' && data.yearly?.career ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Career:</Text>
            <Text style={styles.factorDetail}>{data?.yearly?.career}</Text>
          </View>
        ) : null} */}
{/* 
        {tab === 'monthly' && data?.monthly?.love ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Love:</Text>
            <Text style={styles.factorDetail}>{data?.monthly?.love}</Text>
          </View>
        ) : tab === 'yearly' && data.yearly?.love ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Love:</Text>
            <Text style={styles.factorDetail}>{data?.yearly?.love}</Text>
          </View>
        ) : null} */}

        {/* {tab === 'monthly' && data?.monthly?.health ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Health:</Text>
            <Text style={styles.factorDetail}>{data?.monthly?.health}</Text>
          </View>
        ) : tab === 'yearly' && data.yearly?.health ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Health:</Text>
            <Text style={styles.factorDetail}>{data?.yearly?.health}</Text>
          </View>
        ) : null}
        {tab === 'monthly' && data?.monthly?.money ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Money:</Text>
            <Text style={styles.factorDetail}>{data?.monthly?.money}</Text>
          </View>
        ) : tab === 'yearly' && data.yearly?.money ? (
          <View style={styles.lifesFactor}>
            <Text style={styles.factorheading}>Money:</Text>
            <Text style={styles.factorDetail}>{data?.yearly?.money}</Text>
          </View>
        ) : null} */}
      </View>
      {/* {daily && (
        <View style={styles.luckyContainer}>
          <Text style={styles.luckyTitleText}>
            Lucky Color & Lucky Number Today
          </Text>
          <View style={styles.luckyItemsContainer}>
            <View style={styles.luckyItem}>
              <Icon
                name="palette"
                size={30}
                color="#E91E63"
                style={styles.icon}
              />
              <Text style={styles.luckyItemTitle}>Lucky color for Today</Text>
              <Text style={styles.luckyItemValue}>
                {data.daily?.luckyColor || 'color'}
              </Text>
            </View>
            <View style={styles.luckyItem}>
              <Icon
                name="numeric"
                size={30}
                color="#FF5722"
                style={styles.icon}
              />
              <Text style={styles.luckyItemTitle}>Lucky number for Today</Text>
              <Text style={styles.luckyItemValue}>
                {data.daily?.luckyNumber || 'number'}
              </Text>
            </View>
          </View>
        </View>
      )} */}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: scale(15),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  horoscopeContainer: {
    marginBottom: verticalScale(20),
  },
  dateContainer: {
    marginBottom: verticalScale(15),
  },
  dateText: {
    fontSize: moderateScale(16),
    color: '#f54242',
    fontFamily: 'Lato-Regular',
    textAlign: 'center',
  },
  titleText: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    marginVertical: verticalScale(4),
    color: '#000',
    textAlign: 'center',
  },
  descriptionText: {
    fontSize: moderateScale(14),
    color: COLORS.black,
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(10),
    lineHeight: 20,
  },
  luckyContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: moderateScale(8),
    overflow: 'hidden',
    marginTop: verticalScale(20),
  },
  luckyTitleText: {
    fontSize: moderateScale(15),
    backgroundColor: COLORS.lightTurquoise,
    fontFamily: 'Lato-Bold',
    color: '#f54242',
    textAlign: 'center',
    paddingVertical: verticalScale(8),
  },
  icon: {
    marginBottom: verticalScale(8),
  },
  luckyItemsContainer: {
    padding: scale(15),
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  luckyItem: {
    alignItems: 'center',

    width: scale(140),
  },
  luckyItemTitle: {
    fontSize: moderateScale(12),
    color: '#000',
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(8),
  },
  luckyItemValue: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Bold',
    color: '#000',
  },
  signImage: {
    width: scale(50),
    height: verticalScale(50),

    marginBottom: verticalScale(10),
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
  },

  lifesFactor: {
    marginVertical: verticalScale(10),
  },
  factorheading: {
    color: '#000',
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(15),
    marginBottom: verticalScale(5),
  },
  factorDetail: {
    color: '#000',
    fontFamily: 'Lato-Regular',
    fontSize: moderateScale(14),
    marginBottom: verticalScale(5),
  },
});

export default HoroscopeCard;
