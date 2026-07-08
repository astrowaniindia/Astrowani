import React, { useState } from 'react';
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
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Dropdown } from 'react-native-element-dropdown';
import DateTimePicker from '@react-native-community/datetimepicker';

const ChatIntakeForm = ({ navigation, route }) => {
  const [gender, setGender] = useState(null);
  const [partnergender, setPartnerGender] = useState(null);

  const [married, setMarried] = useState(null);
  const [concern, setConcern] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState(null);
  const [timeOfBirth, setTimeOfBirth] = useState(null);
  const [dontKnowTime, setDontKnowTime] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const { person } = route.params;

  const handleCheckboxChange = () => {
    setDontKnowTime(!dontKnowTime);
    if (!dontKnowTime) {
      setTimeOfBirth(null);
    }
  };
  const handlePartnerSelect = () => {
    setShowPartner(!showPartner);
  };

  const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];
  const MarriedOptions = [
    { label: 'Married', value: 'married' },
    { label: 'Unmarried', value: 'unmarried' },
  ];
  const Concerns = [
    {
      label: 'Select Concern',
      value: 'select concern',
    },
    { label: 'Career and Buisness', value: 'career and buisness' },
    { label: 'Career and Buisness', value: 'career and buisness' },
    { label: 'Career and Buisness', value: 'career and buisness' },
    { label: 'Career and Buisness', value: 'career and buisness' },
    { label: 'Career and Buisness', value: 'career and buisness' },
    { label: 'Career and Buisness', value: 'career and buisness' },
  ];

  const onChangeDate = (event, selectedDate) => {
    const currentDate = selectedDate || dateOfBirth;
    setShowDatePicker(Platform.OS === 'ios');
    setDateOfBirth(currentDate);
  };

  const onChangeTime = (event, selectedTime) => {
    const currentTime = selectedTime || timeOfBirth;
    setShowTimePicker(Platform.OS === 'ios');
    setTimeOfBirth(currentTime);
  };
  const handleStartChat = () => {
    setModalVisible(true);
  };

  const handleChat = () => {
    setModalVisible(false);
    navigation.navigate('PersonToPersonChat', { person: person });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollContainer}>
        <View style={styles.profileView}>
          <TextInput
            placeholder="Mukesh kumar"
            placeholderTextColor="#000"
            style={styles.input}
          />
          <TextInput
            placeholder="Enter Last Name (Optional)"
            placeholderTextColor="#000"
            style={styles.input}
          />
          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={genderOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Gender"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={{ color: '#000', fontSize: moderateScale(14) }}
              containerStyle={styles.dropdownContainerStyle}
              itemTextStyle={styles.dropdownItemText}
              activeColor="#f0f0f0"
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
            />
          </View>

          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={MarriedOptions}
              labelField="label"
              valueField="value"
              placeholder="Select Martial Status"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={{ color: '#000', fontSize: moderateScale(14) }}
              containerStyle={styles.dropdownContainerStyle}
              itemTextStyle={styles.dropdownItemText}
              activeColor="#f0f0f0"
              value={married}
              onChange={item => {
                setMarried(item.value);
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
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
              { backgroundColor: dontKnowTime ? COLORS.AntiFlash : 'white' },
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

          <TextInput
            placeholder="Enter Place of Birth"
            placeholderTextColor="#000"
            style={styles.input}
          />

          <View style={styles.dropdownContainer}>
            <Dropdown
              style={styles.dropdown}
              data={Concerns}
              labelField="label"
              valueField="value"
              placeholder="Select  Concerns"
              placeholderStyle={styles.dropdownText}
              selectedTextStyle={{ color: '#000', fontSize: moderateScale(14) }}
              containerStyle={styles.dropdownContainerStyle}
              itemTextStyle={styles.dropdownItemText}
              activeColor="#f0f0f0"
              value={concern}
              onChange={item => {
                setConcern(item.value);
              }}
              renderRightIcon={() => (
                <Ionicons
                  name="chevron-down-outline"
                  color={COLORS.orange}
                  size={24}
                />
              )}
            />
          </View>

          <TouchableOpacity
            style={styles.partnercheckboxContainer}
            onPress={handlePartnerSelect}>
            <Ionicons
              name={showPartner ? 'checkbox-outline' : 'square-outline'}
              size={22}
              color="black"
            />
            <Text style={styles.partnersLabel}>Enter Partner's Details</Text>
          </TouchableOpacity>

          {showPartner && (
            <View style={styles.partnerView}>
              <TextInput
                placeholder="Enter First Name"
                placeholderTextColor="#000"
                style={styles.input}
              />
              <TextInput
                placeholder="Enter Last Name (Optional)"
                placeholderTextColor="#000"
                style={styles.input}
              />
              <View style={styles.dropdownContainer}>
                <Dropdown
                  style={styles.dropdown}
                  data={genderOptions}
                  labelField="label"
                  valueField="value"
                  placeholder="Select Gender"
                  placeholderStyle={styles.dropdownText}
                  selectedTextStyle={{ color: '#000', fontSize: moderateScale(14) }}
                  containerStyle={styles.dropdownContainerStyle}
                  itemTextStyle={styles.dropdownItemText}
                  activeColor="#f0f0f0"
                  value={partnergender}
                  onChange={item => {
                    setPartnerGender(item.value);
                  }}
                  renderRightIcon={() => (
                    <Ionicons
                      name="chevron-down-outline"
                      color={COLORS.orange}
                      size={24}
                    />
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
                  { backgroundColor: dontKnowTime ? COLORS.AntiFlash : 'white' },
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
                <Ionicons
                  name="alarm-outline"
                  color={COLORS.orange}
                  size={25}
                />
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

              <TextInput
                placeholder="Enter Place of Birth"
                placeholderTextColor="#000"
                style={styles.input}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity onPress={handleStartChat} style={styles.chatButton}>
        <Text style={styles.chatButtonText}>Start Chat</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.title}>You're Ready To Connect!</Text>

            <Text style={styles.subtitle}>
              You are almost there and about to connect with
              <Text style={styles.bold}> Expert</Text> in few seconds.
            </Text>

            <TouchableOpacity style={styles.okButton} onPress={handleChat}>
              <Text style={styles.okButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  container: {
    flex: 1,
    paddingHorizontal: scale(10),
    paddingTop: verticalScale(3),
    backgroundColor: COLORS.AstroSoftOrange,
  },
  tabsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    paddingHorizontal: scale(15),
    paddingVertical: verticalScale(5),
    borderBottomWidth: verticalScale(1),
    borderBottomColor: COLORS.AshGray,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    marginVertical: verticalScale(2),
    paddingVertical: verticalScale(8),
  },
  activeTab: {
    borderWidth: verticalScale(0.5),
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(25),
    backgroundColor: 'white',
  },
  tabTextActive: {
    color: COLORS.orange,
    fontSize: moderateScale(14),
    fontWeight: 'bold',
  },
  tabTextInactive: {
    color: COLORS.black,
    fontWeight: 'bold',
    fontSize: moderateScale(14),
  },
  scrollContainer: {
    flex: 1,
  },
  profileView: {
    paddingHorizontal: scale(5),
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
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
    color: '#000',
  },
  dropdownText: {
    fontSize: moderateScale(14),
    color: COLORS.AstroMaroon,
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
    height: verticalScale(55),
  },
  dropdownContainerStyle: {
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: COLORS.AstroMaroon || 'maroon',
    borderWidth: 1,
  },
  dropdownItemText: {
    fontSize: moderateScale(14),
    color: '#000',
  },
  chatButton: {
    height: verticalScale(45),
    marginVertical: verticalScale(5),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: moderateScale(8),
    backgroundColor: COLORS.AstroGold,
  },
  chatButtonText: {
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
    bottom: 0,
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
  title: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    marginBottom: verticalScale(15),
    color: '#000',
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
});

export default ChatIntakeForm;
