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

export default function AboutUsScreen() {
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
        <Text style={styles.tagline}>Best Astrologers Team</Text>

        <Text style={styles.aboutTitle}>About Us</Text>
        <Text style={styles.aboutText}>
          Astrowani is your trusted gateway to the ancient science of astrology,
          delivered with the convenience of modern technology. Our mission is to
          help you find clarity, direction, and peace of mind through
          personalized astrological guidance.
        </Text>

        <Text style={styles.aboutText}>
          We work with a team of highly experienced and verified astrologers
          from across India, each specializing in Vedic astrology, numerology,
          palmistry, tarot reading, and more. Whether you are seeking answers
          about career, relationships, health, or finance, our experts are
          here to guide you with compassion and accuracy.
        </Text>

        <Text style={styles.aboutText}>
          At Astrowani, we believe astrology is not about predicting doom or
          dictating your fate, but about empowering you to make informed
          decisions. Our consultations are rooted in authenticity, ethics, and
          confidentiality, ensuring that your personal details and readings
          remain private.
        </Text>

        <Text style={styles.aboutText}>
          With features like live consultations, chat sessions, and daily
          horoscopes, Astrowani makes it easy to connect with the right expert
          anytime, anywhere. Whether you're a believer or just curious, we
          welcome you to explore what the stars have to say.
        </Text>

        <Text style={styles.aboutText}>
          Join thousands of satisfied users who have discovered guidance,
          inspiration, and positivity through Astrowani — where tradition meets
          trust.
        </Text>
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
