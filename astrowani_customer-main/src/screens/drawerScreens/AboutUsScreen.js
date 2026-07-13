import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {COLORS} from '../../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {LanguageContext} from '../../context/LanguageContext';

export default function AboutUsScreen() {
  const {t} = React.useContext(LanguageContext);
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('../../assets/images/logo2.jpeg')}
          style={styles.logo}
        />
        <Text style={styles.appName}>Astrowani</Text>
        <Text style={styles.tagline}>{t('about.tagline')}</Text>

        <Text style={styles.aboutTitle}>{t('about.title')}</Text>
        <Text style={styles.aboutText}>{t('about.p1')}</Text>
        <Text style={styles.aboutText}>{t('about.p2')}</Text>
        <Text style={styles.aboutText}>{t('about.p3')}</Text>
        <Text style={styles.aboutText}>{t('about.p4')}</Text>
        <Text style={styles.aboutText}>{t('about.p5')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  scrollContent: {
    alignItems: 'center',
    padding: scale(20),
  },
  logo: {
    width: scale(90),
    height: scale(90),
    marginBottom: verticalScale(15),
    resizeMode: 'contain',
  },
  appName: {
    fontSize: moderateScale(23),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginBottom: verticalScale(3),
  },
  tagline: {
    fontSize: moderateScale(14),
    color: '#000',
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(15),
  },
  aboutTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginBottom: verticalScale(10),
  },
  aboutText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#333',
    lineHeight: verticalScale(20),
    textAlign: 'justify',
    marginBottom: verticalScale(10),
  },
});
