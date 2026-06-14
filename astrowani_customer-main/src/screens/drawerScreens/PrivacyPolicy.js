import { ScrollView, StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const PrivacyPolicy = () => {
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Privacy Policy</Text>
        <View style={styles.textContainer}>
          <Text style={styles.text}>
            www.astrowani.com or www.astrowaniindia.com (“we”, “astrowaniindia)”, “astrowaniindia” (web and application) 
            hereinafter referred as “website”) is committed to protect the privacy of the users of the website (including 
            astrologers and buyers/customers whether registered or not registered). Please read this privacy policy carefully 
            to understand how the website is going to use your information supplied by you to the Website.{"\n\n"}

            This Privacy Policy is published in accordance with Rule 3(1) of the Information Technology (Intermediaries 
            Guidelines) Rules, 2011 and Information Technology (Reasonable Security Practices and Procedures and Sensitive 
            Personal Data or Information) Rules, 2011...{"\n\n"}

            USER’S CONSENT{"\n"}
            This Privacy Policy, which may be updated/amended from time to time, deals with the information collected from 
            its users in the form of personal identification, contact details, birth details...{"\n\n"}

            Collection of Personal Information{"\n"}
            Creating a user profile with astrowaniindia involves providing specific information like phone number for OTP 
            verification, name, and optionally date of birth...{"\n\n"}

            PURPOSE AND USE OF DATA/INFORMATION COLLECTION{"\n"}
            By collecting this information, astrowaniindia aims to create a personalized user profile...{"\n\n"}

            Data Deletion{"\n"}
            Delete Profile: If you wish to delete your entire astrowaniindia profile, including personal information associated 
            with it, you can click on "Delete your account" from the side menu...{"\n\n"}

            Voice Recording and Microphone Permission{"\n"}
            To enable recording your questions and thoughts, we request access to your microphone...{"\n\n"}

            COMMITMENT{"\n"}
            The Website intends to protect the privacy of all kinds of users visiting the platform...{"\n\n"}

            INFORMATION COLLECTED BY WEBSITE{"\n"}
            Personal Identifiable Information, Non-Personal Identifiable Information...{"\n\n"}

            SECURITY MEASURES{"\n"}
            The website uses security practices including SSL encryption, however, no transmission is completely secure...{"\n\n"}

            CHILDREN PRIVACY POLICY{"\n"}
            If you are under 13 years of age, please do not use any of the services provided by the website...{"\n\n"}

            DISCLAIMER{"\n"}
            The website is not responsible for any communication between the user and any third-party websites...
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default PrivacyPolicy;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(15),
  },
  heading: {
    color: '#000',
    marginVertical: verticalScale(10),
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
  },
  textContainer: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(9),
    padding: scale(15),
    elevation: 3,
  },
  text: {
    color: '#000',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    lineHeight: verticalScale(22),
  },
});
