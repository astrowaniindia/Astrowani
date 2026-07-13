import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import {LanguageContext} from '../../../context/LanguageContext';

const ZODIAC_SIGNS = [
  {sign: 'aries', name: 'Aries', dateRange: {start: '2024-03-21', end: '2024-04-19'}},
  {sign: 'taurus', name: 'Taurus', dateRange: {start: '2024-04-20', end: '2024-05-20'}},
  {sign: 'gemini', name: 'Gemini', dateRange: {start: '2024-05-21', end: '2024-06-20'}},
  {sign: 'cancer', name: 'Cancer', dateRange: {start: '2024-06-21', end: '2024-07-22'}},
  {sign: 'leo', name: 'Leo', dateRange: {start: '2024-07-23', end: '2024-08-22'}},
  {sign: 'virgo', name: 'Virgo', dateRange: {start: '2024-08-23', end: '2024-09-22'}},
  {sign: 'libra', name: 'Libra', dateRange: {start: '2024-09-23', end: '2024-10-22'}},
  {sign: 'scorpio', name: 'Scorpio', dateRange: {start: '2024-10-23', end: '2024-11-21'}},
  {sign: 'sagittarius', name: 'Sagittarius', dateRange: {start: '2024-11-22', end: '2024-12-21'}},
  {sign: 'capricorn', name: 'Capricorn', dateRange: {start: '2024-12-22', end: '2025-01-19'}},
  {sign: 'aquarius', name: 'Aquarius', dateRange: {start: '2025-01-20', end: '2025-02-18'}},
  {sign: 'pisces', name: 'Pisces', dateRange: {start: '2025-02-19', end: '2025-03-20'}},
];

const Horoscope = ({navigation}) => {
  const {t} = React.useContext(LanguageContext);
  const zodiacName = sign => t(`zodiac.${sign}`);
  const [selected, setSelected] = useState(ZODIAC_SIGNS[0]);
  const [horoscopeData, setHoroscopeData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  };

  const fetchHoroscope = async sign => {
    const response = await fetch(
      `https://astrowani-fb6pi.ondigitalocean.app/api/free-services/horoscope?sign=${sign}`,
      {method: 'POST', headers: {'Content-Type': 'application/json'}},
    );
    return response.json();
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetchHoroscope(selected.sign);
        setHoroscopeData({
          _id: selected.sign,
          zodiacSign: zodiacName(selected.sign),
          dateRange: selected.dateRange,
          prediction: response.data.daily_prediction.prediction,
          date: response.data.daily_prediction.date,
        });
      } catch (err) {
        console.error(`Failed to fetch horoscope for ${selected.sign}:`, err);
        setError(t('horoscope.unableToFetch'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selected]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('horoscope.title', {sign: zodiacName(selected.sign)})}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.signPicker} contentContainerStyle={styles.signPickerContent}>
        {ZODIAC_SIGNS.map(z => (
          <TouchableOpacity
            key={z.sign}
            style={[styles.signChip, selected.sign === z.sign && styles.signChipActive]}
            onPress={() => setSelected(z)}>
            <Text style={[styles.signChipText, selected.sign === z.sign && styles.signChipTextActive]}>{zodiacName(z.sign)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.indicator}>
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : horoscopeData ? (
        <TouchableOpacity
          onPress={() => navigation.navigate('HoroscopeDetails', {data: horoscopeData})}
          style={styles.signContainer}>
          <View style={styles.imageWrapper}>
            <Image
              source={{
                uri: 'https://www.bing.com/th?id=OIP.CtB9-R0mxlASJmUU3FkwKgHaHa&w=142&h=150&c=8&rs=1&qlt=90&o=6&pid=3.1&rm=2',
              }}
              style={styles.signImage}
            />
          </View>
          <Text style={styles.signName}>{horoscopeData.zodiacSign}</Text>
          <Text style={styles.signDate}>
            {`${formatDate(horoscopeData.dateRange.start)} - ${formatDate(horoscopeData.dateRange.end)}`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    paddingTop: verticalScale(20),
    alignItems: 'center',
  },
  title: {
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    textAlign: 'center',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(14),
  },
  signPicker: {
    maxHeight: verticalScale(46),
    marginBottom: verticalScale(20),
  },
  signPickerContent: {
    paddingHorizontal: scale(15),
  },
  signChip: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    backgroundColor: COLORS.white,
    marginRight: scale(8),
  },
  signChipActive: {
    backgroundColor: COLORS.AstroMaroon,
  },
  signChipText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
  },
  signChipTextActive: {
    color: COLORS.white,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    paddingVertical: verticalScale(10),
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  signContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(25),
  },
  signImage: {
    width: scale(50),
    height: scale(50),
    marginBottom: verticalScale(10),
  },
  signName: {
    fontSize: moderateScale(16),
    marginBottom: verticalScale(3),
    fontFamily: 'Lato-Regular',
    color: '#d32f2f',
  },
  signDate: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: scale(70),
    height: scale(70),
    borderRadius: moderateScale(35),
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
  },
});

export default Horoscope;
