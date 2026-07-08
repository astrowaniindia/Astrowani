import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {Dropdown} from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import useAstroPurchase from './useAstroPurchase';

const DIVISIONS = [
  {label: 'D1 — Rasi Chart', value: 'd1'}, {label: 'D3', value: 'd3'}, {label: 'D4', value: 'd4'},
  {label: 'D6', value: 'd6'}, {label: 'D7', value: 'd7'}, {label: 'D8', value: 'd8'},
  {label: 'D9 — Navamsa', value: 'd9'}, {label: 'D10', value: 'd10'}, {label: 'D12', value: 'd12'},
  {label: 'D16', value: 'd16'}, {label: 'D20', value: 'd20'}, {label: 'D24', value: 'd24'},
  {label: 'D27', value: 'd27'}, {label: 'D30', value: 'd30'}, {label: 'D40', value: 'd40'},
  {label: 'D45', value: 'd45'}, {label: 'D60', value: 'd60'},
  {label: 'Sun Chart', value: 'sun'}, {label: 'Moon Chart', value: 'moon'},
  {label: 'Bhav Chalit Chart', value: 'bhav_chalit_chart'}, {label: 'Transit Chart', value: 'transit_chart'},
];

export default function ChartInputScreen({navigation}) {
  const [values, setValues] = useState({isComplete: false});
  const [division, setDivision] = useState(null);
  const {service, submitting, submit} = useAstroPurchase('chart');

  const isComplete = values.isComplete && Boolean(division);

  const onSubmit = async () => {
    const data = await submit({
      date: values.date, time: values.time, latitude: values.latitude, longitude: values.longitude, tz: values.tz, division,
    });
    if (data) navigation.navigate('ChartResultScreen', {data});
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <BirthDetailsForm title="Enter Birth Details" showName={false} onValuesChange={setValues} />
      <Text style={styles.label}>Choose Chart</Text>
      <View style={styles.dropdownContainer}>
        <Dropdown
          style={styles.dropdown}
          data={DIVISIONS}
          labelField="label"
          valueField="value"
          placeholder="Select a chart"
          placeholderStyle={styles.dropdownText}
          selectedTextStyle={styles.dropdownText}
          value={division}
          onChange={(item) => setDivision(item.value)}
          renderRightIcon={() => <Ionicons name="chevron-down-outline" color={COLORS.AstroMaroon} size={20} />}
        />
      </View>
      <TouchableOpacity
        style={[styles.button, (!isComplete || submitting) && styles.disabled]}
        disabled={!isComplete || submitting}
        onPress={onSubmit}>
        {submitting ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.buttonText}>Get Chart{service ? ` — ₹${service.price}` : ''}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  label: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(6)},
  dropdownContainer: {
    paddingHorizontal: scale(10), marginBottom: verticalScale(10), borderRadius: moderateScale(8),
    borderWidth: 1, backgroundColor: COLORS.white, borderColor: COLORS.AshGray,
  },
  dropdown: {width: '100%', height: verticalScale(50)},
  dropdownText: {fontSize: moderateScale(14), fontFamily: 'Lato-Regular', color: COLORS.AstroMaroon},
  button: {
    height: verticalScale(48), marginTop: verticalScale(10), justifyContent: 'center', alignItems: 'center',
    borderRadius: moderateScale(8), backgroundColor: COLORS.AstroGold,
  },
  disabled: {opacity: 0.5},
  buttonText: {color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold'},
});
