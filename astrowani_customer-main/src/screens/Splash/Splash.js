import React, {useEffect} from 'react';
import {
  Image,
  Text,
  StyleSheet,
  View,
  ImageBackground,
  StatusBar,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {scale, verticalScale, moderateScale} from '../../utils/Scaling';

export default function Splash({navigation}) {
  useEffect(() => {
    const splashTimeout = setTimeout(() => {
      navigation.replace('Login');
    }, 1000);

    return () => {
      clearTimeout(splashTimeout);
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <ImageBackground
        source={require('../../assets/images/background.jpg')}
        style={styles.main}
        resizeMode="cover">
        <Image
          style={styles.splashImage}
          source={require('../../assets/images/splash.jpeg')}
        />
        <Text style={styles.text}>Consult Online Astrologers</Text>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashImage: {
    resizeMode: 'contain',
    width: scale(250),
    height: scale(200),
    alignSelf: 'center',
  },
  text: {
    color: 'black',
    marginVertical: verticalScale(30),
    fontSize: moderateScale(22),
    fontWeight: 'bold',
  },
});
