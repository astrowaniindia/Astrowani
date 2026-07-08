// Shared birth-details input (name, gender, DOB, time of birth, place) — extracted from
// JanamKundaliScreen.js's date/time/location collection pattern so the 6 paid report screens
// that need identical inputs (Kundli, Chart, Dasha, Dosh, Lal Kitab, KP Astrology) — and Matching,
// which renders this twice — don't each reimplement it.
//
// Reports itself upward via onValuesChange with fields already formatted the way the backend's
// /api/astro/:key handlers expect: date as dd/mm/yyyy, time as HH:mm (24h) — the backend passes
// these straight through to JyotishamAstroAPI without reformatting (see astroRoutes.js birthQuery).
import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, Platform} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';
import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';

const GOOGLE_PLACES_KEY = 'AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA';

const GENDER_OPTIONS = [
  {label: 'Male', value: 'male'},
  {label: 'Female', value: 'female'},
  {label: 'Other', value: 'other'},
];

function toApiDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toApiTime(d) {
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export default function BirthDetailsForm({title = 'Enter Your Details', showName = true, showGender = false, onValuesChange}) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [timeOfBirth, setTimeOfBirth] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [place, setPlace] = useState('');

  useEffect(() => {
    const isComplete = Boolean(
      (!showName || name) && (!showGender || gender) && dateOfBirth && timeOfBirth && coordinates,
    );
    onValuesChange({
      name,
      gender,
      date: dateOfBirth ? toApiDate(dateOfBirth) : null,
      time: timeOfBirth ? toApiTime(timeOfBirth) : null,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      tz: '5.5',
      place,
      isComplete,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, gender, dateOfBirth, timeOfBirth, coordinates, place]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {showName && (
        <TextInput
          placeholder="Enter full name"
          placeholderTextColor={COLORS.placeholder}
          style={styles.input}
          value={name}
          onChangeText={setName}
        />
      )}

      {showGender && (
        <View style={styles.dropdownContainer}>
          <Dropdown
            style={styles.dropdown}
            data={GENDER_OPTIONS}
            labelField="label"
            valueField="value"
            placeholder="Select Gender"
            placeholderStyle={styles.dropdownText}
            selectedTextStyle={styles.dropdownText}
            value={gender}
            onChange={(item) => setGender(item.value)}
            renderRightIcon={() => <Ionicons name="chevron-down-outline" color={COLORS.AstroMaroon} size={20} />}
          />
        </View>
      )}

      <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dropdownText}>{dateOfBirth ? dateOfBirth.toLocaleDateString() : 'Select Date of Birth'}</Text>
        <Ionicons name="calendar" color={COLORS.AstroMaroon} size={22} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker(true)}>
        <Text style={styles.dropdownText}>
          {timeOfBirth ? timeOfBirth.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : 'Select Time of Birth'}
        </Text>
        <Ionicons name="alarm-outline" color={COLORS.AstroMaroon} size={22} />
      </TouchableOpacity>

      <GooglePlacesAutocomplete
        placeholder="Enter Place of Birth"
        onPress={(data, details = null) => {
          if (!details) return;
          const {lat, lng} = details.geometry.location;
          setCoordinates({latitude: lat, longitude: lng});
          setPlace(data.description);
        }}
        query={{key: GOOGLE_PLACES_KEY, language: 'en'}}
        styles={{
          container: {flex: 0, marginBottom: verticalScale(10)},
          textInput: styles.input,
          listView: {
            backgroundColor: 'white',
            borderRadius: moderateScale(5),
            position: 'absolute',
            top: Platform.select({ios: verticalScale(45), android: verticalScale(45)}),
            left: 0,
            right: 0,
            zIndex: 1000,
            elevation: 3,
          },
        }}
        enablePoweredByContainer={false}
        fetchDetails
      />

      {showDatePicker && (
        <DateTimePicker
          value={dateOfBirth || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDateOfBirth(selectedDate);
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={timeOfBirth || new Date()}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowTimePicker(false);
            if (selectedTime) setTimeOfBirth(selectedTime);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {paddingTop: verticalScale(6)},
  title: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    marginBottom: verticalScale(10),
  },
  input: {
    flexDirection: 'row',
    height: verticalScale(50),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: 1,
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
    color: '#000',
  },
  dropdownText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: COLORS.AstroMaroon,
  },
  dropdownContainer: {
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  dropdown: {width: '100%', height: verticalScale(50)},
});
