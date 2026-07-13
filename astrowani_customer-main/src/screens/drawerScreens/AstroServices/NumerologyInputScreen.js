import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {Dropdown} from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';

function toApiDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function NumerologyInputScreen({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const GENDER_OPTIONS = [
    {label: t('register.male'), value: 'male'}, {label: t('register.female'), value: 'female'}, {label: t('register.other'), value: 'other'},
  ];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState(null);
  const [dob, setDob] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const {service, submitting, submit} = useAstroPurchase('numerology');

  const isComplete = Boolean(name && phone && gender && dob);

  const onSubmit = async () => {
    const data = await submit({date: toApiDate(dob), name, phone, gender});
    if (data) navigation.navigate('NumerologyResultScreen', {data});
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('kundali.enterDetails')}</Text>
      <TextInput
        placeholder={t('kundali.enterFullName')} placeholderTextColor={COLORS.placeholder}
        style={styles.input} value={name} onChangeText={setName}
      />
      <TextInput
        placeholder={t('astro.enterMobileNumber')} placeholderTextColor={COLORS.placeholder}
        style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad"
      />
      <View style={styles.dropdownContainer}>
        <Dropdown
          style={styles.dropdown} data={GENDER_OPTIONS} labelField="label" valueField="value"
          placeholder={t('kundali.selectGender')} placeholderStyle={styles.dropdownText} selectedTextStyle={styles.dropdownText}
          value={gender} onChange={(item) => setGender(item.value)}
          renderRightIcon={() => <Ionicons name="chevron-down-outline" color={COLORS.AstroMaroon} size={20} />}
        />
      </View>
      <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dropdownText}>{dob ? dob.toLocaleDateString() : t('kundali.selectDob')}</Text>
        <Ionicons name="calendar" color={COLORS.AstroMaroon} size={22} />
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={dob || new Date()} mode="date" display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDob(selectedDate);
          }}
        />
      )}
      <TouchableOpacity
        style={[styles.button, (!isComplete || submitting) && styles.disabled]}
        disabled={!isComplete || submitting}
        onPress={onSubmit}>
        {submitting ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.buttonText}>{t('astro.getNumerologyReport')}{service ? ` — ₹${service.price}` : ''}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  title: {fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(10)},
  input: {
    flexDirection: 'row', height: verticalScale(50), paddingHorizontal: scale(10), marginBottom: verticalScale(10),
    alignItems: 'center', justifyContent: 'space-between', borderRadius: moderateScale(8),
    borderWidth: 1, backgroundColor: COLORS.white, borderColor: COLORS.AshGray, color: '#000',
  },
  dropdownText: {fontSize: moderateScale(14), fontFamily: 'Lato-Regular', color: COLORS.AstroMaroon},
  dropdownContainer: {
    paddingHorizontal: scale(10), marginBottom: verticalScale(10), borderRadius: moderateScale(8),
    borderWidth: 1, backgroundColor: COLORS.white, borderColor: COLORS.AshGray,
  },
  dropdown: {width: '100%', height: verticalScale(50)},
  button: {
    height: verticalScale(48), marginTop: verticalScale(10), justifyContent: 'center', alignItems: 'center',
    borderRadius: moderateScale(8), backgroundColor: COLORS.AstroGold,
  },
  disabled: {opacity: 0.5},
  buttonText: {color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold'},
});
