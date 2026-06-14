import React, { version } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  ScrollView,
  Clipboard,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';

const ReferAndEarnScreen = () => {
  const referralCode = '9KGBDDCGELG';

  const copyToClipboard = () => {
    Clipboard.setString(referralCode);
    Alert.alert('Copied to clipboard', `Referral code ${referralCode} copied!`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{
            uri: 'https://th.bing.com/th?id=OIP.ncJKHY7TUu_M4mKZVBmwCQHaEK&w=333&h=187&c=8&rs=1&qlt=90&o=6&pid=3.1&rm=2',
          }} // Replace with your image URI
          style={styles.image}
        />
      </View>

      <View style={styles.otherInfo}>
        <TouchableOpacity style={styles.getRewardButton}>
          <Text style={styles.getRewardText}>Get ₹250</Text>
        </TouchableOpacity>

        <Text style={styles.infoText}>For every new user you refer</Text>

        <View style={styles.referralCodeContainer}>
          <Text
            style={
              styles.referralCodeText
            }>{`Your Referral Code : ${referralCode}`}</Text>
          <TouchableOpacity onPress={copyToClipboard}>
            <Icon name="copy" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        <Text style={styles.shareInfoText}>
          Share your referral code and get a bonus up to ₹5000
        </Text>

        <View style={styles.socialIconsContainer}>
          <TouchableOpacity>
            <Icon
              name="facebook"
              size={40}
              color="#4267B2"
              style={styles.socialIcon}
            />
          </TouchableOpacity>
          <TouchableOpacity>
            <Icon
              name="telegram"
              size={40}
              color="#0088cc"
              style={styles.socialIcon}
            />
          </TouchableOpacity>
          <TouchableOpacity>
            <Icon
              name="share-alt"
              size={40}
              color="#000"
              style={styles.socialIcon}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.whatsappButton}>
          <Icon
            name="whatsapp"
            size={24}
            color="#fff"
            style={styles.whatsappIcon}
          />
          <Text style={styles.whatsappButtonText}>Refer Via Whatsapp</Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text style={styles.haveReferralCode}>Have a referral code?</Text>
        </TouchableOpacity>
        <View style={styles.termsContainer}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            1. Your friend must sign up on Astrowani using your referral
            code.
          </Text>
          <Text style={styles.termsText}>
            2. You will receive the reward after your friend's first recharge.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  imageContainer: {
    alignItems: 'center',
  },
  otherInfo: {
    paddingHorizontal: scale(15),
  },
  image: {
    width: '100%',
    height: verticalScale(200),
  },
  getRewardButton: {
    backgroundColor: COLORS.AstroGold,
    padding: scale(10),
    width: scale(150),
    borderBottomLeftRadius: moderateScale(6),
    borderBottomRightRadius: moderateScale(6),
    alignItems: 'center',
    alignSelf: 'center',
  },
  getRewardText: {
    color: '#000',
    fontSize: moderateScale(17),
    fontFamily: 'Lato-Bold',
  },
  infoText: {
    textAlign: 'center',
    fontSize: moderateScale(15),
    marginVertical: verticalScale(10),
    color: '#000',
    fontFamily: 'Lato-Regular',
  },
  referralCodeContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(6),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(8),
  },
  referralCodeText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',

    marginRight: scale(10),
    color: '#000',
  },
  shareInfoText: {
    textAlign: 'center',
    fontSize: moderateScale(14),
    marginVertical: verticalScale(9),
    fontFamily: 'Lato-Regular',

    color: '#000',
  },
  socialIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  socialIcon: {
    marginHorizontal: 15,
  },
  whatsappButton: {
    flexDirection: 'row',
    backgroundColor: '#25D366',
    padding: scale(13),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: verticalScale(10),
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: moderateScale(17),
    marginLeft: scale(10),
    fontFamily: 'Lato-Bold',
  },
  haveReferralCode: {
    textAlign: 'center',
    fontFamily: 'Lato-Regular',

    color: '#E91E63',
    marginBottom: verticalScale(15),
  },
  termsContainer: {
    marginTop: verticalScale(5),
    paddingVertical: verticalScale(10),
    borderTopWidth: verticalScale(2),
    borderTopColor: COLORS.AstroSoftOrange,
  },
  termsTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',

    color: '#000',
    marginBottom: verticalScale(13),
  },
  termsText: {
    fontSize: moderateScale(14),
    marginBottom: verticalScale(10),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
});

export default ReferAndEarnScreen;
