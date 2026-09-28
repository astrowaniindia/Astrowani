// ChatHistoryThread.js — every message ever exchanged with ONE customer, merged into
// a single WhatsApp-style thread regardless of which paid session each message came
// from (GET /api/vendor/chat-threads/:customerId does the merging server-side, keyed
// by sender/receiver id rather than session id — see that endpoint's comment).
//
// Read-only: there is no free-form text box here. Sending a fresh text message only
// makes sense inside a live, billed session (VendorChatSession.js) — what this screen
// adds is the ability to look back at what was already said, and to follow up with a
// voice note (the same recorder MyCustomers.js uses) without having to remember it.
import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import VoiceNoteRecorderModal from '../../components/VoiceNoteRecorderModal';

const ChatHistoryThread = ({ route }) => {
  const { t } = useContext(LanguageContext);
  const { customerId, name: routeName, profileImage: routeImage } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [customer, setCustomer] = useState({ name: routeName, profileImage: routeImage });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await Instance.get(`/api/vendor/chat-threads/${customerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.data?.success) {
          setMessages(res.data.data || []);
          if (res.data.customer) {
            setCustomer((prev) => ({
              name: res.data.customer.name || prev.name,
              profileImage: res.data.customer.profileImage || prev.profileImage,
            }));
          }
          setFailed(false);
        }
      } catch (e) {
        console.log('[ChatHistoryThread] fetch failed:', e.message);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [customerId]);

  const renderMessage = ({ item }) => {
    const time = item.created_at
      ? new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <View style={[styles.bubble, item.fromMe ? styles.myBubble : styles.theirBubble]}>
        <Text style={[styles.bubbleText, item.fromMe && styles.myBubbleText]}>{item.message}</Text>
        <Text style={[styles.timeText, item.fromMe && styles.myTimeText]}>{time}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.hintBar}>
        <Ionicons name="information-circle-outline" size={16} color="#6B5C55" style={{ marginRight: scale(6) }} />
        <Text style={styles.hintText} numberOfLines={2}>
          {t('chatHistory.readOnlyHint', { name: customer.name || '' })}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
        </View>
      ) : (
        <ImageBackground
          source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
          style={styles.flex}
          imageStyle={{ opacity: 0.15 }}
        >
          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.messagesList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {failed ? t('chatHistory.loadFailed') : t('chatHistory.noMessages', { name: customer.name || '' })}
                </Text>
              </View>
            }
          />
        </ImageBackground>
      )}

      <View style={styles.footer}>
        <Image
          source={customer.profileImage ? { uri: customer.profileImage } : require('../../assets/images/esoteric.png')}
          style={styles.footerAvatar}
        />
        <TouchableOpacity
          style={styles.voiceBtn}
          onPress={() => setVoiceTarget({ id: customerId, name: customer.name })}
        >
          <Ionicons name="mic" size={18} color="#fff" />
          <Text style={styles.voiceBtnText}>{t('chatHistory.sendVoiceNote')}</Text>
        </TouchableOpacity>
      </View>

      <VoiceNoteRecorderModal target={voiceTarget} onClose={() => setVoiceTarget(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(89,42,25,0.06)',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(89,42,25,0.15)',
  },
  hintText: { flex: 1, fontSize: moderateScale(11.5), color: '#6B5C55', lineHeight: moderateScale(16) },
  messagesList: { padding: scale(12), paddingBottom: verticalScale(20), flexGrow: 1 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: scale(30) },
  emptyText: { fontSize: moderateScale(13.5), color: '#8a8a8a', textAlign: 'center' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.AstroMaroon, borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#2c3e50', fontSize: 15.5, lineHeight: 22 },
  myBubbleText: { color: '#fff' },
  timeText: { fontSize: 11, color: '#888', alignSelf: 'flex-end', marginTop: 4 },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
  },
  footerAvatar: { width: scale(36), height: scale(36), borderRadius: scale(18), marginRight: scale(10), backgroundColor: '#eee' },
  voiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(24),
    paddingVertical: verticalScale(11),
  },
  voiceBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(13.5), marginLeft: scale(8) },
});

export default ChatHistoryThread;
