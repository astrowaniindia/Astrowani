import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Alert} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';

// In-app screens (rendered natively, no URL needed).
const SETTINGS_SCREENS = [
  {label: 'About Us', icon: 'info', screen: 'AboutUsScreen'},
  {label: "FAQ's", icon: 'help-outline', screen: 'FaqScreen'},
];

// TODO: replace these placeholder URLs with the real website links.
const SETTINGS_LINKS = [
  {label: 'Refund & Cancellation', icon: 'attach-money', url: 'https://astrowani.com/refund-and-cancellation'},
  {label: 'Privacy Policy', icon: 'privacy-tip', url: 'https://astrowani.com/privacy-policy'},
  {label: 'Terms & Conditions', icon: 'gavel', url: 'https://astrowani.com/terms-and-conditions'},
  {label: 'Child Safety Standards', icon: 'shield', url: 'https://astrowani.com/child-safety-standards'},
  {label: 'Safety Standards', icon: 'verified-user', url: 'https://astrowani.com/safety-standards'},
  {label: 'Report Vulnerability', icon: 'bug-report', url: 'https://astrowani.com/report-vulnerability'},
];

export default function Settings({navigation}) {
  const openLink = async url => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Unable to open link', url);
      }
    } catch (error) {
      Alert.alert('Unable to open link', 'Please check your internet connection and try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {SETTINGS_SCREENS.map(item => (
          <TouchableOpacity
            key={item.label}
            style={styles.item}
            onPress={() => navigation.navigate(item.screen)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{item.label}</Text>
            </View>
            <Icon name="keyboard-arrow-right" size={25} color="#888" />
          </TouchableOpacity>
        ))}
        {SETTINGS_LINKS.map(item => (
          <TouchableOpacity
            key={item.label}
            style={styles.item}
            onPress={() => openLink(item.url)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{item.label}</Text>
            </View>
            <Icon name="open-in-new" size={20} color="#888" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: scale(10),
  },
  scrollContainer: {
    backgroundColor: COLORS.white,
    elevation: 3,
    padding: scale(10),
    borderRadius: moderateScale(10),
  },
  item: {
    paddingVertical: verticalScale(13),
    borderBottomWidth: verticalScale(1),
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(5),
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: scale(10),
  },
  text: {
    fontSize: moderateScale(15),
    color: '#000',
    fontFamily: 'Lato-Regular',
  },
});
