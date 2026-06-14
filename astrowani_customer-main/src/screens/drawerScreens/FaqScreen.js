import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

import Icon from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';

const FaqScreen = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleSection = index => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const sections = [
    {
      title: 'I want to chat with an Astrologer. How do I start?',
      content:
        'In order to chat with an Astrologer, all you need to do is login to your Astrowani account or sign up to create an account, add money to your wallet, and then simply choose the Astrologer you want to chat with and begin your session.',
    },
    {
      title:
        'Is there any requirement of minimum balance before I begin consulting an Astrologer?',
      content:
        'You need to have a minimum balance of $10 to start consulting an Astrologer on Astrowani.',
    },
    {
      title: 'Are the Astrologers verified?',
      content:
        'Yes, all the Astrologers on Astrowani are verified professionals with years of experience.',
    },
    {
      title:
        'If I get a phone call in between a chat, will it automatically end my session?',
      content:
        'No, your session will not end automatically if you receive a phone call. The chat will be paused, and you can resume once the call ends.',
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
                color="#D73D60"
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
    flex: 1,
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
