import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import SwipeToConfirm from '../../../components/SwipeToConfirm';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';

export default function MatchingInputScreen({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [boy, setBoy] = useState({isComplete: false});
  const [girl, setGirl] = useState({isComplete: false});
  const {service, submitting, submit, resultParams} = useAstroPurchase('matching');

  const isComplete = boy.isComplete && girl.isComplete;

  const onSubmit = async () => {
    const data = await submit({
      boy_date: boy.date, boy_time: boy.time, boy_latitude: boy.latitude, boy_longitude: boy.longitude, boy_tz: boy.tz,
      girl_date: girl.date, girl_time: girl.time, girl_latitude: girl.latitude, girl_longitude: girl.longitude, girl_tz: girl.tz,
    });
    if (data) navigation.navigate('MatchingResultScreen', resultParams(data));
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <BirthDetailsForm title={t('match.boysDetails')} showName={false} onValuesChange={setBoy} />
      <View style={styles.divider} />
      <BirthDetailsForm title={t('match.girlsDetails')} showName={false} onValuesChange={setGirl} />
      {/* Slide, not tap. This is where the wallet is debited, and a deliberate
          drag is much harder to do by accident than a tap on a phone held in one
          hand. Disabled until the details are complete, exactly as the button was. */}
      <View style={styles.swipeWrap}>
        <SwipeToConfirm
          label={service ? t('astroReports.slideToPay', {price: service.price}) : t('astroReports.slideToStart')}
          confirmingLabel={t('astroReports.confirming')}
          onConfirm={onSubmit}
          busy={submitting}
          disabled={!isComplete}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  divider: {height: 1, backgroundColor: COLORS.AstroMaroon, opacity: 0.15, marginVertical: verticalScale(10)},
  swipeWrap: {marginTop: verticalScale(14)},
});
