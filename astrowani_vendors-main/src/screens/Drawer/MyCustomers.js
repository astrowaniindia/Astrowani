import React, { useContext, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../../api/ApiCall';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import { LanguageContext } from '../../context/LanguageContext';

const audioRecorderPlayer = new AudioRecorderPlayer();

// Types a referral commission applies to. life_report is deliberately absent — it has no
// commission rate and the backend rejects it with NOT_COMMISSIONABLE.
const COMMISSIONABLE = ['gemstone', 'puja', 'specific_puja'];
const TYPE_LABEL = { gemstone: 'Gemstone', puja: 'Puja', specific_puja: 'Specific Puja' };

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN');
}

const MyCustomers = () => {
  const { t } = useContext(LanguageContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Recording modal state
  const [target, setTarget] = useState(null); // customer being sent a voice note
  const [recording, setRecording] = useState(false);
  const [recordedPath, setRecordedPath] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  const startTimeRef = useRef(0);

  // Remedy recommendation state
  const [recommendTarget, setRecommendTarget] = useState(null); // customer being recommended to
  const [remedyItems, setRemedyItems] = useState([]);
  const [remedyLoading, setRemedyLoading] = useState(false);
  const [recommendBusy, setRecommendBusy] = useState(null);     // item id in flight
  const [recommendSentFor, setRecommendSentFor] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.get('/vendor/customers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) setData(res.data.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const openRecorder = (customer) => {
    setTarget(customer);
    setRecordedPath(null);
    setDurationMs(0);
    setRecording(false);
    setPlaying(false);
  };

  // ── Recommend a remedy to a customer ──────────────────────────────────────
  // Items are fetched once and cached for the session — the catalogue barely changes
  // and re-fetching on every modal open would make the picker feel slow.
  const openRecommend = async (customer) => {
    setRecommendTarget(customer);
    setRecommendSentFor(null);
    if (remedyItems.length) return;
    setRemedyLoading(true);
    try {
      const res = await Instance.get('/api/remedies');
      // life_report is excluded: it is a digital good with no commission rate, and the
      // backend refuses a referral for it (NOT_COMMISSIONABLE). Filtering here means the
      // astrologer never taps something that can only fail.
      setRemedyItems((res.data?.data || []).filter((r) => COMMISSIONABLE.includes(r.type)));
    } catch (e) {
      console.log('[MyCustomers] remedy fetch failed:', e.message);
    } finally {
      setRemedyLoading(false);
    }
  };

  const sendRecommendation = async (remedy) => {
    if (!recommendTarget || recommendBusy) return;
    setRecommendBusy(remedy._id);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/api/vendor/remedy-referrals',
        { customerId: recommendTarget.id, remedyItemId: remedy._id },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.success) {
        // Show the rate the SERVER reported rather than a hardcoded number — an admin can
        // change it at any time, and promising a stale percentage is worse than saying nothing.
        setRecommendSentFor({ title: remedy.title, percent: res.data.commissionPercent, days: res.data.windowDays });
      }
    } catch (e) {
      Alert.alert('Could not recommend', e.response?.data?.message || e.message);
    } finally {
      setRecommendBusy(null);
    }
  };

  const closeRecorder = async () => {
    try {
      if (recording) await audioRecorderPlayer.stopRecorder();
      if (playing) await audioRecorderPlayer.stopPlayer();
    } catch (_) {}
    audioRecorderPlayer.removeRecordBackListener();
    audioRecorderPlayer.removePlayBackListener();
    setTarget(null);
  };

  const startRecording = async () => {
    const ok = await requestMicPermission();
    if (!ok) {
      Alert.alert('Microphone permission required', 'Please allow microphone access to record a voice note.');
      return;
    }
    setRecordedPath(null);
    setDurationMs(0);
    startTimeRef.current = Date.now();
    await audioRecorderPlayer.startRecorder();
    audioRecorderPlayer.addRecordBackListener((e) => {
      setDurationMs(e.currentPosition);
    });
    setRecording(true);
  };

  const stopRecording = async () => {
    const path = await audioRecorderPlayer.stopRecorder();
    audioRecorderPlayer.removeRecordBackListener();
    setRecording(false);
    setRecordedPath(path);
  };

  const previewPlayback = async () => {
    if (!recordedPath) return;
    if (playing) {
      await audioRecorderPlayer.stopPlayer();
      audioRecorderPlayer.removePlayBackListener();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await audioRecorderPlayer.startPlayer(recordedPath);
    audioRecorderPlayer.addPlayBackListener((e) => {
      if (e.currentPosition >= e.duration) {
        audioRecorderPlayer.stopPlayer();
        audioRecorderPlayer.removePlayBackListener();
        setPlaying(false);
      }
    });
  };

  const sendVoiceNote = async () => {
    if (!recordedPath || !target) return;
    setSending(true);
    try {
      const base64 = await RNFS.readFile(recordedPath, 'base64');
      const token = await AsyncStorage.getItem('token');

      const uploadRes = await Instance.post(
        '/api/upload-image',
        { base64: `data:audio/mp4;base64,${base64}`, folder: 'voice-notes' },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const audioUrl = uploadRes.data?.url;
      if (!audioUrl) throw new Error('Upload failed');

      await Instance.post(
        '/api/vendor/voice-notes',
        { customerId: target.id, audioUrl, durationSeconds: Math.round(durationMs / 1000) },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Alert.alert('Sent!', `Your voice note was sent to ${target.name}.`);
      closeRecorder();
    } catch (e) {
      Alert.alert('Could not send', e.response?.data?.message || e.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const renderCustomerItem = ({ item }) => (
    <View style={styles.customerItem}>
      <View style={styles.customerRow}>
        <Image
          source={item.profileImage ? { uri: item.profileImage } : require('../../assets/images/esoteric.png')}
          style={styles.profileImage}
        />
        <View style={styles.customerDetails}>
          <Text style={styles.customerName}>{item.name}</Text>
          <Text style={styles.customerInfo}>
            {t('customers.lastConnected')}: <Text style={{ fontWeight: 'bold' }}>{timeAgo(item.lastSessionAt)}</Text>
          </Text>
          <Text style={styles.customerInfo}>
            {t('customers.sessionType')}: <Text style={{ color: 'green', fontWeight: 'bold' }}>{item.lastSessionType || '—'}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.voiceNoteButton, styles.actionFlex]} onPress={() => openRecorder(item)}>
          <Icon name="mic-outline" size={18} color="#fff" />
          <Text style={styles.voiceNoteButtonText}>{t('customers.sendVoiceNote')}</Text>
        </TouchableOpacity>
        {/* Recommend a remedy to this customer. If they buy it, the astrologer earns a
            commission — see RemedyReferrals.js and the backend's remedyCommission.js. */}
        <TouchableOpacity style={[styles.recommendButton, styles.actionFlex]} onPress={() => openRecommend(item)}>
          <Icon name="sparkles-outline" size={18} color={COLORS.AstroMaroon} />
          <Text style={styles.recommendButtonText}>Recommend</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('customers.noCustomers')}</Text>}
        />
      )}

      <Modal visible={!!target} transparent animationType="fade" onRequestClose={closeRecorder}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Voice note for {target?.name}</Text>
            <Text style={styles.modalSubtitle}>A short check-in — let them know you're thinking of them.</Text>

            <View style={styles.recordArea}>
              {!recordedPath ? (
                <TouchableOpacity
                  style={[styles.recordBtn, recording && styles.recordBtnActive]}
                  onPress={recording ? stopRecording : startRecording}>
                  <Icon name={recording ? 'stop' : 'mic'} size={32} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.recordBtn} onPress={previewPlayback}>
                  <Icon name={playing ? 'pause' : 'play'} size={32} color="#fff" />
                </TouchableOpacity>
              )}
              <Text style={styles.durationText}>
                {recording ? 'Recording…' : recordedPath ? `${Math.round(durationMs / 1000)}s recorded` : 'Tap to record'}
              </Text>
              {recordedPath && !recording && (
                <TouchableOpacity onPress={() => { setRecordedPath(null); setDurationMs(0); }}>
                  <Text style={styles.reRecordText}>Re-record</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeRecorder}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, (!recordedPath || sending) && styles.sendBtnDisabled]}
                onPress={sendVoiceNote}
                disabled={!recordedPath || sending}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendBtnText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Remedy picker. Confirmation replaces the list rather than stacking a second
          alert on top — the astrologer needs to see WHAT they recommended and what it
          pays, not just "done". */}
      <Modal
        visible={!!recommendTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRecommendTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.recommendSheet}>
            <View style={styles.recommendHeader}>
              <Text style={styles.recommendTitle} numberOfLines={1}>
                {recommendSentFor ? 'Recommended' : `Recommend to ${recommendTarget?.name || 'customer'}`}
              </Text>
              <TouchableOpacity onPress={() => setRecommendTarget(null)} hitSlop={10}>
                <Icon name="close" size={22} color="#7A6B64" />
              </TouchableOpacity>
            </View>

            {recommendSentFor ? (
              <View style={styles.recommendDone}>
                <Icon name="checkmark-circle" size={moderateScale(44)} color="#1D6B4E" />
                <Text style={styles.recommendDoneTitle}>{recommendSentFor.title}</Text>
                <Text style={styles.recommendDoneBody}>
                  {recommendTarget?.name || 'The customer'} will see this marked as recommended by you.
                  {recommendSentFor.percent > 0
                    ? ` If they buy it within ${recommendSentFor.days} days you earn ${recommendSentFor.percent}% — paid once it's delivered.`
                    : ' Commission is currently switched off for this category.'}
                </Text>
                <TouchableOpacity style={styles.recommendDoneBtn} onPress={() => setRecommendTarget(null)}>
                  <Text style={styles.recommendDoneBtnTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : remedyLoading ? (
              <ActivityIndicator style={{ marginVertical: verticalScale(30) }} color={COLORS.AstroMaroon} />
            ) : (
              <FlatList
                data={remedyItems}
                keyExtractor={(r) => r._id}
                style={{ maxHeight: verticalScale(360) }}
                ListEmptyComponent={<Text style={styles.recommendEmpty}>No remedies available right now.</Text>}
                renderItem={({ item: r }) => (
                  <TouchableOpacity
                    style={styles.remedyRow}
                    disabled={!!recommendBusy}
                    onPress={() => sendRecommendation(r)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.remedyTitle} numberOfLines={2}>{r.title}</Text>
                      <Text style={styles.remedyMeta}>
                        {TYPE_LABEL[r.type] || r.type}{r.price ? ` · ₹${r.price}` : ''}
                      </Text>
                    </View>
                    {recommendBusy === r._id
                      ? <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
                      : <Icon name="chevron-forward" size={20} color="rgba(89,42,25,0.35)" />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: scale(10),
  },
  listContent: {
    paddingBottom: verticalScale(10),
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: COLORS.AshGray,
    borderBottomWidth: verticalScale(1),
    paddingBottom: verticalScale(10),
  },
  customerItem: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(15),
    marginVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    elevation: verticalScale(2),
  },
  profileImage: {
    width: scale(55),
    height: scale(55),
    borderRadius: moderateScale(30),
    marginRight: scale(10),
    backgroundColor: '#eee',
  },
  customerDetails: { flex: 1 },
  customerName: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#000',
    marginBottom: verticalScale(4),
  },
  customerInfo: {
    fontSize: moderateScale(12),
    color: '#000',
  },
  voiceNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(9),
    marginTop: verticalScale(12),
  },
  voiceNoteButtonText: {
    color: '#fff',
    fontSize: moderateScale(13),
    fontWeight: 'bold',
    marginLeft: scale(6),
  },
  emptyText: {
    textAlign: 'center',
    fontSize: moderateScale(16),
    color: 'gray',
    marginTop: verticalScale(20),
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },

  // ── Recommend a remedy ──
  actionRow: { flexDirection: 'row', gap: scale(8) },
  actionFlex: { flex: 1 },
  recommendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(89,42,25,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(89,42,25,0.25)',
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(9),
    marginTop: verticalScale(12),
  },
  recommendButtonText: {
    color: COLORS.AstroMaroon,
    fontWeight: '600',
    fontSize: moderateScale(12.5),
    marginLeft: scale(6),
  },
  recommendSheet: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
  },
  recommendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(10),
    gap: scale(10),
  },
  recommendTitle: { flex: 1, fontSize: moderateScale(15), fontWeight: '700', color: COLORS.AstroMaroon },
  remedyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(11),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(89,42,25,0.08)',
    gap: scale(8),
  },
  remedyTitle: { fontSize: moderateScale(13.5), color: '#241A16', fontWeight: '600' },
  remedyMeta: { fontSize: moderateScale(11.5), color: '#7A6B64', marginTop: verticalScale(2) },
  recommendEmpty: { textAlign: 'center', color: '#7A6B64', paddingVertical: verticalScale(26), fontSize: moderateScale(13) },
  recommendDone: { alignItems: 'center', paddingVertical: verticalScale(10) },
  recommendDoneTitle: {
    fontSize: moderateScale(15), fontWeight: '700', color: '#241A16',
    marginTop: verticalScale(10), textAlign: 'center',
  },
  recommendDoneBody: {
    fontSize: moderateScale(12.5), color: '#6B5C55', textAlign: 'center',
    marginTop: verticalScale(8), lineHeight: moderateScale(19),
  },
  recommendDoneBtn: {
    backgroundColor: COLORS.AstroMaroon, borderRadius: moderateScale(8),
    paddingVertical: verticalScale(10), paddingHorizontal: scale(34), marginTop: verticalScale(16),
  },
  recommendDoneBtnTxt: { color: '#fff', fontWeight: '700', fontSize: moderateScale(13) },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: moderateScale(16), padding: scale(20) },
  modalTitle: { fontSize: moderateScale(17), fontWeight: 'bold', color: '#222', textAlign: 'center' },
  modalSubtitle: { fontSize: moderateScale(12), color: '#888', textAlign: 'center', marginTop: 4, marginBottom: verticalScale(20) },
  recordArea: { alignItems: 'center', marginBottom: verticalScale(20) },
  recordBtn: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: COLORS.AstroMaroon,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  recordBtnActive: { backgroundColor: '#D32F2F' },
  durationText: { marginTop: verticalScale(10), fontSize: moderateScale(13), color: '#666' },
  reRecordText: { marginTop: verticalScale(8), color: COLORS.AstroMaroon, fontWeight: '600', fontSize: moderateScale(13) },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(8), alignItems: 'center', backgroundColor: '#eee', marginRight: scale(8) },
  cancelBtnText: { color: '#333', fontWeight: 'bold', fontSize: moderateScale(14) },
  sendBtn: { flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(8), alignItems: 'center', backgroundColor: COLORS.AstroMaroon, marginLeft: scale(8) },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: moderateScale(14) },
});

export default MyCustomers;
