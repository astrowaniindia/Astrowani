// ─────────────────────────────────────────────────────────────────────────────
// Picking a photo for a consultation chat, and sending it.
//
// Shared verbatim with the astrologer app. NO NEW NATIVE DEPENDENCY:
// react-native-image-picker is already autolinked in both apps (profile photos),
// and both already declare CAMERA and the photo-library usage strings — so this
// whole feature reaches installed builds by OTA. The crop/draw/write edits are
// replayed server-side (astrowani-backend/src/chatImageComposer.js) rather than
// rasterised here, which is what avoids needing react-native-view-shot.
//
// WHY THE PICKER IS ASKED TO RESIZE
//   maxWidth/maxHeight make the native side re-encode the photo, which (a) keeps
//   the base64 body around a megabyte instead of ten, and (b) on Android bakes a
//   sane orientation into the file while PRESERVING the EXIF tag, so the
//   dimensions reported back are the ones the user sees. The editor and the
//   server's auto-orient therefore agree about which way up the photo is — the
//   single most common source of "it looked right before I sent it".
// ─────────────────────────────────────────────────────────────────────────────
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

const PICKER_OPTIONS = {
  mediaType: 'photo',
  includeBase64: true,
  // 2000px is more than enough to pinch into a photographed horoscope and keeps
  // the request well under the backend's own ceiling.
  maxWidth: 2000,
  maxHeight: 2000,
  quality: 0.85,
  // Nothing here needs the file left lying around in the app's cache.
  saveToPhotos: false,
};

/**
 * Open the camera or the gallery and return `{ uri, base64DataUri, width, height }`,
 * or `null` if the person backed out.
 *
 * Never throws. A refused permission, a cancelled picker and a broken file all come
 * back the same way — as nothing to send — because none of them is an error worth
 * interrupting a paid consultation for. `error` is returned separately for the one
 * case worth a word to the user.
 */
export async function pickChatImage({ fromCamera } = {}) {
  const launch = fromCamera ? launchCamera : launchImageLibrary;
  const response = await new Promise((resolve) => {
    try {
      launch(PICKER_OPTIONS, resolve);
    } catch (e) {
      resolve({ errorCode: 'others', errorMessage: e && e.message });
    }
  });

  if (!response || response.didCancel) return null;
  if (response.errorCode) {
    return { error: response.errorCode === 'permission' ? 'permission' : 'failed' };
  }
  const asset = response.assets && response.assets[0];
  if (!asset) return { error: 'failed' };
  if (!asset.base64) {
    // Without the bytes there is nothing to send; the uri alone is a local path the
    // server cannot read.
    return { error: 'failed' };
  }

  return {
    uri: asset.uri,
    // The server accepts a data URI, the same shape /api/upload-image takes.
    base64DataUri: `data:${asset.type || 'image/jpeg'};base64,${asset.base64}`,
    // Already orientation-corrected by the picker, which is what lets the editor
    // normalise against the same frame the server will.
    width: asset.width || 1,
    height: asset.height || 1,
  };
}

/**
 * POST the photo and its edit spec. Resolves `{ ok, row, masked, textDropped }` or
 * `{ ok: false, code }` — `code` is what the caller turns into a sentence, since
 * "too fast", "too large" and "you are not connected" all need different words and
 * a single "could not send" would be a lie in all three cases.
 */
export async function sendChatImage({ roomId, sessionId, receiverId, base64DataUri, edits, caption }) {
  try {
    const token = await AsyncStorage.getItem('token');
    const res = await Instance.post('/api/chat/image', {
      roomId,
      sessionId,
      receiverId,
      image: base64DataUri,
      edits,
      caption: caption || '',
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // A photo on a weak connection is a slow request, not a failed one. The
      // default timeout bounces perfectly good uploads on Indian mobile data.
      timeout: 60000,
    });
    if (!res.data || !res.data.success || !res.data.data) {
      return { ok: false, code: (res.data && res.data.code) || 'failed' };
    }
    return {
      ok: true,
      row: res.data.data,
      masked: !!res.data.masked,
      textDropped: !!res.data.textDropped,
    };
  } catch (e) {
    const code = (e && e.response && e.response.data && e.response.data.code) || null;
    return { ok: false, code: code || 'failed' };
  }
}

/** The i18n key for a failure code, so both apps word the same refusal the same way. */
export function imageErrorKey(code) {
  switch (code) {
    case 'TOO_FAST': return 'chatImage.errTooFast';
    case 'TOO_MANY': return 'chatImage.errTooMany';
    case 'IMAGE_TOO_LARGE':
    case 'PAYLOAD_TOO_LARGE': return 'chatImage.errTooLarge';
    case 'BAD_IMAGE': return 'chatImage.errBadImage';
    case 'NOT_CONNECTED':
    case 'SESSION_ENDED': return 'chatImage.errNotConnected';
    case 'permission': return 'chatImage.errPermission';
    default: return 'chatImage.errFailed';
  }
}
