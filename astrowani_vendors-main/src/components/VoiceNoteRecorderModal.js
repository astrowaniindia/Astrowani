// Shared "send a voice note to a customer" recorder — record, preview, upload,
// POST /api/vendor/voice-notes. Extracted out of MyCustomers.js so ChatHistoryThread.js
// (referring back to what was said, then sending a follow-up voice note) can reuse the
// exact same modal instead of a second copy of the recording/upload logic.
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
  NativeModules,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';

const audioRecorderPlayer = new AudioRecorderPlayer();

// Android's MediaRecorder.stop() throws if it is stopped before any audio has been written,
// and the library leaves its recorder object in place when that happens — after which every
// startRecorder() rejects with "startRecorder has already been called." for the rest of the
// app's life. So a recording is always given a moment of audio before it is stopped.
const MIN_RECORDING_MS = 1200;

// The recorder itself belongs to the native module, which outlives any one mount of this
// modal: a screen that goes away mid-recording (an incoming call navigating the astrologer
// out, a stack screen popped) leaves it running. The library tracks "am I recording" per
// JS instance, so stopRecorder() does nothing once that flag and the native recorder have
// drifted apart — the recorder has to be stopped through the module directly.
const releaseOrphanedRecorder = async () => {
  try {
    await audioRecorderPlayer.stopRecorder();
  } catch (_) {
    // Rejects with "recorder is null." when nothing was running, which is the normal case.
  }
  try {
    await NativeModules.RNAudioRecorderPlayer?.stopRecorder();
  } catch (_) {}
  audioRecorderPlayer.removeRecordBackListener();
};

/**
 * @param {{id: string, name: string} | null} target - customer to send to; the modal is
 *   visible exactly when this is non-null (same contract MyCustomers used before).
 * @param {() => void} onClose
 * @param {(sent: {audioUrl: string, durationSeconds: number}) => void} [onSent]
 */
const VoiceNoteRecorderModal = ({ target, onClose, onSent }) => {
  const { t } = useContext(LanguageContext);
  const [recording, setRecording] = useState(false);
  const [recordedPath, setRecordedPath] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  // Latched before the first await, so two quick taps cannot both reach startRecorder().
  const busyRef = useRef(false);
  const recordStartedAtRef = useRef(0);

  useEffect(
    () => () => {
      releaseOrphanedRecorder();
      audioRecorderPlayer.stopPlayer().catch(() => {});
      audioRecorderPlayer.removePlayBackListener();
    },
    [],
  );

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const resetState = () => {
    setRecordedPath(null);
    setDurationMs(0);
    setRecording(false);
    setPlaying(false);
  };

  const close = async () => {
    try {
      if (recording) await audioRecorderPlayer.stopRecorder();
      if (playing) await audioRecorderPlayer.stopPlayer();
    } catch (_) {}
    audioRecorderPlayer.removeRecordBackListener();
    audioRecorderPlayer.removePlayBackListener();
    resetState();
    onClose();
  };

  const startRecording = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ok = await requestMicPermission();
      if (!ok) {
        Alert.alert(t('customers.micRequiredTitle'), t('customers.micRequiredBody'));
        return;
      }
      setRecordedPath(null);
      setDurationMs(0);
      await releaseOrphanedRecorder();
      await audioRecorderPlayer.startRecorder();
      recordStartedAtRef.current = Date.now();
      audioRecorderPlayer.addRecordBackListener((e) => setDurationMs(e.currentPosition));
      setRecording(true);
    } catch (_) {
      audioRecorderPlayer.removeRecordBackListener();
      setRecording(false);
      Alert.alert(t('customers.recordFailedTitle'), t('customers.recordFailedBody'));
    } finally {
      busyRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const elapsed = Date.now() - recordStartedAtRef.current;
      if (elapsed < MIN_RECORDING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_RECORDING_MS - elapsed));
      }
      const path = await audioRecorderPlayer.stopRecorder();
      setRecording(false);
      setRecordedPath(path);
    } catch (_) {
      // A recording stopped within a moment of starting can fail to finalise; there is no
      // file to send, so drop back to "tap to record" rather than offering a dead preview.
      setRecording(false);
      setDurationMs(0);
      Alert.alert(t('customers.recordFailedTitle'), t('customers.recordFailedBody'));
    } finally {
      audioRecorderPlayer.removeRecordBackListener();
      busyRef.current = false;
    }
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

      const durationSeconds = Math.round(durationMs / 1000);
      await Instance.post(
        '/api/vendor/voice-notes',
        { customerId: target.id, audioUrl, durationSeconds },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      Alert.alert(t('customers.voiceSentTitle'), t('customers.voiceSentBody', { name: target.name }));
      onSent?.({ audioUrl, durationSeconds });
      close();
    } catch (e) {
      Alert.alert(t('customers.sendFailed'), e.response?.data?.message || e.message || t('common.tryAgain'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('customers.voiceNoteForTitle', { name: target?.name || '' })}</Text>
          <Text style={styles.modalSubtitle}>{t('customers.voiceNoteHint')}</Text>

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
              {recording
                ? t('customers.recording')
                : recordedPath
                ? t('customers.recordedSeconds', { seconds: Math.round(durationMs / 1000) })
                : t('customers.tapToRecord')}
            </Text>
            {recordedPath && !recording && (
              <TouchableOpacity onPress={resetState}>
                <Text style={styles.reRecordText}>{t('customers.reRecord')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={close}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!recordedPath || sending) && styles.sendBtnDisabled]}
              onPress={sendVoiceNote}
              disabled={!recordedPath || sending}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendBtnText}>{t('customers.send')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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

export default VoiceNoteRecorderModal;
