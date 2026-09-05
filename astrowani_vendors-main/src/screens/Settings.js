import React, {useContext, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';
import {COLORS} from '../Theme/Colors';
import {LanguageContext} from '../context/LanguageContext';
import {getDeletePreview, deleteAccount} from '../api/AccountApi';
import {captureEvent, resetAnalyticsIdentity} from '../utils/Analytics';

const SETTINGS_SCREENS = [];

const SETTINGS_LINKS = [
  {labelKey: 'settings.aboutUs', icon: 'info', url: 'https://astrowani.com/about-us/'},
  {labelKey: 'settings.faq', icon: 'help-outline', url: 'https://astrowani.com/faq/'},
  {labelKey: 'settings.refundCancellation', icon: 'attach-money', url: 'https://astrowani.com/refund_cancellation/'},
  {labelKey: 'settings.privacyPolicy', icon: 'privacy-tip', url: 'https://astrowani.com/privacy-policy/'},
  {labelKey: 'settings.termsConditions', icon: 'gavel', url: 'https://astrowani.com/term_conditions/'},
  {labelKey: 'settings.safetyGuidelines', icon: 'verified-user', url: 'https://astrowani.com/safety-guidelines/'},
  {labelKey: 'settings.childSafety', icon: 'shield', url: 'https://astrowani.com/child-safety/'},
];

export default function Settings({navigation}) {
  const {t} = useContext(LanguageContext);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // What deletion will actually cost, fetched when the modal opens. `null` = still
  // loading; the confirm button stays disabled until it arrives, so nobody can delete
  // an account without having been shown the earnings they are giving up.
  const [deletePreview, setDeletePreview] = useState(null);

  const openLink = async url => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Unable to open link', 'Please check your internet connection and try again.');
    }
  };

  const openDeleteModal = async () => {
    captureEvent('account_delete_tapped');
    setDeletePreview(null);
    setDeleteModalVisible(true);
    try {
      setDeletePreview(await getDeletePreview());
    } catch (_) {
      // Deliberately not an alert: a failed preview must not read as a failed
      // deletion. It only has to stop somebody tapping Delete on an unknown state —
      // the modal shows the error and the confirm button stays disabled.
      setDeletePreview({error: true});
    }
  };

  /**
   * Actually delete the account.
   *
   * Waits on a real server response and only clears the local session once the backend
   * has confirmed, so a failure surfaces as a failure rather than a false reassurance.
   */
  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteAccount();
      // Captured BEFORE resetAnalyticsIdentity(), or it would be attributed to a fresh
      // anonymous id instead of the account that just left — same ordering rule as the
      // logout event in CustomDrawer.js.
      captureEvent('account_deleted', {mode: result?.mode || 'unknown'});

      // The account is already gone server-side, so the local session must go too, and
      // the app has to land somewhere that will not try to load data for an astrologer
      // who no longer exists. AsyncStorage.clear() (rather than removing just the
      // token) matches the logout path — astroId, fcmToken and the cached profile are
      // all stale now.
      resetAnalyticsIdentity();
      await AsyncStorage.clear();
      setDeleteModalVisible(false);
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
      Alert.alert(t('settings.accountDeleted'));
    } catch (err) {
      captureEvent('account_delete_failed', {reason: err?.code || 'error'});
      const blockedMessage =
        err?.code === 'ACTIVE_SESSION'
          ? t('settings.deleteBlockedSession')
          : err?.code === 'PENDING_WITHDRAWAL'
          ? t('settings.deleteBlockedWithdrawal')
          : null;
      Alert.alert(
        t('settings.deleteFailedTitle'),
        blockedMessage || err?.message || t('settings.deleteFailedMsg'),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {SETTINGS_SCREENS.map(item => (
          <TouchableOpacity
            key={item.labelKey}
            style={styles.item}
            onPress={() => navigation.navigate(item.screen)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{t(item.labelKey)}</Text>
            </View>
            <Icon name="keyboard-arrow-right" size={25} color="#888" />
          </TouchableOpacity>
        ))}
        {SETTINGS_LINKS.map(item => (
          <TouchableOpacity
            key={item.labelKey}
            style={styles.item}
            onPress={() => openLink(item.url)}>
            <View style={styles.itemContent}>
              <Icon name={item.icon} size={25} color={COLORS.AstroMaroon} style={styles.icon} />
              <Text style={styles.text}>{t(item.labelKey)}</Text>
            </View>
            <Icon name="open-in-new" size={20} color="#888" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[styles.item, styles.delete]} onPress={openDeleteModal}>
          <View style={styles.itemContent}>
            <Icon name="delete" size={25} color="red" style={styles.icon} />
            <Text style={[styles.text, styles.deleteText]}>{t('settings.deleteAccount')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => (deleting ? null : setDeleteModalVisible(false))}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('settings.confirmDeleteTitle')}</Text>
            <Text style={styles.modalMessage}>{t('settings.confirmDeleteMsg')}</Text>

            {/* Everything below states a real consequence. The confirm button stays
                disabled until the preview lands, so the earnings warning can never be
                missed by someone tapping through quickly. */}
            {deletePreview === null && (
              <View style={styles.deleteInfoRow}>
                <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
                <Text style={styles.deleteInfoText}>{t('settings.deleteChecking')}</Text>
              </View>
            )}

            {deletePreview?.error && (
              <Text style={styles.deleteWarnText}>{t('settings.deletePreviewFailed')}</Text>
            )}

            {deletePreview?.blockedReason === 'ACTIVE_SESSION' && (
              <Text style={styles.deleteWarnText}>{t('settings.deleteBlockedSession')}</Text>
            )}

            {deletePreview?.blockedReason === 'PENDING_WITHDRAWAL' && (
              <Text style={styles.deleteWarnText}>{t('settings.deleteBlockedWithdrawal')}</Text>
            )}

            {deletePreview?.canDelete && deletePreview.walletBalance > 0 && (
              <Text style={styles.deleteWarnText}>
                {t('settings.deleteBalanceWarning').replace(
                  '{{amount}}',
                  String(deletePreview.walletBalance),
                )}
              </Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                disabled={deleting}
                onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!deletePreview?.canDelete || deleting) && styles.confirmButtonDisabled,
                ]}
                disabled={!deletePreview?.canDelete || deleting}
                onPress={handleDeleteAccount}>
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmText}>{t('settings.deleteBtn')}</Text>
                )}
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
  scrollContainer: {
    backgroundColor: COLORS.white,
    elevation: 3,
    padding: scale(10),
    borderRadius: moderateScale(10),
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
  delete: {
    borderBottomWidth: 0,
    marginTop: verticalScale(6),
  },
  deleteText: {
    color: 'red',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(20),
  },
  modalTitle: {
    fontSize: moderateScale(17),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: verticalScale(8),
    fontFamily: 'Lato-Regular',
  },
  modalMessage: {
    fontSize: moderateScale(14),
    color: '#444',
    marginBottom: verticalScale(10),
    fontFamily: 'Lato-Regular',
  },
  deleteInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  deleteInfoText: {
    marginLeft: scale(8),
    fontSize: moderateScale(13),
    color: '#666',
    fontFamily: 'Lato-Regular',
  },
  deleteWarnText: {
    fontSize: moderateScale(13),
    color: '#C0392B',
    marginBottom: verticalScale(8),
    fontFamily: 'Lato-Regular',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: verticalScale(10),
  },
  cancelButton: {
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(18),
    marginRight: scale(10),
  },
  cancelText: {
    color: '#555',
    fontSize: moderateScale(14),
    fontFamily: 'Lato-Regular',
  },
  confirmButton: {
    backgroundColor: '#C0392B',
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(18),
    borderRadius: moderateScale(6),
    minWidth: scale(90),
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#d9a49e',
  },
  confirmText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: 'bold',
    fontFamily: 'Lato-Regular',
  },
});
