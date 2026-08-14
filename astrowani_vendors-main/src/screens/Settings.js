import React, {useContext} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Alert} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';
import {LanguageContext} from '../context/LanguageContext';

const SETTINGS_SCREENS = [];

// TODO: replace the About Us / FAQ's URLs with the real website links.
const SETTINGS_LINKS = [
  {labelKey: 'settings.aboutUs', icon: 'info', url: 'https://astrowani.com/about-us/'},
  {labelKey: 'settings.faq', icon: 'help-outline', url: 'https://astrowani.com/faq/'},
  {labelKey: 'settings.refundCancellation', icon: 'attach-money', url: 'https://astrowani.com/refund_cancellation/'},
  {labelKey: 'settings.privacyPolicy', icon: 'privacy-tip', url: 'https://astrowani.com/privacy-policy/'},
  {labelKey: 'settings.termsConditions', icon: 'gavel', url: 'https://astrowani.com/term_conditions/'},
  {labelKey: 'settings.safetyGuidelines', icon: 'verified-user', url: 'https://astrowani.com/safety-guidelines/'},
  {labelKey: 'settings.childSafety', icon: 'shield', url: 'https://astrowani.com/child-safety/'},
];

export default function Settings({navigation}) {
  const {t} = useContext(LanguageContext);
  const openLink = async url => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Unable to open link', 'Please check your internet connection and try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {SETTINGS_SCREENS.map(item => (
          <TouchableOpacity
            key={item.labelKey}
            style={styles.item}
            onPress={() => navigation.navigate(item.screen)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{t(item.labelKey)}</Text>
            </View>
            <Icon name="keyboard-arrow-right" size={25} color="#888" />
          </TouchableOpacity>
        ))}
        {SETTINGS_LINKS.map(item => (
          <TouchableOpacity
            key={item.labelKey}
            style={styles.item}
            onPress={() => openLink(item.url)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{t(item.labelKey)}</Text>
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
