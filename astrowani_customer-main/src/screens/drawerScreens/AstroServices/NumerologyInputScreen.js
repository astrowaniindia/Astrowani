import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {Dropdown} from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker from '../../../components/ThemedDateTimePicker';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import useAstroPurchase from './useAstroPurchase';
import {LanguageContext} from '../../../context/LanguageContext';
import useSavedProfile from '../../../hooks/useSavedProfile';
import {showStatusPopup} from '../../../components/StatusPopup';
import SwipeToConfirm from '../../../components/SwipeToConfirm';

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
  const {service, submitting, submit, resultParams} = useAstroPurchase('numerology');
  const {fetchProfile, loading: profileLoading} = useSavedProfile();

  const isComplete = Boolean(name && phone && gender && dob);

  const applyMyProfile = async () => {
    const {profile, error} = await fetchProfile();
    if (!profile) {
      showStatusPopup({
        variant: 'info',
        title: t('astro.useMyProfile'),
        message: error === 'not_logged_in' ? t('astro.profileNotLoggedIn') : t('astro.profileFillFailed'),
      });
      return;
    }
    if (profile.name) setName(profile.name);
    if (profile.phone) setPhone(profile.phone);
    if (profile.gender) setGender(String(profile.gender).toLowerCase());
    if (profile.dob) setDob(new Date(profile.dob));
    if (!profile.name || !profile.phone || !profile.gender || !profile.dob) {
      showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profileFilledPartial')});
    }
  };

  const onSubmit = async () => {
    const data = await submit({date: toApiDate(dob), name, phone, gender});
    if (data) navigation.navigate('NumerologyResultScreen', resultParams(data));
  };

  return (
    <ScrollView style={styles.main} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('kundali.enterDetails')}</Text>

      <TouchableOpacity
        style={styles.useProfileBtn}
        activeOpacity={0.8}
        disabled={profileLoading}
        onPress={applyMyProfile}>
        {profileLoading ? (
          <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
        ) : (
          <Ionicons name="person-circle-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
        )}
        <Text style={styles.useProfileBtnText}>
          {profileLoading ? t('astro.fillingFromProfile') : t('astro.useMyProfile')}
        </Text>
      </TouchableOpacity>

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
          maximumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDob(selectedDate);
          }}
        />
      )}
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
  title: {fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(10)},
  useProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
    paddingVertical: verticalScale(7), paddingHorizontal: scale(12), marginBottom: verticalScale(12),
    borderRadius: moderateScale(20), borderWidth: 1, borderColor: COLORS.AstroMaroon, backgroundColor: '#FDF3EE',
  },
  useProfileBtnText: {fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginLeft: scale(6)},
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
