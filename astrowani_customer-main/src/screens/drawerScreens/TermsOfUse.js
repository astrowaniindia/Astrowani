import { ScrollView, StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const TermsOfUse = () => {
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Terms of Use</Text>
        <View style={styles.textcontainer}>
          <Text style={styles.text}>
            TERMS AND CONDITIONS OF USAGE{'\n\n'}
            These terms and conditions of Use (hereinafter referred as “Terms of Usage”) describe and govern the User’s use of the content and services offered by astrowaniindia through www.astrowaniindia.com or www.astrowani.com (hereinafter referred as “We” “astrowaniindia” “us” “our” “astrowaniindia application” “Website”).{'\n\n'}

            UPDATION{'\n'}
            The Website may update/amend/modify these Terms of Usage from time to time. The User is responsible to check the Terms of Usage periodically to remain in compliance with these terms.{'\n\n'}

            USER CONSENT{'\n'}
            By accessing the Website and using it, you (“Member”, “You”, “Your”) indicate that you understand the terms and unconditionally & expressly consent to the Terms of Usage of this Website. If you do not agree with the Terms of Usage, please do not click on the “I AGREE” button. The User is advised to read the Terms of Usage carefully before using or registering on the Website or accessing any material, information or services through the Website. Your use and continued usage of the Website (irrespective of the amendments made from time to time) shall signify your acceptance of the terms of usage and your agreement to be legally bound by the same.{'\n\n'}

            GENERAL DESCRIPTION{'\n'}
            The Website is an internet-based portal having its existence on World Wide Web, Application and other electronic medium and provides astrological content, reports, data, telephone, video and email consultations (hereinafter referred as “Content”). The Website is offering “Free Services” and “Paid Services” (Collectively referred as “Services”). Free Services are easily accessible without becoming a member however for accessing the personalised astrological services and/or receive additional Content and get access to Paid Services, You are required to register as a member on the portal.{'\n\n'}
            
            REGISTRATION AND ELIGIBILITY{'\n'}
            The User of the Website must be a person who can form legally binding contracts under Indian Contract Act, 1872...{'\n\n'}
            {/* Similarly continue adding the rest of your terms section-wise... */}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default TermsOfUse;

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
  textcontainer: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(9),
    padding: scale(15),
    elevation: 3,
  },
  text: {
    color: '#000',
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    lineHeight: moderateScale(22),
  },
});
