import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import React, {useState} from 'react';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';
import PlaceAutocomplete, {geocodePlace} from '../../../components/PlaceAutocomplete';
import { LanguageContext } from '../../../context/LanguageContext';
import { useFreeServiceLanguage } from '../../../components/astro/ReportLanguage';
import { FREE_SERVICES_URL } from '../../../config/api';
import useSavedProfile from '../../../hooks/useSavedProfile';
import {showStatusPopup} from '../../../components/StatusPopup';

// Parses "HH:MM" or "HH:MM:SS" (the two shapes the backend's time_of_birth
// column holds, depending on which screen originally wrote it) into a Date
// carrying that hour/minute, to seed the time picker.
function parseTimeString(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}

const JanamKundaliScreen = ({navigation}) => {
  const { apiLanguage } = useFreeServiceLanguage(navigation);
  const { t } = React.useContext(LanguageContext);
  const [gender, setGender] = useState(null);
  const [name, setName] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [timeOfBirth, setTimeOfBirth] = useState(null);
  const [dontKnowTime, setDontKnowTime] = useState(false);
  // Starts null, NOT a hardcoded fallback. This previously defaulted to a fixed
  // lat/lng in Tamil Nadu and was interpolated into the request with no
  // validation, so anyone who did not pick a place — which was everyone while
  // Google Places was returning REQUEST_DENIED — silently got a birth chart
  // computed for a city they had never been to, presented as their own. A wrong
  // answer with no error is worse than a refusal; handleShowKundali now checks.
  const [coordinates, setCoordinates] = useState(null);
  const [loading, setLoading] = useState(false);
  // Only used to seed PlaceAutocomplete's displayed text after a profile-fill —
  // this screen otherwise tracks just coordinates, not the label.
  const [place, setPlace] = useState('');
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
    if (profile.name) setName(profile.name);
    if (profile.gender) setGender(String(profile.gender).toLowerCase());
    if (profile.dob) setDateOfBirth(new Date(profile.dob));
    if (profile.timeOfBirth) {
      setTimeOfBirth(parseTimeString(profile.timeOfBirth));
      setDontKnowTime(false);
    }

    let placeResolved = !profile.placeOfBirth;
    if (profile.placeOfBirth) {
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

    if (!placeResolved && profile.placeOfBirth) {
      showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profilePlaceNotFound')});
    } else if (!profile.name || !profile.gender || !profile.dob || !profile.timeOfBirth || !placeResolved) {
      showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profileFilledPartial')});
    }
  };

  const handleCheckboxChange = () => {
    setDontKnowTime(!dontKnowTime);
    if (!dontKnowTime) {
      setTimeOfBirth(null);
    }
  };

  const genderOptions = [
    {label: t('register.male'), value: 'male'},
    {label: t('register.female'), value: 'female'},
    {label: t('register.other'), value: 'other'},
  ];

  const onChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || dateOfBirth;
    setShowDatePicker(false);
    setDateOfBirth(currentDate);
  };

  const onChangeTime = (event, selectedTime) => {
    const currentTime = selectedTime || timeOfBirth;
    setShowTimePicker(false);
    setTimeOfBirth(currentTime);
  };

  const handleShowKundali = async () => {
    // Validate required fields
    if (!name) {
      Alert.alert(t('common.error'), t('kundali.pleaseEnterName'));
      return;
    }
    if (!gender) {
      Alert.alert(t('common.error'), t('kundali.pleaseSelectGender'));
      return;
    }
    if (!dateOfBirth) {
      Alert.alert(t('common.error'), t('kundali.pleaseSelectDob'));
      return;
    }
    if (!dontKnowTime && !timeOfBirth) {
      Alert.alert(t('common.error'), t('kundali.pleaseSelectTob'));
      return;
    }
    // Place was never validated, which is how the hardcoded default silently
    // produced charts for the wrong city. The chart is meaningless without it.
    if (!coordinates) {
      Alert.alert(t('common.error'), t('kundali.enterPlaceOfBirth'));
      return;
    }

    try {
      setLoading(true);
      const url = `${FREE_SERVICES_URL}/api/free-services/janam-kundali?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&ayanamsa=1&language=${apiLanguage}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datetime: dateOfBirth.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch kundali data');
      }

      const data = await response.json();

      navigation.navigate('Kundali Details', { kundaliData: data.data , name});
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('login.somethingWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.main}>
      <View style={styles.formContainer}>
        <View style={styles.titleView}>
          <Image
            source={{
              uri: 'https://cdn-icons-png.flaticon.com/128/9085/9085836.png',
            }}
            style={styles.icon}
          />
          <Text style={styles.title}>{t('kundali.enterDetails')}</Text>
        </View>

        <View style={styles.profileView}>
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
            placeholder={t('kundali.enterFullName')}
            placeholderTextColor="#000"
            style={styles.input}
            value={name}
            onChangeText={setName}
          />

          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={genderOptions}
              labelField="label"
              valueField="value"
              placeholder={t('kundali.selectGender')}
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={styles.selectedItemText}
              value={gender}
              onChange={item => {
                setGender(item.value);
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
              renderItem={item => (
                <View style={styles.item}>
                  <Text style={styles.itemText}>{item.label}</Text>
                </View>
              )}
            />
          </View>

          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dropdownText}>
              {dateOfBirth
                ? dateOfBirth.toLocaleDateString()
                : t('kundali.selectDob')}
            </Text>
            <Ionicons name="calendar" color={COLORS.orange} size={25} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.input,
              {backgroundColor: dontKnowTime ? COLORS.AntiFlash : 'white'},
            ]}
            onPress={() => !dontKnowTime && setShowTimePicker(true)}
            disabled={dontKnowTime}>
            <Text style={styles.dropdownText}>
              {timeOfBirth
                ? timeOfBirth.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : t('kundali.selectTob')}
            </Text>
            <Ionicons name="alarm-outline" color={COLORS.orange} size={25} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={handleCheckboxChange}>
            <Ionicons
              name={dontKnowTime ? 'checkbox-outline' : 'square-outline'}
              size={20}
              color="red"
            />
            <Text style={styles.label}>{t('kundali.dontKnow')}</Text>
          </TouchableOpacity>

          {/* The old Google version also crashed outright on a missing `details`
              object — `details.geometry` with no optional chaining — on top of
              never resolving at all once billing lapsed. */}
          <PlaceAutocomplete
            key={placeFieldKey}
            initialValue={place}
            placeholder={t('kundali.enterPlaceOfBirth')}
            onSelect={(picked) => {
              if (!picked) {
                setCoordinates(null);
                return;
              }
              setCoordinates({
                latitude: picked.latitude,
                longitude: picked.longitude,
              });
            }}
          />
        </View>

        <TouchableOpacity
          onPress={handleShowKundali}
          style={[styles.Button, loading && styles.disabledButton]}
          disabled={loading}>
          <Text style={styles.ButtonText}>
            {loading ? t('panchang.loading') : t('kundali.showKundali')}
          </Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={dateOfBirth || new Date()}
          mode="date"
          display="default"
          onChange={onChangeDate}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={timeOfBirth || new Date()}
          mode="time"
          display="default"
          onChange={onChangeTime}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  main: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
  },
  titleView: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  icon: {
    width: scale(30),
    height: verticalScale(30),
  },
  title: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    marginLeft: scale(10),
    color: '#000',
  },
  useProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
    paddingVertical: verticalScale(7), paddingHorizontal: scale(12), marginBottom: verticalScale(12),
    borderRadius: moderateScale(20), borderWidth: 1, borderColor: COLORS.AstroMaroon, backgroundColor: '#FDF3EE',
  },
  useProfileBtnText: {fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginLeft: scale(6)},
  formContainer: {
    padding: scale(15),
  },
  profileView: {
    paddingTop: verticalScale(10),
  },
  selectedItemText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  input: {
    flexDirection: 'row',
    height: verticalScale(50),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    fontFamily: 'Lato-Regular',
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
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
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  dropdown: {
    width: '100%',
    height: verticalScale(50),
  },
  item: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
  },
  itemText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  Button: {
    height: verticalScale(45),
    marginVertical: verticalScale(5),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.AstroGold,
  },
  ButtonText: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: verticalScale(12),
  },
  label: {
    marginLeft: scale(8),
    fontSize: moderateScale(13),
    color: COLORS.black,
  },
});

export default JanamKundaliScreen;