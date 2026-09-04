import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import React, {useState} from 'react';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '../../../components/ThemedDateTimePicker';
import PlaceAutocomplete, {geocodePlace} from '../../../components/PlaceAutocomplete';
import axios from 'axios';
import { FREE_SERVICES_URL } from '../../../config/api';
import { LanguageContext } from '../../../context/LanguageContext';
import { useFreeServiceLanguage } from '../../../components/astro/ReportLanguage';
import useSavedProfile from '../../../hooks/useSavedProfile';
import {showStatusPopup} from '../../../components/StatusPopup';
import { captureEvent } from '../../../utils/Analytics';

function parseTimeString(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':');
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}


const KundaliMatchScreen = ({navigation}) => {
  const { apiLanguage } = useFreeServiceLanguage(navigation);
  const { t } = React.useContext(LanguageContext);
  const [boygender, setBoyGender] = useState(null);
  const [girlgender, setGirlGender] = useState(null);
  const [boyName, setBoyName] = useState('');
  const [girlName, setGirlName] = useState('');

  const [showboyDatePicker, setShowBoyDatePicker] = useState(false);
  const [showgirlDatePicker, setShowGirlDatePicker] = useState(false);

  const [showboyTimePicker, setShowBoyTimePicker] = useState(false);
  const [showgirlTimePicker, setShowGirlTimePicker] = useState(false);

  const [girldateOfBirth, setGirlDateOfBirth] = useState(null);
  const [boydateOfBirth, setBoyDateOfBirth] = useState(null);

  const [girltimeOfBirth, setGirlTimeOfBirth] = useState(null);
  const [boytimeOfBirth, setBoyTimeOfBirth] = useState(null);

  const [boydontKnowTime, setBoyDontKnowTime] = useState(false);
  const [girldontKnowTime, setGirlDontKnowTime] = useState(false);

  const [boyBirthPlace, setBoyBirthPlace] = useState('');
  const [boyLatitude, setBoyLatitude] = useState(null);
  const [boyLongitude, setBoyLongitude] = useState(null);

  const [girlBirthPlace, setGirlBirthPlace] = useState('');
  const [girlLatitude, setGirlLatitude] = useState(null);
  const [girlLongitude, setGirlLongitude] = useState(null);

  // The Geocoder fallback that used to live here is gone with Google Places —
  // PlaceAutocomplete resolves coordinates as part of selection and reports its
  // own failures inline, so there is no separate fallback path to keep in sync.

  const [boyPlaceKey, setBoyPlaceKey] = useState(0);
  const [girlPlaceKey, setGirlPlaceKey] = useState(0);
  const {fetchProfile} = useSavedProfile();
  // Which side's "use my profile" fetch is in flight, if any — drives each
  // button's own spinner and disables both while either is running, without
  // making a tap on one side spin the other's button too.
  const [fillingWho, setFillingWho] = useState(null); // 'boy' | 'girl' | null

  // Shared by both sides — which setters to call is the only thing that
  // differs between "use my profile" on the boy's form vs the girl's.
  const applyProfileTo = async (who) => {
    setFillingWho(who);
    const isBoy = who === 'boy';
    const setName = isBoy ? setBoyName : setGirlName;
    const setGender = isBoy ? setBoyGender : setGirlGender;
    const setDob = isBoy ? setBoyDateOfBirth : setGirlDateOfBirth;
    const setTob = isBoy ? setBoyTimeOfBirth : setGirlTimeOfBirth;
    const setDontKnow = isBoy ? setBoyDontKnowTime : setGirlDontKnowTime;
    const setPlace = isBoy ? setBoyBirthPlace : setGirlBirthPlace;
    const setLat = isBoy ? setBoyLatitude : setGirlLatitude;
    const setLng = isBoy ? setBoyLongitude : setGirlLongitude;
    const setPlaceKey = isBoy ? setBoyPlaceKey : setGirlPlaceKey;

    try {
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
      if (profile.dob) setDob(new Date(profile.dob));
      if (profile.timeOfBirth) {
        setTob(parseTimeString(profile.timeOfBirth));
        setDontKnow(false);
      }

      let placeResolved = !profile.placeOfBirth;
      if (profile.placeOfBirth) {
        const geo = await geocodePlace(profile.placeOfBirth);
        if (geo) {
          setPlace(geo.label);
          setLat(geo.latitude);
          setLng(geo.longitude);
          setPlaceKey((k) => k + 1);
          placeResolved = true;
        } else {
          setPlace('');
          setLat(null);
          setLng(null);
        }
      }

      if (!placeResolved && profile.placeOfBirth) {
        showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profilePlaceNotFound')});
      } else if (!profile.name || !profile.gender || !profile.dob || !profile.timeOfBirth || !placeResolved) {
        showStatusPopup({variant: 'info', title: t('astro.useMyProfile'), message: t('astro.profileFilledPartial')});
      }
    } finally {
      setFillingWho(null);
    }
  };

  const handleboyCheckboxChange = () => {
    setBoyDontKnowTime(!boydontKnowTime);
    if (!boydontKnowTime) {
      setBoyTimeOfBirth(null);
    }
  };
  const handlegirlCheckboxChange = () => {
    setGirlDontKnowTime(!girldontKnowTime);
    if (!girldontKnowTime) {
      setGirlTimeOfBirth(null);
    }
  };

  const genderOptions = [
    {label: t('register.male'), value: 'male'},
    {label: t('register.female'), value: 'female'},
    {label: t('register.other'), value: 'other'},
  ];

  const onBoyChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || boydateOfBirth;
    setShowBoyDatePicker(false);
    setBoyDateOfBirth(currentDate);
  };

  const onGirlChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || girldateOfBirth;
    setShowGirlDatePicker(false);
    setGirlDateOfBirth(currentDate);
  };

  const onBoyChangeTime = (event, selectedTime) => {
    const currentTime = selectedTime || boytimeOfBirth;
    setShowBoyTimePicker(false);
    setBoyTimeOfBirth(currentTime);
  };
  const onGirlChangeTime = (event, selectedTime) => {
    const currentTime = selectedTime || girltimeOfBirth;
    setShowGirlTimePicker(false);
    setGirlTimeOfBirth(currentTime);
  };


  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const formatTime = (time) => {
    if (!time) return '';
    const t = new Date(time);
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  };

  const handleShowReport = async () => {
    if (!boydateOfBirth || !girldateOfBirth || !boyLatitude || !boyLongitude || !girlLatitude || !girlLongitude) {
      Alert.alert(t('match.fillAllFields'));
      return;
    }

    const requestBody = {
      maleDetails: {
        date: formatDate(boydateOfBirth),
        time: boydontKnowTime ? '00:00' : formatTime(boytimeOfBirth),
        location: {
          latitude: boyLatitude.toString(),
          longitude: boyLongitude.toString()
        }
      },
      femaleDetails: {
        date: formatDate(girldateOfBirth),
        time: girldontKnowTime ? '00:00' : formatTime(girltimeOfBirth),
        location: {
          latitude: girlLatitude.toString(),
          longitude: girlLongitude.toString()
        }
      }
    };

    try {
      const response = await axios.post(
        `${FREE_SERVICES_URL}/api/free-services/kundali-match?ayanamsa=1&language=${apiLanguage}`,
        requestBody
      );
      // Navigate to the report screen with the response data
      navigation.navigate('KundaliMatchingReport', {
        reportData: response.data,
        boyName: boyName,
        girlName: girlName
      });
    } catch (error) {
      console.error('Kundali match API error:', error);
      Alert.alert(t('match.errorFetching'));
    }
  };

  return (
    <View style={styles.main}>
      <ScrollView style={styles.formContainer}>
        <View style={styles.titleView}>
          <Image
            source={{
              uri: 'https://cdn-icons-png.flaticon.com/128/4663/4663642.png',
            }}
            style={styles.icon}
          />
          <Text style={styles.title}>{t('kundali.enterDetails')}</Text>
        </View>

        <View style={styles.boysView}>
          <MaterialIcons name="boy" color={COLORS.AstroMaroon} size={28} />
          <Text style={styles.boystext}>{t('match.boysDetails')}</Text>
        </View>

        <View style={styles.profileView}>
          <TouchableOpacity
            style={styles.useProfileBtn}
            activeOpacity={0.8}
            disabled={fillingWho !== null}
            onPress={() => { captureEvent('free_service_profile_autofilled', { service: 'kundali_match', side: 'boy' }); applyProfileTo('boy'); }}>
            {fillingWho === 'boy' ? (
              <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
            ) : (
              <Ionicons name="person-circle-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
            )}
            <Text style={styles.useProfileBtnText}>
              {fillingWho === 'boy' ? t('astro.fillingFromProfile') : t('astro.useMyProfile')}
            </Text>
          </TouchableOpacity>

          <TextInput
            placeholder={t('kundali.enterFullName')}
            placeholderTextColor="gray"
            style={styles.input}
            value={boyName}
            onChangeText={setBoyName}
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
              value={boygender}
              onChange={item => {
                setBoyGender(item.value);
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
            onPress={() => setShowBoyDatePicker(true)}>
            <Text style={styles.dropdownText}>
              {boydateOfBirth
                ? boydateOfBirth.toLocaleDateString()
                : t('kundali.selectDob')}
            </Text>
            <Ionicons name="calendar" color={COLORS.orange} size={25} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.input,
              {backgroundColor: boydontKnowTime ? COLORS.AntiFlash : 'white'},
            ]}
            onPress={() => !boydontKnowTime && setShowBoyTimePicker(true)}
            disabled={boydontKnowTime}>
            <Text style={styles.dropdownText}>
              {boytimeOfBirth
                ? boytimeOfBirth.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : t('kundali.selectTob')}
            </Text>
            <Ionicons name="alarm-outline" color={COLORS.orange} size={25} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={handleboyCheckboxChange}>
            <Ionicons
              name={boydontKnowTime ? 'checkbox-outline' : 'square-outline'}
              size={20}
              color="red"
            />
            <Text style={styles.label}>{t('kundali.dontKnow')}</Text>
          </TouchableOpacity>

          {/* <TextInput
            placeholder="Enter Place of Birth"
            placeholderTextColor="gray"
            style={styles.input}
          /> */}
            <PlaceAutocomplete
          key={boyPlaceKey}
          initialValue={boyBirthPlace}
          placeholder={t('match.enterBoyPlace')}
          onSelect={(picked) => {
            if (!picked) {
              setBoyBirthPlace('');
              setBoyLatitude(null);
              setBoyLongitude(null);
              return;
            }
            setBoyBirthPlace(picked.label);
            setBoyLatitude(picked.latitude);
            setBoyLongitude(picked.longitude);
          }}
        />
        </View>

        <View style={styles.boysView}>
          <MaterialIcons name="girl" color={COLORS.AstroMaroon} size={28} />
          <Text style={styles.boystext}>{t('match.girlsDetails')}</Text>
        </View>

        <View style={styles.profileView}>
          <TouchableOpacity
            style={styles.useProfileBtn}
            activeOpacity={0.8}
            disabled={fillingWho !== null}
            onPress={() => { captureEvent('free_service_profile_autofilled', { service: 'kundali_match', side: 'girl' }); applyProfileTo('girl'); }}>
            {fillingWho === 'girl' ? (
              <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
            ) : (
              <Ionicons name="person-circle-outline" size={moderateScale(18)} color={COLORS.AstroMaroon} />
            )}
            <Text style={styles.useProfileBtnText}>
              {fillingWho === 'girl' ? t('astro.fillingFromProfile') : t('astro.useMyProfile')}
            </Text>
          </TouchableOpacity>

          <TextInput
            placeholder={t('kundali.enterFullName')}
            placeholderTextColor="gray"
            style={styles.input}
            value={girlName}
            onChangeText={setGirlName}
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
              value={girlgender}
              onChange={item => {
                setGirlGender(item.value);
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
            onPress={() => setShowGirlDatePicker(true)}>
            <Text style={styles.dropdownText}>
              {girldateOfBirth
                ? girldateOfBirth.toLocaleDateString()
                : t('kundali.selectDob')}
            </Text>
            <Ionicons name="calendar" color={COLORS.orange} size={25} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.input,
              {backgroundColor: girldontKnowTime ? COLORS.AntiFlash : 'white'},
            ]}
            onPress={() => !girldontKnowTime && setShowGirlTimePicker(true)}
            disabled={girldontKnowTime}>
            <Text style={styles.dropdownText}>
              {girltimeOfBirth
                ? girltimeOfBirth.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : t('kundali.selectTob')}
            </Text>
            <Ionicons name="alarm-outline" color={COLORS.orange} size={25} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={handlegirlCheckboxChange}>
            <Ionicons
              name={girldontKnowTime ? 'checkbox-outline' : 'square-outline'}
              size={20}
              color="red"
            />
            <Text style={styles.label}>{t('kundali.dontKnow')}</Text>
          </TouchableOpacity>

          {/* <TextInput
            placeholder="Enter Place of Birth"
            placeholderTextColor="gray"
            style={styles.input}
          /> */}
            <PlaceAutocomplete
          key={girlPlaceKey}
          initialValue={girlBirthPlace}
          placeholder={t('match.enterGirlPlace')}
          onSelect={(picked) => {
            if (!picked) {
              setGirlBirthPlace('');
              setGirlLatitude(null);
              setGirlLongitude(null);
              return;
            }
            setGirlBirthPlace(picked.label);
            setGirlLatitude(picked.latitude);
            setGirlLongitude(picked.longitude);
          }}
        />

        </View>

        <TouchableOpacity
            onPress={() => { captureEvent('free_service_submitted', { service: 'kundali_match' }); handleShowReport(); }}
          style={styles.Button}>
          <Text style={styles.ButtonText}>{t('match.showReport')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {showboyDatePicker && (
        <DateTimePicker
          value={boydateOfBirth || new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onBoyChangeDate}
        />
      )}
      {showgirlDatePicker && (
        <DateTimePicker
          value={girldateOfBirth || new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onGirlChangeDate}
        />
      )}

      {showboyTimePicker && (
        <DateTimePicker
          value={boytimeOfBirth || new Date()}
          mode="time"
          display="default"
          onChange={onBoyChangeTime}
        />
      )}
      {showgirlTimePicker && (
        <DateTimePicker
          value={girltimeOfBirth || new Date()}
          mode="time"
          display="default"
          onChange={onGirlChangeTime}
        />
      )}
    </View>
  );
};

