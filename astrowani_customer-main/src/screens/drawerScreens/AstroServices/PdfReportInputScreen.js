import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {Dropdown} from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import BirthDetailsForm from './BirthDetailsForm';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';

const TEMPLATES = [
  {label: 'Vedic 5 Year Predictions', value: 'vedic_five_year_predictions'},
  {label: 'Vedic 10 Year Predictions', value: 'vedic_ten_year_predictions'},
  {label: 'Vedic 15 Year Predictions', value: 'vedic_fifteen_year_predictions'},
  {label: 'Destiny Of Heart: Love Life', value: 'destiny_of_heart'},
  {label: 'Numerology 3 Year Predictions', value: 'numero_three_year_predictions'},
  {label: 'Numerology 5 Year Predictions', value: 'numero_five_year_predictions'},
  {label: 'Numerology 9 Year Predictions', value: 'numero_nine_year_predictions'},
  {label: 'Life Purpose', value: 'life_purpose_report'},
  {label: 'Career Success', value: 'career_success'},
  {label: 'Horoscope Report', value: 'generate'},
  {label: 'Foreign Travel', value: 'foreign_travel_report'},
  {label: 'Government Job', value: 'government_job_report'},
  {label: 'Financial Opportunities & Challenges', value: 'financial_opportunities_and_challenges_report'},
  {label: 'Education & Learning Pathways', value: 'education_and_learning_pathways_report'},
  {label: 'Kundali Samyak', value: 'kundali_samyak'},
  {label: 'Kundali Dirgha Drishti', value: 'kundali_dirghaDrishti'},
  {label: 'Kundali Mool Patrika', value: 'Kundali_moolPatrika'},
  {label: 'The Business Code: Startup Success', value: 'startup_success'},
  {label: 'Motherhood by Numbers', value: 'motherhood_by_numbers'},
  {label: '2026 Decision Year Report', value: 'decision_year_report_2026'},
  {label: '2026 Master Combo Report', value: 'master_combo_report_2026'},
  {label: 'Wellness by Numbers', value: 'wellness_guide'},
  {label: 'Life Direction & Purpose Report 2026', value: 'life_direction_report_2026'},
  {label: 'Personal Empowerment & Confidence Boosters', value: 'personal_empowerment_report'},
];

export default function PdfReportInputScreen({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [name, setName] = useState('');
  const [values, setValues] = useState({isComplete: false});
  const [template, setTemplate] = useState(null);
  const {service, submitting, submit} = useAstroPurchase('pdf-report');

  const isComplete = Boolean(name && values.isComplete && values.place && template);

  const onSubmit = async () => {
    const data = await submit({
      name, date: values.date, time: values.time, latitude: values.latitude, longitude: values.longitude,
      tz: values.tz, place: values.place, template,
    });
    if (data) navigation.navigate('PdfReportResultScreen', {data});
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('astro.yourDetails')}</Text>
      <TextInput
        placeholder={t('kundali.enterFullName')} placeholderTextColor={COLORS.placeholder}
        style={styles.input} value={name} onChangeText={setName}
      />
      <BirthDetailsForm title="" showName={false} onValuesChange={setValues} />
      <Text style={styles.label}>{t('astro.chooseReport')}</Text>
      <View style={styles.dropdownContainer}>
        <Dropdown
          style={styles.dropdown} data={TEMPLATES} labelField="label" valueField="value"
          placeholder={t('astro.selectPdfReport')} placeholderStyle={styles.dropdownText} selectedTextStyle={styles.dropdownText}
          value={template} onChange={(item) => setTemplate(item.value)}
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
          <Text style={styles.buttonText}>{t('astro.generatePdfReport')}{service ? ` — ₹${service.price}` : ''}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  main: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  content: {padding: scale(15)},
  title: {fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(10)},
  label: {fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(6)},
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
