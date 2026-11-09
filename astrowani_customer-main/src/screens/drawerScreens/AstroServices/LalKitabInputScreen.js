import React, {useState} from 'react';
import {View,Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';
import {formatSpendable} from '../../../utils/payments';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {LAL_KITAB_ASSISTANT_ENABLED} from '../../../utils/featureFlags';

export default function LalKitabInputScreen({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [values, setValues] = useState({isComplete: false});
  const {service, submitting, submit, resultParams} = useAstroPurchase('lal-kitab');

  const onSubmit = async () => {
    const data = await submit({
      date: values.date, time: values.time, latitude: values.latitude, longitude: values.longitude, tz: values.tz,
    });
    if (data) navigation.navigate('LalKitabResultScreen', resultParams(data));
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      {/* The conversational version of this same report, which costs nothing.
          It sits HERE rather than on Home because this is where somebody who
          wants Lal Kitab already is, and the two share the same five Jyotisham
          endpoints - the paid report renders them, the assistant talks about
          them. Android only, and the backend still refuses it until an admin
          turns it on (utils/featureFlags.js). */}
      {LAL_KITAB_ASSISTANT_ENABLED && (
        <TouchableOpacity
          style={styles.assistantCard}
          onPress={() => navigation.navigate('LalKitabAssistantScreen')}>
          <Ionicons name="chatbubbles" size={moderateScale(22)} color={COLORS.AstroMaroon} />
          <View style={{flex: 1}}>
            <Text style={styles.assistantTitle}>{t('lalKitabAssistant.title')}</Text>
            <Text style={styles.assistantText}>{t('lalKitabAssistant.subtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={moderateScale(18)} color="#999" />
        </TouchableOpacity>
      )}

      <BirthDetailsForm title={t('astro.enterBirthDetails')} showName={false} onValuesChange={setValues} />
      {/* Slide, not tap. This is where the wallet is debited, and a deliberate
          drag is much harder to do by accident than a tap on a phone held in one
          hand. Disabled until the birth details are complete, exactly as the
          button was. */}
      <View style={styles.swipeWrap}>
        <SwipeToConfirm
          label={service ? t('astroReports.slideToPay', {price: formatSpendable(service.price)}) : t('astroReports.slideToStart')}
          confirmingLabel={t('astroReports.confirming')}
          onConfirm={onSubmit}
          busy={submitting}
          disabled={!values.isComplete}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  swipeWrap: {marginTop: verticalScale(14)},
  assistantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(13),
    marginBottom: verticalScale(14),
    elevation: 1,
  },
  assistantTitle: {fontSize: moderateScale(14), fontWeight: '700', color: COLORS.AstroMaroon},
  assistantText: {fontSize: moderateScale(11.5), color: '#666', marginTop: verticalScale(1)},
});
