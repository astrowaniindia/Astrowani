import {StyleSheet, Text, Image, View, TouchableOpacity} from 'react-native';
import React, {version} from 'react';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';

const Thankyou = ({navigation}) => {
  return (
    <View style={styles.main}>
      <Image
        source={require('../assets/images/thank-you.png')}
        style={styles.img}
      />

      <Text style={styles.note}>Thank You </Text>
      <Text style={styles.note}>For Registering With Us</Text>
      <Text style={styles.text}>
        Your Astro Id is: <Text style={{fontWeight: 'bold'}}>78787</Text>. You
        will get an email about any updates via email or Whatsaap.
      </Text>
      <TouchableOpacity
        onPress={() => navigation.navigate('Login')}
        style={styles.loginBtn}>
        <Text style={styles.btntxt}>Login</Text>
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
