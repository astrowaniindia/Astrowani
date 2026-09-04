import React, { useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { captureEvent } from '../../utils/Analytics';

// Home-screen banner surfacing an unheard voice note — matches the "new voice message"
// prominence pattern used by AstroTalk and similar apps. Renders nothing if there are none.
const VoiceNotesBanner = ({ navigation }) => {
  const { t } = useContext(LanguageContext);
  const [unread, setUnread] = useState(null); // most recent unread note, or null

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const token = await AsyncStorage.getItem('token');
          if (!token) return;
          const res = await Instance.get('/api/customer/voice-notes', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cancelled || !res.data?.success) return;
          const firstUnread = (res.data.data || []).find((n) => !n.listened_at);
          setUnread(firstUnread || null);
        } catch (_) {
          // Non-blocking — Home shouldn't break if this fails.
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  if (!unread) return null;

  return (
    <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={() => { captureEvent('voice_notes_banner_tapped'); navigation.navigate('VoiceNotes'); }}>
      <Image
        source={unread.astrologerImage ? { uri: unread.astrologerImage } : require('../../assets/images/esoteric.png')}
        style={styles.avatar}
      />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t('voiceNotesBanner.newNote', { name: unread.astrologerName })}</Text>
        <Text style={styles.subtitle}>{t('voiceNotesBanner.subtitle')}</Text>
      </View>
      <View style={styles.playIconWrap}>
        <Icon name="play" size={18} color="#fff" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    marginHorizontal: scale(15),
    marginBottom: verticalScale(10),
    padding: scale(12),
    borderWidth: 1.5,
    borderColor: COLORS.AstroGold,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatar: { width: scale(44), height: scale(44), borderRadius: scale(22), backgroundColor: '#eee', marginRight: scale(10) },
  textWrap: { flex: 1 },
  title: { fontSize: moderateScale(13), fontWeight: 'bold', color: '#222' },
  subtitle: { fontSize: moderateScale(11), color: '#888', marginTop: 2 },
  playIconWrap: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: scale(8),
  },
});

export default VoiceNotesBanner;
