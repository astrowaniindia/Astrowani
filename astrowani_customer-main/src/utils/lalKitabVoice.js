// lalKitabVoice.js — speaking and listening for the Lal Kitab assistant.
//
// Android's own on-device engines, through react-native-tts (TextToSpeech) and
// @react-native-voice/voice (SpeechRecognizer). Both are free, both work with no
// network, and neither bills per minute — which is what makes a talking assistant
// possible in a feature that is free to the customer. A cloud voice (Google Cloud
// TTS, ElevenLabs) is billed per character and would be the first per-minute cost
// in an app whose revenue is per-minute human consultation.
//
// EVERYTHING HERE IS PRESENCE-GUARDED, and that is the point: these are NATIVE
// modules, so a build that predates them cannot have them. Every function checks
// the module is really there and quietly does nothing if it is not, so this file
// is safe to ship by OTA to older builds — they simply get a text-only chat with
// no speaker and no microphone button. `available()` is what the screen asks
// before drawing those buttons.
//
// WHY ONE `speak()` RATHER THAN CALLS SCATTERED THROUGH THE SCREEN. Android's
// built-in voice is serviceable but it is obviously a phone reading aloud, not the
// voice in Riya/Aarohi-style apps (those are cloud voices). Swapping to a cloud
// voice later should be a change to this one function, not a hunt through a screen
// file.
//
// iOS IS DELIBERATELY NOT WIRED. The owner's scope for this feature is Android
// only; the modules do support iOS, but nothing here has been built or tested for
// it and both iOS apps are in App Store review. `available()` returns false there.

import { Platform, NativeModules } from 'react-native';

let Tts = null;
let Voice = null;
let probed = false;

/**
 * Load the two modules once, defensively.
 *
 * A require of a native module whose native half is missing can throw rather than
 * return undefined, so this is a try/catch and not an `if`. It also checks
 * NativeModules directly: the JS package can be present in the bundle while the
 * native side is absent, which is exactly the state an OTA to an older build
 * produces, and in that state the JS object exists and every call fails.
 */
function probe() {
  if (probed) return;
  probed = true;
  if (Platform.OS !== 'android') return;

  try {
    if (NativeModules.TextToSpeech) {
      // Deliberate lazy require: see probe() above.
      Tts = require('react-native-tts');
      if (Tts && Tts.default) Tts = Tts.default;
    }
  } catch (_) { Tts = null; }

  try {
    if (NativeModules.Voice || NativeModules.RCTVoice) {
      // Deliberate lazy require: see probe() above.
      Voice = require('@react-native-voice/voice');
      if (Voice && Voice.default) Voice = Voice.default;
    }
  } catch (_) { Voice = null; }
}

/** Can this build speak? */
export function canSpeak() {
  probe();
  return !!Tts;
}

/** Can this build listen? */
export function canListen() {
  probe();
  return !!Voice;
}

/** Either capability — what the screen uses to decide whether voice exists at all. */
export function available() {
  return canSpeak() || canListen();
}

/* ------------------------------------------------------------------ */
/* Speaking                                                           */
/* ------------------------------------------------------------------ */

let ttsReady = false;

async function ensureTts(language) {
  probe();
  if (!Tts) return false;
  if (!ttsReady) {
    try {
      // getInitStatus rejects when no engine is installed at all, which happens on
      // a bare emulator image with no Google services. Treated as "cannot speak"
      // rather than an error the customer sees.
      if (typeof Tts.getInitStatus === 'function') await Tts.getInitStatus();
      ttsReady = true;
    } catch (_) {
      Tts = null;
      return false;
    }
  }
  try {
    // hi-IN for Hindi, en-IN for English: en-IN reads Hinglish far more naturally
    // than en-US, which stresses Hindi words as if they were English.
    await Tts.setDefaultLanguage(language === 'hi' ? 'hi-IN' : 'en-IN');
  } catch (_) { /* the default voice still speaks; a wrong accent beats silence */ }
  try {
    await Tts.setDefaultRate(0.46, true); // the default is hurried for this content
    await Tts.setDefaultPitch(1.0);
  } catch (_) { /* optional */ }
  return true;
}

/**
 * Say something. Never throws, never rejects.
 *
 * The caller is a chat screen mid-conversation: a speech failure must cost the
 * audio and nothing else, so every path here resolves.
 */
export async function speak(textToSay, { language = 'en' } = {}) {
  const t = String(textToSay || '').trim();
  if (!t) return false;
  if (!(await ensureTts(language))) return false;
  try {
    await Tts.stop();
  } catch (_) { /* nothing was speaking */ }
  try {
    // Strip what an engine reads out as literal punctuation noise.
    Tts.speak(t.replace(/[*_`#]/g, '').slice(0, 1200));
    return true;
  } catch (_) {
    return false;
  }
}

export async function stopSpeaking() {
  probe();
  if (!Tts) return;
  try { await Tts.stop(); } catch (_) { /* nothing to stop */ }
}

/* ------------------------------------------------------------------ */
/* Listening (press to talk)                                          */
/* ------------------------------------------------------------------ */

/**
 * Start listening. Calls onResult with the final transcript, onPartial as it
 * goes, and onError with a short code.
 *
 * Returns a stop function, ALWAYS — even on failure — so a caller can write
 * `const stop = await startListening(...)` and call it unconditionally without
 * checking for null. A listener that cannot be stopped is a microphone left open.
 */
export async function startListening({ language = 'en', onResult, onPartial, onError } = {}) {
  probe();
  const noop = async () => {};
  if (!Voice) {
    if (onError) onError('unavailable');
    return noop;
  }

  // Speaking and listening at once means the engine hears itself.
  await stopSpeaking();

  const cleanup = () => {
    try {
      Voice.onSpeechResults = null;
      Voice.onSpeechPartialResults = null;
      Voice.onSpeechError = null;
      Voice.onSpeechEnd = null;
    } catch (_) { /* already gone */ }
  };

  try {
    Voice.onSpeechResults = (e) => {
      const said = (e && Array.isArray(e.value) && e.value[0]) || '';
      cleanup();
      if (onResult) onResult(String(said).trim());
    };
    Voice.onSpeechPartialResults = (e) => {
      const said = (e && Array.isArray(e.value) && e.value[0]) || '';
      if (onPartial && said) onPartial(String(said));
    };
    Voice.onSpeechError = (e) => {
      cleanup();
      const code = (e && e.error && (e.error.code || e.error.message)) || 'error';
      if (onError) onError(String(code));
    };
    await Voice.start(language === 'hi' ? 'hi-IN' : 'en-IN');
  } catch (e) {
    cleanup();
    if (onError) onError('start_failed');
    return noop;
  }

  return async () => {
    cleanup();
    try { await Voice.stop(); } catch (_) { /* already stopped */ }
    try { await Voice.cancel(); } catch (_) { /* already cancelled */ }
  };
}

/** Tear everything down. Called when the screen unmounts. */
export async function destroyVoice() {
  probe();
  try { if (Tts) await Tts.stop(); } catch (_) { /* nothing speaking */ }
  try {
    if (Voice) {
      await Voice.destroy();
      Voice.removeAllListeners();
    }
  } catch (_) { /* nothing listening */ }
}

export default {
  available,
  canSpeak,
  canListen,
  speak,
  stopSpeaking,
  startListening,
  destroyVoice,
};
