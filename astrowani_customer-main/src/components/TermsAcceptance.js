// Terms & Conditions acceptance checkbox for the sign-up screen.
//
// The tick box and the link text are SEPARATE touch targets on purpose: tapping
// the words "Terms & Conditions" must open the page, while tapping anywhere else
// on the row toggles acceptance. Wrapping the whole row in one Touchable would
// make it impossible to read the terms without also accepting them, which is the
// one thing a consent control must not do.
import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Linking} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {LEGAL_LINKS} from '../config/legal';
import {LanguageContext} from '../context/LanguageContext';
import {captureEvent} from '../utils/Analytics';

export default function TermsAcceptance({accepted, onChange, style}) {
  const {t} = React.useContext(LanguageContext);

  const open = (url, which) => {
    captureEvent('legal_link_opened', {link: which, screen: 'signup'});
    // Never let a dead or malformed URL crash the sign-up screen.
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity
        onPress={() => {
          // The terms checkbox is a hard gate on step 3 of signup — knowing how many
          // people tick it, and how many untick it again, is worth one event.
          captureEvent('terms_toggled', {accepted: !accepted});
          onChange(!accepted);
        }}
        activeOpacity={0.7}
        // Generous hit slop: the box itself is small, and a consent control that
        // is fiddly to tap reads as a broken one.
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
        accessibilityRole="checkbox"
        accessibilityState={{checked: !!accepted}}
        accessibilityLabel={t('register.acceptTerms')}
        style={[styles.box, accepted && styles.boxChecked]}>
        {!!accepted && <Icon name="check" size={moderateScale(15)} color={COLORS.white} />}
      </TouchableOpacity>

      <Text style={styles.text}>
        {t('register.acceptPrefix')}
        <Text style={styles.link} onPress={() => open(LEGAL_LINKS.termsOfUse, 'terms')}>
          {t('register.termsAndConditions')}
        </Text>
        {t('register.acceptAnd')}
        <Text style={styles.link} onPress={() => open(LEGAL_LINKS.privacyPolicy, 'privacy')}>
          {t('settings.privacyPolicy')}
        </Text>
        {/* Empty in English, where the sentence is already complete. Hindi is
            verb-final, so its "…को पढ़कर स्वीकार करता/करती हूँ।" has to land
            after the last link rather than before the first. */}
        {t('register.acceptSuffix')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start', marginTop: verticalScale(6)},
  box: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(4),
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(10),
    // Nudges the box onto the first line of text rather than the top of the block.
    marginTop: verticalScale(1),
    backgroundColor: COLORS.white,
  },
  boxChecked: {backgroundColor: COLORS.AstroMaroon},
  text: {
    flex: 1,
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Regular',
    color: '#555',
    lineHeight: verticalScale(18),
  },
  link: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    textDecorationLine: 'underline',
  },
});
