import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import React, { useContext, useState } from 'react';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { Dropdown } from 'react-native-element-dropdown';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';

const SupportScreen = () => {
  const { t } = useContext(LanguageContext);
  const Issues = [
    {
      label: t('support.issueTechnical'),
      value: 'Technical Issue',
    },
    { label: t('support.issueAccount'), value: 'Account Related Issue' },
    { label: t('support.issueRefund'), value: 'Refund Request' },
    { label: t('support.issueOther'), value: 'Other' },
    { label: t('support.issueFeedback'), value: 'Feedback' },
  ];

  const [issue, setIssue] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState('')

  const handleSubmit = async () => {
    if (!name || !email || !issue || !message) {
      Alert.alert(t('support.fillAllFields'));
      return;
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        throw new Error('Token not found');
      }

      const response = await Instance.post(
        '/api/support/create-support',
        {
          name: name,
          email: email,
          issueType: issue,
          message: message,
          mobile: mobile,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      console.log('data', response.data);
      setName('');
      setEmail('');
      setIssue(null);
      setMessage('');
      setMobile('');

      Alert.alert(t('support.submittedSuccess'));
    } catch (err) {
      console.log(err.message);
      Alert.alert(t('common.errorPrefix'), err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>{t('support.title')}</Text>
        <Text style={styles.subtitle}>
          {t('support.subtitle')}
        </Text>

        <TextInput
          placeholder={t('support.enterName')}
          placeholderTextColor={COLORS.gray}
          style={styles.input}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          placeholder={t('support.email')}
          placeholderTextColor={COLORS.gray}
          keyboardType="email-address"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder={t('support.mobileNumber')}
          placeholderTextColor={COLORS.gray}
          keyboardType="number-pad"
          style={styles.input}
          value={mobile}
          onChangeText={setMobile}
        />
        <View style={styles.dropdownContainer}>
          <Dropdown
            style={styles.dropdown}
            data={Issues}
            labelField="label"
            valueField="value"
            placeholder={t('support.selectIssue')}
            placeholderStyle={styles.dropdownText}
            selectedTextStyle={styles.selectedItemText} // Style for selected item
            value={issue}
            onChange={item => {
              setIssue(item.value);
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
            )} // Style for dropdown items
          />
        </View>
        <TextInput
          placeholder={t('support.writeMessage')}
          placeholderTextColor={COLORS.gray}
          keyboardType="default"
          style={styles.messagebox}
          multiline={true}
          value={message}
          onChangeText={setMessage}
        />

        <TouchableOpacity onPress={handleSubmit} style={styles.submitBtn}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnTxt}>{t('support.submit')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SupportScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.AstroSoftOrange,
    padding: scale(15),
  },
  title: {
    fontSize: moderateScale(17),
    color: '#000',
    paddingVertical: scale(5),
    fontFamily: 'Lato-Bold',
  },
  subtitle: {
    fontSize: moderateScale(14),
    color: '#000',
    marginBottom: verticalScale(15),
    fontFamily: 'Lato-Regular',
  },
  input: {
    flexDirection: 'row',
    height: verticalScale(45),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
    fontFamily: 'Lato-Regular',
    color: '#000',
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
    height: verticalScale(45),
  },
  dropdownText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: COLORS.gray,
  },
  selectedItemText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
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
  messagebox: {
    height: verticalScale(190),
    paddingHorizontal: scale(10),
    marginBottom: verticalScale(10),
    fontSize: moderateScale(14),
    color: '#000',
    fontFamily: 'Lato-Regular',
    textAlignVertical: 'top',
    borderRadius: moderateScale(8),
    borderWidth: verticalScale(1),
    backgroundColor: COLORS.white,
    borderColor: COLORS.AshGray,
  },
  submitBtn: {
    backgroundColor: COLORS.AstroGold,
    paddingVertical: verticalScale(10),
    alignSelf: 'center',
    width: '100%',
    borderRadius: moderateScale(25),
    marginVertical: verticalScale(17),
  },
  submitBtnTxt: {
    color: '#000',
    textAlign: 'center',
    fontFamily: 'Lato-Regular',
  },
  form: {
    padding: scale(15),
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(10),
    elevation: 4,
    // iOS ignores `elevation` — without these the support form sits flat on
    // the page with no card edge.
    shadowColor: '#4a2412',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
});
