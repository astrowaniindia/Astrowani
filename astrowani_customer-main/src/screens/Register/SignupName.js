// Sign-up, step 2 of 3: the customer's name.
//
// Reached from VerifyOtp right after a signup OTP, so the account already exists
// and there is a real token to save with. Nothing else is asked here — birth
// details are asked when they are first needed (see utils/profileGate.js).
//
// A customer who closes the app on this screen is still a signed-in account; the
// next launch goes to Home, and Profile still has the name field.
import React, { useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { showAlert } from '../../Component/CustomAlert';
import { COLORS } from '../../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../../utils/Scaling';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';

// Intrinsic aspect of assets/images/guideAvatarLogin.png (145 x 281).
const GUIDE_AVATAR_ASPECT = 145 / 281;
const MAX_NAME_LENGTH = 60;

export default function SignupName({ navigation }) {
  const { t } = React.useContext(LanguageContext);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    captureEvent('signup_name_screen_viewed');
  }, []);

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      captureEvent('signup_step_blocked', { step: 'name' });
      showAlert(t('signupName.errorTitle'), t('signupName.needName'), 'error');
      return;
    }
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.put(
        '/api/users/profile',
        { name: trimmed },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const updated = res?.data?.data;
      if (!res?.data?.success || !updated) throw new Error('save_failed');
      // Keep the cached user in step, as the profile screen does.
      await AsyncStorage.setItem('userData', JSON.stringify(updated));
      captureEvent('signup_name_saved');
      navigation.reset({ index: 0, routes: [{ name: 'SignupWelcome', params: { name: trimmed } }] });
    } catch (err) {
      captureEvent('signup_name_save_failed', { reason: err?.response?.data?.code || 'other' });
      // Always our own Hinglish line: the server's message is English and would
      // break the tone of this screen.
      showAlert(t('signupName.errorTitle'), t('signupName.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f3f1" />

      {/* No keyboardVerticalOffset — see Register.jsx. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.guideRow}>
            <Image
              source={require('../../assets/images/guideAvatarLogin.png')}
              style={styles.guideAvatarImg}
              resizeMode="contain"
            />
            <View style={styles.guideBubble}>
              <View style={styles.guideTail} />
              <Text style={styles.guideText}>{t('signupName.guide')}</Text>
            </View>
          </View>

          <Text style={styles.title}>{t('signupName.title')}</Text>
          <Text style={styles.sub}>{t('signupName.sub')}</Text>

          <TextInput
            style={styles.input}
            placeholder={t('signupName.placeholder')}
            placeholderTextColor="#9b8f8a"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + verticalScale(10) }]}>
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
            onPress={handleContinue}
            activeOpacity={0.85}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{t('signupName.continue')}</Text>
                <Icon name="arrow-forward" size={moderateScale(18)} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f3f1' },
  scroll: { paddingHorizontal: scale(18), paddingTop: verticalScale(30), paddingBottom: verticalScale(24) },

  guideRow: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(24) },
  guideAvatarImg: { width: scale(62), aspectRatio: GUIDE_AVATAR_ASPECT },
  guideBubble: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(13),
    marginLeft: scale(12),
    borderWidth: 1,
    borderColor: '#ecd9cf',
  },
  guideTail: {
    position: 'absolute',
    left: -scale(6),
    top: '45%',
    width: 0,
    height: 0,
    borderTopWidth: scale(6),
    borderBottomWidth: scale(6),
    borderRightWidth: scale(7),
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#fff',
  },
  guideText: { fontSize: moderateScale(14), color: '#4a3a32', lineHeight: moderateScale(20) },

  title: { fontSize: moderateScale(22), fontWeight: 'bold', color: '#2b1a12' },
  sub: { fontSize: moderateScale(13), color: '#8a7c76', marginTop: verticalScale(4), lineHeight: moderateScale(19) },
  input: {
    marginTop: verticalScale(18),
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(13),
    fontSize: moderateScale(15),
    color: '#2b1a12',
    borderWidth: 1,
    borderColor: '#ecdfd8',
  },

  footer: {
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(10),
    backgroundColor: '#f7f3f1',
    borderTopWidth: 1,
    borderTopColor: '#ece1db',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    minHeight: verticalScale(50),
  },
  nextBtnText: { color: '#fff', fontSize: moderateScale(15.5), fontWeight: 'bold', marginRight: scale(7) },
});
