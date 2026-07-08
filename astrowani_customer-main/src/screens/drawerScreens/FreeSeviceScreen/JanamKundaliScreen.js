import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  Alert,
} from 'react-native';
import React, {useState} from 'react';
import {moderateScale, scale, verticalScale} from '../../../utils/Scaling';
import {COLORS} from '../../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {Dropdown} from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import Geocoder from 'react-native-geocoding';

Geocoder.init("AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA");

const JanamKundaliScreen = ({navigation}) => {
  const [gender, setGender] = useState(null);
  const [name, setName] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [timeOfBirth, setTimeOfBirth] = useState(null);
  const [dontKnowTime, setDontKnowTime] = useState(false);
  const [coordinates, setCoordinates] = useState({
    latitude: 10.214747,
    longitude: 78.097626
  });
  const [loading, setLoading] = useState(false);

  const handleCheckboxChange = () => {
    setDontKnowTime(!dontKnowTime);
    if (!dontKnowTime) {
      setTimeOfBirth(null);
    }
  };

  const genderOptions = [
    {label: 'Male', value: 'male'},
    {label: 'Female', value: 'female'},
    {label: 'Other', value: 'other'},
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
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!gender) {
      Alert.alert('Error', 'Please select your gender');
      return;
    }
    if (!dateOfBirth) {
      Alert.alert('Error', 'Please select your date of birth');
      return;
    }
    if (!dontKnowTime && !timeOfBirth) {
      Alert.alert('Error', 'Please select your time of birth or check "I don\'t know"');
      return;
    }

    try {
      setLoading(true);
      const url = `https://astrowani-fb6pi.ondigitalocean.app/api/free-services/janam-kundali?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&ayanamsa=1&language=en`;
      
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

      console.log("datata is", data)
      navigation.navigate('Kundali Details', { kundaliData: data.data , name});
    } catch (error) {
      Alert.alert('Error', error.message || 'Something went wrong');
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
          <Text style={styles.title}>Enter Your Details</Text>
        </View>

        <View style={styles.profileView}>
          <TextInput
            placeholder="Enter full Name"
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
              placeholder="Select Gender"
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
                : 'Select Date of Birth'}
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
                : 'Select Time of Birth'}
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
            <Text style={styles.label}>I don't know</Text>
          </TouchableOpacity>

          <GooglePlacesAutocomplete
            placeholder="Enter Place of Birth"
            onPress={(data, details = null) => {
              const { lat, lng } = details.geometry.location;
              setCoordinates({
                latitude: lat,
                longitude: lng
              });
            }}
            query={{
              key: 'AIzaSyD9gQiOP8vVtzDFjLjF59SL2MlcHXhjAsA',
              language: 'en',
            }}
            styles={{
              container: {
                flex: 0,
                marginBottom: verticalScale(10),
              },
              textInput: styles.input,
              listView: {
                backgroundColor: 'white',
                borderRadius: moderateScale(5),
                position: 'absolute',
                top: Platform.select({ ios: verticalScale(45), android: verticalScale(45) }),
                left: 0,
                right: 0,
                zIndex: 1000,
                elevation: 3,
              },
            }}
            enablePoweredByContainer={false}
            fetchDetails={true}
          />
        </View>

        <TouchableOpacity
          onPress={handleShowKundali}
          style={[styles.Button, loading && styles.disabledButton]}
          disabled={loading}>
          <Text style={styles.ButtonText}>
            {loading ? 'Loading...' : 'Show Kundali'}
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