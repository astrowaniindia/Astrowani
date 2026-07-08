import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import useAstroPurchase from './useAstroPurchase';

export default function MatchingInputScreen({navigation}) {
  const [boy, setBoy] = useState({isComplete: false});
  const [girl, setGirl] = useState({isComplete: false});
  const {service, submitting, submit} = useAstroPurchase('matching');

  const isComplete = boy.isComplete && girl.isComplete;

  const onSubmit = async () => {
    const data = await submit({
      boy_date: boy.date, boy_time: boy.time, boy_latitude: boy.latitude, boy_longitude: boy.longitude, boy_tz: boy.tz,
      girl_date: girl.date, girl_time: girl.time, girl_latitude: girl.latitude, girl_longitude: girl.longitude, girl_tz: girl.tz,
    });
    if (data) navigation.navigate('MatchingResultScreen', {data});
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <BirthDetailsForm title="Boy's Details" showName={false} onValuesChange={setBoy} />
      <View style={styles.divider} />
      <BirthDetailsForm title="Girl's Details" showName={false} onValuesChange={setGirl} />
      <TouchableOpacity
        style={[styles.button, (!isComplete || submitting) && styles.disabled]}
        disabled={!isComplete || submitting}
        onPress={onSubmit}>
        {submitting ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.buttonText}>Match Kundli{service ? ` — ₹${service.price}` : ''}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  divider: {height: 1, backgroundColor: COLORS.AstroMaroon, opacity: 0.15, marginVertical: verticalScale(10)},
  button: {
    height: verticalScale(48),
    marginTop: verticalScale(10),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.AstroGold,
  },
  disabled: {opacity: 0.5},
  buttonText: {color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold'},
});
