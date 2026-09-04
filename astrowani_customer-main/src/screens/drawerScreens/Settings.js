import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../../Theme/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LanguageContext} from '../../context/LanguageContext';
import {resetWalletBalance} from '../../hooks/useWalletBalance';

// Moved to config/legal.js — the sign-up screen links the same Terms and Privacy
// pages for its acceptance checkbox, and a legal URL should exist in one place.
import {LEGAL_LINKS} from '../../config/legal';
import {useModalPresence} from '../../utils/modalPresentation';
import {captureEvent, resetAnalyticsIdentity} from '../../utils/Analytics';
import {getDeletePreview, deleteAccount} from '../../api/AccountApi';

export default function Settings({navigation}) {
  const {t} = React.useContext(LanguageContext);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  // What deletion will actually cost, fetched when the modal opens. `null` = still
  // loading; the confirm button stays disabled until it arrives, so nobody can delete
  // an account without first being shown the wallet balance they are forfeiting.
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Declares this modal to the presentation registry so root-level popups
  // wait for it instead of colliding with it on iOS (utils/modalPresentation).
  useModalPresence(logoutModalVisible || deleteModalVisible);

  const openDeleteModal = async () => {
    // The strongest churn signal the app can emit — recorded on the tap, so an
    // abandoned deletion still counts as intent to leave.
    captureEvent('account_delete_tapped');
    setDeletePreview(null);
    setDeleteModalVisible(true);
    try {
      setDeletePreview(await getDeletePreview());
    } catch (_) {
      // Could not reach the server. Leave the confirm button disabled rather than
      // letting somebody tap Delete on an unknown state — the modal shows the error.
      setDeletePreview({error: true});
    }
  };

  /**
   * Actually delete the account.
   *
   * This used to show "Account deleted successfully" and call nothing at all — no
   * deletion endpoint existed. It now waits on a real server response and only clears
   * the session once the backend has confirmed, so a failure surfaces as a failure
   * instead of a false reassurance.
   */
  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteAccount();
      // Captured BEFORE resetAnalyticsIdentity(), or it would be attributed to a fresh
      // anonymous id instead of the account that just left — same ordering rule as the
      // logout event in CustomDrawerContent.js.
      captureEvent('account_deleted', {mode: result?.mode || 'unknown'});

      // Order matters: the account is already gone server-side, so the local session
      // must go too, and the app must land somewhere that does not try to load data
      // for a customer who no longer exists.
      resetAnalyticsIdentity();
      resetWalletBalance();
      await AsyncStorage.removeItem('token');
      setDeleteModalVisible(false);
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
      Alert.alert(t('settings.accountDeleted'));
    } catch (err) {
      captureEvent('account_delete_failed', {reason: err?.code || 'error'});
      Alert.alert(
        t('settings.deleteFailedTitle'),
        err?.code === 'ACTIVE_SESSION'
          ? t('settings.deleteBlockedSession')
          : err?.message || t('settings.deleteFailedMsg'),
      );
    } finally {
      setDeleting(false);
    }
  };
  const handleLogout = async () => {
    try {
      captureEvent('logout', {source: 'settings'});
      resetWalletBalance();
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
          onPress={() => { captureEvent('settings_item_tapped', {item: 'about_us'}); navigation.navigate('AboutUsScreen'); }}
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
          onPress={() => { captureEvent('settings_item_tapped', {item: 'faq'}); navigation.navigate('FaqScreen'); }}
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
          onPress={() => { captureEvent('settings_item_tapped', {item: 'support'}); navigation.navigate('SupportScreen'); }}
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
          onPress={() => { captureEvent('legal_link_opened', {link: 'refund_cancellation', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.refundCancellation); }}
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
          <Icon name="open-in-new" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { captureEvent('legal_link_opened', {link: 'privacy', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.privacyPolicy); }}
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
          <Icon name="open-in-new" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { captureEvent('legal_link_opened', {link: 'terms', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.termsOfUse); }}
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
          <Icon name="open-in-new" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { captureEvent('legal_link_opened', {link: 'child_safety', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.childSafety); }}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="child-care"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>{t('settings.childSafety')}</Text>
          </View>
          <Icon name="open-in-new" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { captureEvent('legal_link_opened', {link: 'safety_guidelines', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.safetyGuidelines); }}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="shield"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>{t('settings.safetyGuidelines')}</Text>
          </View>
          <Icon name="open-in-new" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { captureEvent('legal_link_opened', {link: 'report_vulnerability', screen: 'settings'}); Linking.openURL(LEGAL_LINKS.reportVulnerability); }}
          style={styles.item}>
          <View style={styles.itemContent}>
            <Icon
              name="bug-report"
              size={25}
              color={COLORS.AstroMaroon}
              style={styles.icon}
            />
            <Text style={styles.text}>{t('settings.reportVulnerability')}</Text>
          </View>
          <Icon name="open-in-new" size={20} color="#999" />
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
          onPress={openDeleteModal}>
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
        onRequestClose={() => (deleting ? null : setDeleteModalVisible(false))}
        animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('settings.confirmDeleteTitle')}</Text>
            <Text style={styles.modalMessage}>
              {t('settings.confirmDeleteMsg')}
            </Text>

            {/* Everything below states a real consequence. The confirm button stays
                disabled until the preview lands, so the balance warning can never be
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
  // Greyed while the delete preview is still loading, or while the request is in
  // flight, so the destructive button is never live on an unknown state.
  confirmButtonDisabled: {
    backgroundColor: '#c9a49a',
  },
  deleteInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(14),
  },
  deleteInfoText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#666',
    marginLeft: scale(8),
  },
  deleteWarnText: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Regular',
    color: '#C0392B',
    marginBottom: verticalScale(14),
    lineHeight: verticalScale(18),
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
    // iOS ignores `elevation` — without these the settings card has no edge
    // against the page background.
    shadowColor: '#4a2412',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    padding: scale(10),
    borderRadius: moderateScale(10),
  },
});
