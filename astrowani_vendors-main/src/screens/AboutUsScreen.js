import React from 'react';
import {View, Text, Image, StyleSheet, ScrollView} from 'react-native';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

export default function AboutUsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
        />
        <Text style={styles.appName}>Astrowani for Astrologers</Text>
        <Text style={styles.tagline}>Empowering Experts, Connecting Seekers</Text>

        <Text style={styles.aboutTitle}>About Us</Text>
        <Text style={styles.aboutText}>
          Astrowani is a platform that connects genuine, experienced
          astrologers with people looking for guidance through chat, audio,
          and video consultations. As a partner astrologer on Astrowani, you
          become part of a growing community of Vedic astrology, numerology,
          palmistry, and tarot experts helping thousands of seekers make
          sense of their lives.
        </Text>

        <Text style={styles.aboutText}>
          We built this app to give you complete control over your practice —
          set your own per-minute charges for chat, call, and video, decide
          when you are available, go live to reach more customers, and track
          every rupee you earn in real time from your Wallet and Earnings
          sections.
        </Text>

        <Text style={styles.aboutText}>
          Every consultation on Astrowani is billed transparently and
          securely, with earnings credited directly to your in-app wallet.
          Our support team is always available to help with onboarding,
          payouts, or any issue you face while using the app.
        </Text>

        <Text style={styles.aboutText}>
          We take the trust our customers place in our astrologers seriously
          — that's why every profile goes through an approval process before
          it goes live. Thank you for being a part of Astrowani, and for
          bringing your knowledge and guidance to people who need it.
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
    fontSize: moderateScale(21),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginBottom: verticalScale(3),
    textAlign: 'center',
  },
  tagline: {
    fontSize: moderateScale(14),
    color: '#000',
    fontFamily: 'Lato-Regular',
    marginBottom: verticalScale(15),
    textAlign: 'center',
  },
  aboutTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    marginBottom: verticalScale(10),
    alignSelf: 'flex-start',
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
