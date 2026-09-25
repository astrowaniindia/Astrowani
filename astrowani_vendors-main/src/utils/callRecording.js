// Call audio recording (Android). Each phone records ITS OWN microphone during a call and
// uploads the file after the call; the server transcribes it and checks for spoken phone
// numbers. See astrowani-backend/src/callRecordingRoutes.js and android/.../CallRecorder.kt.
//
// DORMANT BY DEFAULT: startCallRecording asks the backend first, and the backend answers
// "not enabled" until an admin switches it on AND storage is configured. Nothing is captured
// and no notice is shown in that case.
//
// The user is TOLD when recording starts (a notice popup), and the microphone is not recorded
// while they are muted -- the native tap sees the raw hardware mic, so setCallRecordingMuted
// must be called on every mute toggle.
//
// Everything here swallows failures: recording is an audit aid and must never break a call.
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { showStatusPopup } from '../components/StatusPopup';
import { translate } from '../context/LanguageContext';

const { CallRecording } = NativeModules;
const available = Platform.OS === 'android' && !!CallRecording;

let current = null; // { recordingId, uploadUrl, sessionId }

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Call when the call connects. Resolves true if recording actually began. */
export async function startCallRecording(sessionId, callType) {
  if (!available || !sessionId) return false;
  if (current && current.sessionId === String(sessionId)) return true;
  try {
    const res = await Instance.post(
      '/api/call-recordings/start',
      { sessionId: String(sessionId), callType },
      { headers: await authHeaders() },
    );
    const d = res.data || {};
    if (!d.enabled || !d.recordingId || !d.uploadUrl) return false;
    const started = await CallRecording.start(String(sessionId));
    if (!started) return false;
    current = { recordingId: d.recordingId, uploadUrl: d.uploadUrl, sessionId: String(sessionId) };
    showStatusPopup({
      variant: 'info',
      title: translate('callRecording.noticeTitle'),
      message: translate('callRecording.noticeMsg'),
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Keep in step with the mic mute button: buffers are dropped while muted. */
export function setCallRecordingMuted(muted) {
  if (!available || !current) return;
  try { CallRecording.setMuted(!!muted); } catch (_) { /* ignore */ }
}

function putFile(url, path) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'audio/aac');
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('upload network error'));
    xhr.send({ uri: `file://${path}`, type: 'audio/aac', name: 'call.aac' });
  });
}

/** Call when the call ends. Not awaited by callers: the upload must never delay leaving the call. */
export async function stopAndUploadCallRecording() {
  const cur = current;
  current = null;
  if (!available || !cur) return;
  let path = null;
  try {
    const r = await CallRecording.stop();
    if (!r || !r.path) return;
    path = r.path;
    await putFile(cur.uploadUrl, r.path);
    await Instance.post(
      `/api/call-recordings/${cur.recordingId}/complete`,
      { durationMs: r.durationMs },
      { headers: await authHeaders() },
    );
  } catch (_) {
    // Upload failed: the file is deleted below and the recording is simply lost.
  } finally {
    if (path) { try { CallRecording.deleteFile(path); } catch (_) { /* ignore */ } }
  }
}
