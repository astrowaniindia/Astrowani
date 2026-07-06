import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

const FaqScreen = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleSection = index => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const sections = [
    {
      title: 'How do I start receiving chat, call, or video requests?',
      content:
        'Complete your profile (photo, specialties, languages, and per-minute charges) and wait for admin approval. Once approved, turn on the service toggles (Chat/Call/Video) and GO LIVE from your Home screen to start receiving requests from customers.',
    },
    {
      title: 'Why is my profile not visible to customers?',
      content:
        'Your profile becomes visible only after an admin approves your account and your profile is complete (photo, charges, and specialties filled in). If you are approved but still not visible, make sure at least one of your service toggles is turned on.',
    },
    {
      title: 'How and when do I get paid for a session?',
      content:
        'Earnings are credited to your in-app Wallet automatically as each session is billed, in real time — you do not need to wait for the session to end. You can track Today\'s Earnings and Total Earnings from the Home screen and Wallet section.',
    },
    {
      title: 'Can I set my own per-minute charges?',
      content:
        'Yes. Go to Edit Profile to set separate per-minute charges for Chat, Call, and Video consultations. You can update these anytime.',
    },
    {
      title: 'What happens if I miss an incoming request?',
      content:
        'If you do not respond within the request window, it is automatically marked as a Missed Session. You can review all missed chat, audio, and video requests from the Missed Sessions screen in the drawer menu.',
    },
    {
      title: 'How do I go live to reach more customers?',
      content:
        'Tap "GO LIVE" from your Home screen to start a live stream. Customers can join, chat, and send you gifts during your live session, which also add to your earnings.',
    },
    {
      title: 'Who do I contact if I face an issue with the app or my payout?',
      content:
        'You can reach our support team anytime from the Support option in the drawer menu, or report a technical/security issue using "Report Vulnerability" in Settings.',
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Frequently Asked Questions</Text>
      {sections.map((section, index) => {
        const isActive = activeIndex === index;
        return (
          <View key={index} style={styles.section}>
            <TouchableOpacity
              style={styles.header}
              onPress={() => toggleSection(index)}>
              <Text
                style={[
                  styles.headerText,
                  isActive ? styles.activeHeaderText : null,
                ]}>
                {section.title}
              </Text>
              <Icon
                name={isActive ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={20}
                color={COLORS.AstroMaroon}
              />
            </TouchableOpacity>
            {isActive && (
              <View style={styles.content}>
                <Text style={styles.contenttxt}>{section.content}</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: scale(20),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  title: {
    fontSize: moderateScale(19),
    fontFamily: 'Lato-Bold',
    color: '#000',
    marginLeft: scale(5),
    marginBottom: verticalScale(20),
  },
  section: {
    borderBottomWidth: verticalScale(1),
    marginBottom: verticalScale(10),
    borderBottomColor: '#E0E0E0',
    padding: scale(15),
    borderRadius: moderateScale(10),
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  headerText: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.black,
    width: scale(260),
  },
  activeHeaderText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    textDecorationLine: 'underline',
  },
  content: {
    padding: verticalScale(10),
    borderRadius: moderateScale(5),
    backgroundColor: COLORS.AntiFlash,
  },
  contenttxt: {
    color: '#000',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
  },
});

export default FaqScreen;