export default KundaliMatchScreen;

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
    width: scale(35),
    height: verticalScale(35),
  },
  title: {
    fontSize: moderateScale(18),
    fontFamily: 'Lato-Bold',
    marginLeft: scale(10),
    paddingTop: verticalScale(5),
    color: '#000',
  },
  formContainer: {
    padding: scale(15),
  },
  profileView: {
    paddingTop: verticalScale(10),
  },
  partnerView: {
    paddingTop: verticalScale(10),
  },

  input: {
    flexDirection: 'row',
    height: verticalScale(50),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    fontFamily: 'Lato-Regular',
    color: '#000',
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  dropdownText: {
    fontSize: moderateScale(14),
    color: COLORS.gray,
  },
  LastInput: {
    height: verticalScale(50),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(15),
    justifyContent: 'center',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
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
    color: '#000', // Black color for dropdown items
  },
  selectedItemText: {
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
    marginBottom: verticalScale(25),
  },
  ButtonText: {
    color: COLORS.black,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  changePictureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: scale(150),
    height: scale(150),
    borderRadius: moderateScale(75),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: moderateScale(1),
    borderColor: COLORS.white,
  },
  userIcon: {
    width: scale(150),
    height: scale(150),
    borderRadius: moderateScale(75),
  },
  editButton: {
    paddingVertical: verticalScale(5),
    position: 'absolute',
    paddingHorizontal: scale(20),
    borderRadius: moderateScale(15),
    backgroundColor: COLORS.AstroMaroon,
    right: scale(10),
    bottom: 0,
  },
  editButtonText: {
    fontSize: moderateScale(12),
    color: COLORS.white,
  },
  userName: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
    marginTop: verticalScale(5),
    color: COLORS.AstroMaroon,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: verticalScale(12),
  },
  partnercheckboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(12),
  },
  label: {
    marginLeft: scale(8),
    fontSize: moderateScale(13),
    color: COLORS.black,
  },
  partnersLabel: {
    marginLeft: scale(8),
    fontSize: moderateScale(14),
    color: COLORS.black,
    fontWeight: 'bold',
  },

  //modal
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: scale(310),
    backgroundColor: '#fff',
    borderRadius: moderateScale(10),
    padding: scale(20),
    alignItems: 'center',
  },

  subtitle: {
    textAlign: 'center',
    fontSize: moderateScale(13),
    marginBottom: verticalScale(20),
    color: '#000',
  },
  bold: {
    fontWeight: 'bold',
  },

  okButton: {
    backgroundColor: '#FFD700',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(40),
    borderRadius: moderateScale(25),
  },
  okButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#DBC2A9',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(5),
  },
  tab: {
    paddingHorizontal: scale(10),
    marginLeft: scale(5),
    paddingVertical: verticalScale(8),
  },
  tabText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: moderateScale(12),
    paddingHorizontal: scale(10),
  },
  activeTab: {
    marginLeft: scale(5),
    borderWidth: moderateScale(1),
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    backgroundColor: 'white',
  },
  activeTabText: {
    paddingHorizontal: scale(10),
    color: COLORS.AstroMaroon,
    fontWeight: 'bold',
    fontSize: moderateScale(12),
  },
  boysView: {
    flexDirection: 'row',
    padding: scale(10),
    backgroundColor: COLORS.lightTurquoise,
    alignItems: 'center',
    borderRadius: moderateScale(10),
    marginVertical: verticalScale(10),
  },
  boystext: {
    color: '#000',
    fontFamily: 'Lato-Bold',

    fontSize: moderateScale(16),
  },
  useProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
    paddingVertical: verticalScale(7), paddingHorizontal: scale(12), marginBottom: verticalScale(12),
    borderRadius: moderateScale(20), borderWidth: 1, borderColor: COLORS.AstroMaroon, backgroundColor: '#FDF3EE',
  },
  useProfileBtnText: {fontSize: moderateScale(12.5), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginLeft: scale(6)},
});
