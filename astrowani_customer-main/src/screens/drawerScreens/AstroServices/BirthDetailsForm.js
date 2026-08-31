// Shared birth-details input (name, gender, DOB, time of birth, place) — extracted from
// JanamKundaliScreen.js's date/time/location collection pattern so the 6 paid report screens
// that need identical inputs (Kundli, Chart, Dasha, Dosh, Lal Kitab, KP Astrology) — and Matching,
// which renders this twice — don't each reimplement it.
//
// Reports itself upward via onValuesChange with fields already formatted the way the backend's
// /api/astro/:key handlers expect: date as dd/mm/yyyy, time as HH:mm (24h) — the backend passes
// these straight through to JyotishamAstroAPI without reformatting (see astroRoutes.js birthQuery).
import React, {useEffect, useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '../../../components/ThemedDateTimePicker';
import PlaceAutocomplete, {geocodePlace} from '../../../components/PlaceAutocomplete';
import {LanguageContext} from '../../../context/LanguageContext';
import useSavedProfile from '../../../hooks/useSavedProfile';
import {showStatusPopup} from '../../../components/StatusPopup';

// Google Places/Geocoding were removed here: the shipped key's Cloud project
// had billing disabled, so both APIs returned REQUEST_DENIED, coordinates never
// got set, and every report's Pay button stayed disabled with no explanation
// (2026-08-15). PlaceAutocomplete uses Open-Meteo's keyless, billing-free
// geocoding instead, so there is no credential to lapse — and it reports its
// own failures in the UI rather than dead-ending the form.

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

// Parses whatever the backend's time_of_birth column holds — "HH:MM" or
// "HH:MM:SS" depending on which screen originally wrote it (Register.jsx sends
// seconds, UserProfileScreen.js doesn't) — into a Date carrying just that
// hour/minute, so it can seed the time picker.
function parseTimeString(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}

export default function BirthDetailsForm({
  title, showName = true, showGender = false, showUseProfile = true, onValuesChange,
}) {
  const {t} = React.useContext(LanguageContext);
  const displayTitle = title || t('kundali.enterDetails');
  const GENDER_OPTIONS = [
    {label: t('register.male'), value: 'male'},
    {label: t('register.female'), value: 'female'},
    {label: t('register.other'), value: 'other'},
  ];
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [timeOfBirth, setTimeOfBirth] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [place, setPlace] = useState('');
  // Bumped on every profile-fill so PlaceAutocomplete remounts and picks up the
  // new `initialValue` — it only reads that prop once, on mount, the same way
  // every other seeded-value field in this codebase works.
  const [placeFieldKey, setPlaceFieldKey] = useState(0);
  const {fetchProfile, loading: profileLoading} = useSavedProfile();

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

    if (showName && profile.name) setName(profile.name);
    // Report forms use lowercase male/female/other; older accounts have
    // capitalized values from the sign-up form's own gender picker.
    if (profile.gender) setGender(String(profile.gender).toLowerCase());
    if (profile.dob) setDateOfBirth(new Date(profile.dob));
    if (profile.timeOfBirth) setTimeOfBirth(parseTimeString(profile.timeOfBirth));

    let placeResolved = !profile.placeOfBirth;
    if (profile.placeOfBirth) {
      // The profile stores only a place NAME — no coordinates — so it has to
      // be re-geocoded here. A stale/failed lookup must not silently keep old
      // coordinates: a birth chart for the wrong city is worse than an empty
      // field the customer notices and fixes.
      const geo = await geocodePlace(profile.placeOfBirth);
      if (geo) {
        setPlace(geo.label);
        setCoordinates({latitude: geo.latitude, longitude: geo.longitude});
        setPlaceFieldKey((k) => k + 1);
        placeResolved = true;
      } else {
        setPlace('');
        setCoordinates(null);
      }
    }

    const missing = (showName && !profile.name) || (showGender && !profile.gender) || !profile.dob
      || !profile.timeOfBirth || !placeResolved;
    if (!placeResolved && profile.placeOfBirth) {
      showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profilePlaceNotFound')});
    } else if (missing) {
      showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profileFilledPartial')});
    }
  };

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
      <Text style={styles.title}>{displayTitle}</Text>

      {showUseProfile && (
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
      )}

      {showName && (
        <TextInput
          placeholder={t('kundali.enterFullName')}
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
            placeholder={t('kundali.selectGender')}
            placeholderStyle={styles.dropdownText}
            selectedTextStyle={styles.dropdownText}
            value={gender}
            onChange={(item) => setGender(item.value)}
            renderRightIcon={() => <Ionicons name="chevron-down-outline" color={COLORS.AstroMaroon} size={20} />}
          />
        </View>
      )}

      <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
        <Text style={styles.dropdownText}>{dateOfBirth ? dateOfBirth.toLocaleDateString() : t('kundali.selectDob')}</Text>
        <Ionicons name="calendar" color={COLORS.AstroMaroon} size={22} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker(true)}>
        <Text style={styles.dropdownText}>
          {timeOfBirth ? timeOfBirth.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : t('kundali.selectTob')}
        </Text>
        <Ionicons name="alarm-outline" color={COLORS.AstroMaroon} size={22} />
      </TouchableOpacity>

      {/* Passing null on edit clears the coordinates, so changing the place after
          picking one re-disables submit instead of keeping the old city's chart.
          Keyed so a profile-fill (which sets `place` programmatically, not via
          onSelect) can force a remount to actually display the new text —
          PlaceAutocomplete only reads initialValue once, on mount. */}
      <PlaceAutocomplete
        key={placeFieldKey}
        initialValue={place}
        placeholder={t('kundali.enterPlaceOfBirth')}
        onSelect={(picked) => {
          if (!picked) {
            setPlace('');
            setCoordinates(null);
            return;
          }
          setPlace(picked.label);
          setCoordinates({latitude: picked.latitude, longitude: picked.longitude});
        }}
      />

      {showDatePicker && (
        <DateTimePicker
          value={dateOfBirth || new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
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
  useProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingVertical: verticalScale(7),
    paddingHorizontal: scale(12),
    marginBottom: verticalScale(12),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    borderColor: COLORS.AstroMaroon,
    backgroundColor: '#FDF3EE',
  },
  useProfileBtnText: {
    fontSize: moderateScale(12.5),
    fontFamily: 'Lato-Bold',
    color: COLORS.AstroMaroon,
    marginLeft: scale(6),
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
