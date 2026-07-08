import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import useAstroPurchase from './useAstroPurchase';

export default function KundliInputScreen({navigation}) {
  const [values, setValues] = useState({isComplete: false});
  const {service, submitting, submit} = useAstroPurchase('kundli');

  const onSubmit = async () => {
    const data = await submit({
      date: values.date, time: values.time, latitude: values.latitude, longitude: values.longitude, tz: values.tz,
    });
    if (data) navigation.navigate('KundliResultScreen', {data});
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <BirthDetailsForm title="Enter Your Birth Details" onValuesChange={setValues} />
      <TouchableOpacity
        style={[styles.button, (!values.isComplete || submitting) && styles.disabled]}
        disabled={!values.isComplete || submitting}
        onPress={onSubmit}>
        {submitting ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.buttonText}>Get Kundli Report{service ? ` — ₹${service.price}` : ''}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
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
