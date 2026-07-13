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
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LanguageContext} from '../../context/LanguageContext';

export default function Settings({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const handleDeleteAccount = () => {
    setDeleteModalVisible(false);
    Alert.alert(t('settings.accountDeleted'));
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

      Alert.alert(t('settings.loggedOut'));
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
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
            <Text style={styles.text}>{t('settings.aboutUs')}</Text>
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
            <Text style={styles.text}>{t('settings.faqs')}</Text>
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
            <Text style={styles.text}>{t('settings.refundCancellation')}</Text>
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
            <Text style={styles.text}>{t('settings.privacyPolicy')}</Text>
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
            <Text style={styles.text}>{t('settings.termsOfUse')}</Text>
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
            <Text style={styles.text}>{t('drawer.logout')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.item, styles.delete]}
          onPress={() => setDeleteModalVisible(true)}>
          <View style={styles.itemContent}>
            <Icon name="delete" size={25} color="red" style={styles.icon} />
            <Text style={[styles.text, styles.deleteText]}>
              {t('settings.deleteAccount')}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        transparent={true}
        visible={logoutModalVisible}
        onRequestClose={() => setLogoutModalVisible(false)}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('settings.confirmLogoutTitle')}</Text>
            <Text style={styles.modalMessage}>
              {t('settings.confirmLogoutMsg')}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setLogoutModalVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleLogout}>
                <Text style={styles.confirmText}>{t('drawer.logout')}</Text>
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
            <Text style={styles.modalTitle}>{t('settings.confirmDeleteTitle')}</Text>
            <Text style={styles.modalMessage}>
              {t('settings.confirmDeleteMsg')}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleDeleteAccount}>
                <Text style={styles.confirmText}>{t('settings.deleteBtn')}</Text>
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
