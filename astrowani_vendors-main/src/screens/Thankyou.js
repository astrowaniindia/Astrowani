import {StyleSheet, Text, Image, View, TouchableOpacity} from 'react-native';
import React, { version, useContext } from 'react';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';

import { LanguageContext } from '../context/LanguageContext';
const Thankyou = ({navigation}) => {
  const { t } = useContext(LanguageContext);
  return (
    <View style={styles.main}>
      <Image
        source={require('../assets/images/thank-you.png')}
        style={styles.img}
      />

      <Text style={styles.note}>{t('thankyou.title')}</Text>
      <Text style={styles.note}>{t('thankyou.subtitle')}</Text>
      <Text style={styles.text}>{t('thankyou.body1')}</Text>
      <Text style={styles.text}>{t('thankyou.body2')}</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Login')}
        style={styles.loginBtn}>
        <Text style={styles.btntxt}>{t('thankyou.login')}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default Thankyou;

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: '#fff',
    padding: scale(20),
  },
  img: {
    height: scale(100),
    marginVertical: verticalScale(20),
    width: verticalScale(100),
    alignSelf: 'center',
  },
  note: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: moderateScale(20),
    alignSelf: 'center',
  },
  text: {
    alignSelf: 'center',
    color: '#000',
    marginVertical: verticalScale(10),
  },
  loginBtn: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(50),
    backgroundColor: COLORS.AstroGold,
    borderRadius: moderateScale(10),
    marginVertical: verticalScale(40),
  },
  btntxt: {
    color: '#000',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});
