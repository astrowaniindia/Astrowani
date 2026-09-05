import React, {useState} from 'react';
import {View,Text, StyleSheet, ScrollView} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';

export default function DashaInputScreen({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [values, setValues] = useState({isComplete: false});
  const {service, submitting, submit, resultParams} = useAstroPurchase('dasha');

  const onSubmit = async () => {
    const data = await submit({
      date: values.date, time: values.time, latitude: values.latitude, longitude: values.longitude, tz: values.tz,
    });
    if (data) navigation.navigate('DashaResultScreen', resultParams(data));
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <BirthDetailsForm title={t('astro.enterBirthDetails')} showName={false} onValuesChange={setValues} />
      {/* Slide, not tap. This is where the wallet is debited, and a deliberate
          drag is much harder to do by accident than a tap on a phone held in one
          hand. Disabled until the birth details are complete, exactly as the
          button was. */}
      <View style={styles.swipeWrap}>
        <SwipeToConfirm
          label={service ? t('astroReports.slideToPay', {price: service.price}) : t('astroReports.slideToStart')}
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
});
