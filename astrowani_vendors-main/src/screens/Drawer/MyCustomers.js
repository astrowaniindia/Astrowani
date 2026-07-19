import React, { useEffect, useState, useRef } from 'react';
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

const audioRecorderPlayer = new AudioRecorderPlayer();

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN');
}

const MyCustomers = () => {
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
            Last connected: <Text style={{ fontWeight: 'bold' }}>{timeAgo(item.lastSessionAt)}</Text>
          </Text>
          <Text style={styles.customerInfo}>
            Session type: <Text style={{ color: 'green', fontWeight: 'bold' }}>{item.lastSessionType || '—'}</Text>
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.voiceNoteButton} onPress={() => openRecorder(item)}>
        <Icon name="mic-outline" size={18} color="#fff" />
        <Text style={styles.voiceNoteButtonText}>Send Voice Note</Text>
      </TouchableOpacity>
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
          ListEmptyComponent={<Text style={styles.emptyText}>No customers found.</Text>}
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
