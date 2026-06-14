import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import CheckBox from '@react-native-community/checkbox';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Settings({navigation}) {
  // const {data} = route.params;
  const [modalVisible, setModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  const toggleLanguage = language => {
    setSelectedLanguage(language);
    setModalVisible(false);
  };

  const handleDeleteAccount = () => {
    setDeleteModalVisible(false);
    Alert.alert('Account deleted successfully');
  };
  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('token');

      // Resetting any navigation state or redirection
      navigation.reset({
        index: 0,
        routes: [{name: 'Login'}],
      });

      setLogoutModalVisible(false);

      Alert.alert('Logged out successfully');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {/* <TouchableOpacity
          style={styles.item}
          onPress={() => setModalVisible(true)}>
          <View style={styles.itemContent}>
            <Icon
              name="language"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Select Language</Text>
          </View>
          <View style={styles.languageRight}>
            <Text style={styles.language}>{selectedLanguage}</Text>
            <Icon name="keyboard-arrow-right" size={25} color="#000" />
          </View>
        </TouchableOpacity> */}

        <TouchableOpacity
          onPress={() => navigation.navigate('AboutUsScreen')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="info"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>About Us</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('FaqScreen')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="help-outline"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>FAQ's</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity>

        {/* <TouchableOpacity
          onPress={() => navigation.navigate('SupportScreen')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="support-agent"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Support</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity> */}

        <TouchableOpacity
          onPress={() => navigation.navigate('RefundAndCancel')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="attach-money"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Refund & Cancellation</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('PrivacyPolicy')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="privacy-tip"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Privacy Policy</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('TermsOfUse')}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="gavel"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Terms of Use</Text>
          </View>
          <Icon name="keyboard-arrow-right" size={25} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.item}
          onPress={() => setLogoutModalVisible(true)}>
          <View style={styles.itemContent}>
            <Icon
              name="logout"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>Logout</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, styles.delete]}
          onPress={() => setDeleteModalVisible(true)}>
          <View style={styles.itemContent}>
            <Icon name="delete" size={25} color="red" style={styles.icon} />
            <Text style={[styles.text, styles.deleteText]}>
              Delete my account
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Language</Text>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => toggleLanguage('English')}>
              <Text style={styles.languageSelect}>English</Text>
              <CheckBox
                value={selectedLanguage === 'English'}
                onValueChange={() => toggleLanguage('English')}
                tintColors={{true: COLORS.AstroMaroon, false: '#000000'}}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => toggleLanguage('Hindi')}>
              <Text style={styles.languageSelect}>Hindi</Text>
              <CheckBox
                value={selectedLanguage === 'Hindi'}
                onValueChange={() => toggleLanguage('Hindi')}
                tintColors={{true: COLORS.AstroMaroon, false: '#000000'}}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        transparent={true}
        visible={logoutModalVisible}
        onRequestClose={() => setLogoutModalVisible(false)}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to log out?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setLogoutModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleLogout}>
                <Text style={styles.confirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Delete</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to delete your account? Once deleted, all
              your saved history will be lost. Do you still wish to continue?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleDeleteAccount}>
                <Text style={styles.confirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: scale(10),
  },
  item: {
    paddingVertical: verticalScale(13),
    borderBottomWidth: verticalScale(1),
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(5),
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: scale(10),
  },
  text: {
    fontSize: moderateScale(15),
    color: '#000',
    fontFamily: 'Lato-Regular',
  },
  languageRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  language: {
    fontSize: moderateScale(13),
    color: '#888',
    fontFamily: 'Lato-Regular',
    marginRight: scale(5),
  },
  deleteText: {
    color: 'red',
  },
  delete: {
    borderBottomWidth: 0,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    padding: scale(20),
    borderRadius: scale(10),
  },
  modalTitle: {
    fontSize: moderateScale(18),
    color: '#000',
    fontFamily: 'Lato-Bold',
    marginBottom: verticalScale(10),
  },
  modalMessage: {
    fontSize: moderateScale(15),
    fontFamily: 'Lato-Regular',
    color: '#000',
    marginBottom: verticalScale(20),
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    backgroundColor: '#ddd',
    borderRadius: scale(5),
  },
  cancelText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  confirmButton: {
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(20),
    backgroundColor: 'red',
    borderRadius: scale(5),
  },
  confirmText: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#fff',
  },
  languageOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: verticalScale(10),
  },
  languageSelect: {
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
    color: '#000',
  },
  scrollContainer: {
    backgroundColor: COLORS.white,
    elevation: 3,
    padding: scale(10),
    borderRadius: moderateScale(10),
  },
});
