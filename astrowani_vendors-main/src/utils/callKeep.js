// iOS CallKit + PushKit integration for incoming consultation requests.
//
// WHY THIS EXISTS
// On iOS a data-only FCM push cannot reliably wake a KILLED app to ring an incoming
// call. Android's socket + FCM + CallForegroundService combination (CLAUDE.md subsystem
// AE) has no iOS equivalent. The platform's answer is PushKit — a dedicated VoIP push
// channel iOS delivers even when the app is not running — paired with CallKit for the
// native full-screen incoming-call UI.
//
// This matters commercially: CLAUDE.md's analytics audit measured a 39.3% accept rate
// with `missed: 48` versus `rejected: 7`. Astrologers are not declining work, they are
// not being reached. iOS without PushKit would be strictly worse.
//
// THE IOS CONTRACT — the one rule that must never be broken:
// Every PushKit push MUST result in the app reporting a call to CallKit, essentially
// immediately. iOS terminates the app if it does not, and repeat offences revoke the
// app's VoIP push privilege entirely. That report therefore happens in NATIVE code, in
// AppDelegate.mm's `didReceiveIncomingPushWithPayload`, NOT here — JS may not even be
// running yet. By the time any code in this file executes, CallKit is already ringing.
// This file only handles what the astrologer then does about it.
//
// ANDROID IS UNTOUCHED. react-native-callkeep is excluded from Android autolinking (see
// react-native.config.js — its ConnectionService would add CALL_PHONE and friends to a
// live Play Store listing). Every export here is a no-op on Android, which keeps using
// the existing notifee + FCM + foreground-service path.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNCallKeep from 'react-native-callkeep';
import VoipPushNotification from 'react-native-voip-push-notification';
import Instance from '../api/ApiCall';
import { acceptRequest, rejectRequest } from './incomingRequestActions';
import { stopRinging } from './incomingRingtone';
import { cancelIncomingRequestNotification } from './incomingRequestNotifications';
import { navigationRef } from './navigationRef';

const IS_IOS = Platform.OS === 'ios';

// ---------------------------------------------------------------------------
// State.
//
// `pendingByUuid` holds the VoIP payload for each ringing call, keyed by the CallKit
// UUID. The backend sets that UUID to the sessionId (both are real UUIDs), so the same
// key identifies the call across the push, the CallKit UI and our own accept call.
//
// `answeredUuids` is what lets the single CallKit `endCall` event mean two different
// things: fired BEFORE an answer it is the astrologer declining; fired AFTER it is a
// normal hangup. Without this distinction, hanging up a completed consultation would
// post a `request_rejected` analytics event and try to reject an already-accepted
// request.
// ---------------------------------------------------------------------------
const pendingByUuid = new Map();
const answeredUuids = new Set();
let activeUuid = null;
let didSetup = false;

// ---------------------------------------------------------------------------
// WHO OWNS THE AUDIO SESSION
//
// On iOS, answering through CallKit means the SYSTEM activates AVAudioSession and tells
// us afterwards, via the provider's didActivate callback (surfaced by react-native-callkeep
// as the `didActivateAudioSession` event). Calling InCallManager.start() in that window
// reconfigures and re-activates the same session underneath WebRTC, and the reported
// result was a connected call with no audio in either direction.
//
// It also explains why video seemed fine while audio did not: the video call under test
// was answered from the IN-APP popup, where no CallKit call exists and InCallManager is
// the only thing touching the session. The split was CallKit-vs-in-app, not video-vs-audio.
//
// `audioSessionActive` is reset on every teardown so a second call in the same app run
// does not inherit the first one's state.
let audioSessionActive = false;
const audioSessionWaiters = [];

function resolveAudioSessionWaiters() {
  while (audioSessionWaiters.length) {
    const w = audioSessionWaiters.shift();
    clearTimeout(w.timer);
    w.resolve(true);
  }
}

/**
 * True when a CallKit call is live, i.e. the system owns the audio session and the call
 * screen must not configure it itself. Always false on Android and for in-app answers.
 */
export function callKitOwnsAudio() {
  return IS_IOS && activeUuid !== null;
}

/**
 * Resolves once CallKit has activated the audio session, or immediately when CallKit is
 * not involved.
 *
 * Resolves `false` on timeout rather than rejecting or hanging: a call that proceeds with
 * a possibly-misconfigured session is recoverable, whereas a call screen stuck awaiting an
 * event that never arrives is a dead consultation. The caller treats a false the same as
 * "no CallKit", i.e. it falls back to configuring the session itself.
 */
export function awaitCallKitAudioSession(timeoutMs = 4000) {
  if (!callKitOwnsAudio()) return Promise.resolve(false);
  if (audioSessionActive) return Promise.resolve(true);
  return new Promise((resolve) => {
    const waiter = { resolve };
    waiter.timer = setTimeout(() => {
      const i = audioSessionWaiters.indexOf(waiter);
      if (i >= 0) audioSessionWaiters.splice(i, 1);
      log('timed out waiting for CallKit audio session');
      resolve(false);
    }, timeoutMs);
    audioSessionWaiters.push(waiter);
  });
}

function log(...args) {
  console.log('[callKeep]', ...args);
}

// ---------------------------------------------------------------------------
// Token registration
// ---------------------------------------------------------------------------

// The PushKit token is NOT the FCM token — it is issued by PKPushRegistry and stored in
// its own column (see astrowani-backend/sql/astrologer_voip_token.sql). Posting it is
// best-effort: a failure just means this device cannot be rung while killed, which must
// never block app startup or login.
async function registerVoipToken(token) {
  if (!token) return;
  try {
    await AsyncStorage.setItem('voipToken', token);
    const authToken = await AsyncStorage.getItem('token');
    if (!authToken) {
      // Not logged in yet. syncVoipTokenWithBackend() re-sends from storage after OTP
      // verification, so the token is not lost.
      log('token stored, deferring upload until login');
      return;
    }
    await Instance.post(
      '/api/vendor/voip-token',
      { voipToken: token, platform: 'ios' },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    log('token registered with backend');
  } catch (e) {
    console.warn('[callKeep] token registration failed:', e?.message);
  }
}

// Called after login, since a token issued pre-login has no astrologer to attach to.
export async function syncVoipTokenWithBackend() {
  if (!IS_IOS) return;
  try {
    const stored = await AsyncStorage.getItem('voipToken');
    if (stored) await registerVoipToken(stored);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Ending a CallKit call
// ---------------------------------------------------------------------------

/**
 * End the CallKit call for `uuid`, or the current one if omitted.
 *
 * Must be called when the consultation actually ends, or iOS keeps showing the call in
 * its own UI (and in the system call log) after our screens have torn down — the
 * astrologer would appear stuck on a call forever. Wired into the same `doEndCall`
 * choke points that already stop the Android foreground service.
 */
export function endCallKitCall(uuid) {
  if (!IS_IOS) return;
  const target = uuid || activeUuid;
  if (!target) return;
  try {
    RNCallKeep.endCall(target);
  } catch (e) {
    console.warn('[callKeep] endCall failed:', e?.message);
  }
  pendingByUuid.delete(target);
  answeredUuids.delete(target);
  if (activeUuid === target) {
    activeUuid = null;
    // The system deactivates the session when the CallKit call ends. Clearing the flag
    // here means the NEXT call waits for its own activation rather than assuming the
    // previous one's is still good.
    audioSessionActive = false;
  }
}

/**
 * The customer gave up before the astrologer answered.
 *
 * There is deliberately no "cancel" VoIP push from the backend — iOS punishes a PushKit
 * push that reports no call (see the comment on `cancel_call` in the backend's index.js).
 * Instead the socket `call_cancelled` event reaches the app, which by then is awake
 * precisely BECAUSE the VoIP push woke it, and we dismiss the CallKit screen here.
 *
 * Matches on roomId/sessionId as well as uuid, because the socket payload's key names
 * vary across the emit sites (the same camelCase/snake_case tolerance
 * `dismissPopupIfMatches` needs in HomeScreen.js).
 */
export function endCallKitCallForRequest(data) {
  if (!IS_IOS || !data) return;
  const candidates = [data.uuid, data.sessionId, data.session_id, data.roomId, data.room_id].filter(Boolean);
  for (const c of candidates) {
    if (pendingByUuid.has(c) || c === activeUuid) {
      endCallKitCall(c);
      return;
    }
  }
  // Fall back to matching a queued payload by its own roomId, since the CallKit UUID is
  // the sessionId and a cancel may only carry roomId.
  for (const [uuid, payload] of pendingByUuid.entries()) {
    if (candidates.includes(payload?.roomId)) {
      endCallKitCall(uuid);
      return;
    }
  }

  // CHAT HAS NEITHER A roomId NOR A sessionId. The session is created when the astrologer
  // accepts, and a chat request carries only the caller — so every match above misses and a
  // cancelled chat would keep ringing on the lock screen until iOS gave up, for a customer
  // who had already left. Matched last, and only against a chat payload, so it can never
  // tear down a CALL that happens to share a caller.
  const callerId = data.callerId || data.caller_id || data.customer_id;
  if (callerId) {
    for (const [uuid, payload] of pendingByUuid.entries()) {
      if (payload?.callType === 'chat' && payload?.callerId === callerId) {
        endCallKitCall(uuid);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Turning a payload into the shape acceptRequest/rejectRequest expect
// ---------------------------------------------------------------------------
function reqFromPayload(uuid, payload = {}) {
  const callType = payload.callType || 'audio';
  return {
    // THE FIELD THAT MAKES THE BACKEND LOOK IN THE RIGHT TABLE, and it is not optional.
    //
    // Both /api/session/accept and /api/session/reject do `reqBody.table ||
    // 'chat_requests'`. Omitting it therefore sent every CallKit answer looking for the
    // call in chat_requests, where resolveOwnedRequestRow's `roomId` branch is not even
    // reachable (it is gated on targetTable === 'call_requests'). The route answered
    // `{ok: false, reason: 'not_found'}`, onAnswerCall tore the CallKit screen down, and
    // the astrologer saw Accept do nothing at all. Decline took the identical path, so
    // the customer was never told it had been declined either.
    //
    // Worse than a plain miss: with no requestId and no usable roomId, the chat_requests
    // branch falls through to `caller_id = <customer> ORDER BY created_at DESC LIMIT 1`,
    // so a customer who had ever chatted with this astrologer could have had an unrelated
    // older request accepted or rejected in place of the call they were actually making.
    table: callType === 'chat' ? 'chat_requests' : 'call_requests',
    // `roomId` is what matters for the backend's resolveOwnedRequestRow lookup — the
    // VoIP payload carries no requestId, and that function accepts either.
    roomId: payload.roomId || null,
    sessionId: payload.sessionId || uuid || null,
    callerId: payload.callerId || null,
    // `callerName` in a chat payload is DECORATED for the CallKit screen ("Chat from Ansh"),
    // because that label is drawn by native code which reads only that field. It must not
    // travel on: /api/session/accept echoes it back in navigationParams, which becomes the
    // chat screen's header. `callerRealName` is the plain name; falling back to callerName
    // keeps a call payload, and any older backend, behaving exactly as before.
    callerName: payload.callerRealName || payload.callerName || null,
    callType,
    // Distinguishes CallKit answers from popup/notification ones in the
    // request_accepted / request_rejected analytics events.
    source: 'callkit',
    receivedAt: payload.receivedAt || Date.now(),
  };
}

function screenFor(callType) {
  if (callType === 'video') return 'VideoCall';
  if (callType === 'chat') return 'VendorChatSession';
  return 'AudioCall';
}

/**
 * Silence everything the FCM/notifee path started for this request.
 *
 * CallKit answers and declines used to leave it all running. `startRinging()` arms
 * `Vibration.vibrate(pattern, repeat = true)`, which is INFINITE and is cancelled only by
 * `stopRinging()` — and nothing on the CallKit path ever called it, because this module
 * imported neither the ringtone nor the notification helpers. HomeScreen's own
 * `popupQueue` effect could not cover it either: a VoIP push answered from the lock
 * screen never enqueues a popup, so that effect never runs.
 *
 * The symptom was a phone that vibrated continuously through an answered call, stopped
 * when the app was backgrounded (iOS freezes the scheduler) and started again on return.
 *
 * Called SYNCHRONOUSLY at the top of both handlers, before the first `await`. Every await
 * yields the event loop, and a buzzing phone for the length of a network round trip is
 * exactly the complaint this fixes.
 */
function silenceIncoming(payload = {}) {
  try { stopRinging(); } catch (_) {}
  // Mirrors idKeyFor() in incomingRequestNotifications.js — calls key on roomId, chats on
  // callerId. A mismatch here is harmless (notifee ignores an unknown id) but a match is
  // what takes the heads-up notification down.
  const key = payload.roomId || payload.callerId;
  if (key) {
    try { cancelIncomingRequestNotification(`incoming_${key}`)?.catch?.(() => {}); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function onAnswerCall({ callUUID }) {
  const uuid = callUUID;
  log('answerCall', uuid);
  answeredUuids.add(uuid);
  activeUuid = uuid;

  const payload = pendingByUuid.get(uuid);
  silenceIncoming(payload);

  const req = reqFromPayload(uuid, payload);

  try {
    const result = await acceptRequest(req);
    if (!result?.ok) {
      // Customer already cancelled. Tear the CallKit screen down rather than leaving the
      // astrologer looking at a live call that no longer exists.
      log('accept rejected by backend:', result?.reason);
      endCallKitCall(uuid);
      return;
    }

    // A CHAT IS NOT A CALL ONCE IT IS ANSWERED — end the CallKit call immediately.
    //
    // For audio and video we keep it alive, because it owns the iOS audio session and
    // ending it would tear that session down underneath the WebRTC screen about to open;
    // the call screen's doEndCall closes it later via endCallKitCall().
    //
    // A chat has neither. There is no audio session to own, and VendorChatSession has no
    // doEndCall — it ends through endSessionLocal, which never touches CallKit. So the call
    // was reported, answered, and then left open forever: iOS went on believing a call was
    // in progress and kept ringing and vibrating while the astrologer sat in the chat room.
    // Reported as "the chat opens but it keeps vibrating and ringing".
    //
    // Ending it here closes the loop at the only point that knows this was a chat.
    if (req.callType === 'chat') {
      endCallKitCall(uuid);
      // endCallKitCall clears activeUuid and the pending entry, so re-silence anything the
      // notifee/FCM path may have started in parallel — the chat also gets an ordinary
      // push, and its ringtone is a separate, infinitely repeating one.
      silenceIncoming(payload);
    } else {
      try {
        RNCallKeep.setCurrentCallActive(uuid);
      } catch (_) {}
    }

    const screen = screenFor(req.callType);
    if (navigationRef.current?.isReady()) {
      // Same reasoning as the notifee background handler in index.js: this JS context is
      // alive whenever the process was not fully killed, so navigate immediately rather
      // than waiting on a lifecycle event that may never fire.
      navigationRef.current.navigate(screen, result.navigationParams);
    } else {
      // Cold start from a killed process — no navigator yet. NavigationScreen.js consumes
      // this on next ready/foreground. RNCallKeep.backToForeground() brings the app up,
      // which is what triggers that consumption.
      await AsyncStorage.setItem(
        'pendingCallNavigation',
        JSON.stringify({ screen, params: result.navigationParams }),
      );
      try {
        RNCallKeep.backToForeground();
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[callKeep] answer handling failed:', e?.message);
    endCallKitCall(uuid);
  }
}

async function onEndCall({ callUUID }) {
  const uuid = callUUID;
  log('endCall', uuid, 'answered:', answeredUuids.has(uuid));

  // Unconditional, and before the answered/declined split below: both branches end the
  // ringing state, and the declined branch awaits a network call before it returns.
  silenceIncoming(pendingByUuid.get(uuid));

  // Already answered => this is a normal hangup, and the call screen's own doEndCall
  // handles billing finalisation. Rejecting here would both post a bogus
  // request_rejected event and try to reject an accepted request.
  if (answeredUuids.has(uuid)) {
    answeredUuids.delete(uuid);
    pendingByUuid.delete(uuid);
    if (activeUuid === uuid) activeUuid = null;
    return;
  }

  // Not answered => the astrologer declined from the CallKit UI.
  const payload = pendingByUuid.get(uuid);
  pendingByUuid.delete(uuid);
  if (activeUuid === uuid) activeUuid = null;
  try {
    await rejectRequest(reqFromPayload(uuid, payload));
  } catch (e) {
    console.warn('[callKeep] reject failed:', e?.message);
  }
}

function onVoipNotification(payload) {
  if (!payload) return;
  const uuid = payload.uuid || payload.sessionId;
  if (!uuid) {
    log('voip notification with no uuid — ignoring', payload);
    return;
  }
  // Native already reported this to CallKit; we only need the details so that answering
  // it can be turned into an acceptRequest call.
  pendingByUuid.set(uuid, { ...payload, receivedAt: Date.now() });
  log('voip payload stored for', uuid);

  // Tell the native side we are done with this push so it can invoke iOS's completion
  // handler. Harmless if AppDelegate already completed it.
  try {
    VoipPushNotification.onVoipNotificationCompleted(uuid);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// DEV-ONLY: ring CallKit without a real VoIP push
//
// WHY THIS EXISTS
// PushKit delivery cannot be faked. It requires the `aps-environment` entitlement,
// which requires the paid Apple Developer Program, so a free-signed .ipa or a
// simulator never receives a VoIP push at all. Left at that, the ENTIRE CallKit
// path -- answer, decline, acceptRequest, navigation, teardown -- stays unverified
// until enrolment, which is a lot of untested code to carry to launch.
//
// CallKit itself is NOT entitlement-gated. So this reproduces everything a real
// push does EXCEPT its delivery: it stores the payload through the very same
// onVoipNotification() the push handler uses, then rings CallKit with the same
// configuration AppDelegate.mm's reportNewIncomingCall passes. Answering or
// declining then runs the real onAnswerCall / onEndCall handlers, untouched.
//
// WHAT IT VERIFIES: payload -> pendingByUuid -> answer -> acceptRequest ->
// navigate, the decline -> rejectRequest branch, the answered-vs-hangup
// distinction in onEndCall, endCallKitCall teardown, and that the CallKit UI is
// configured the way it will be in production.
//
// WHAT IT CANNOT VERIFY, and do not let a green run here suggest otherwise: that
// iOS delivers a VoIP push, that the app wakes from KILLED, or that
// AppDelegate.mm's native reportNewIncomingCall works. That is the push half, and
// it still needs the paid membership plus a physical device.
//
// USAGE, from the JS debugger console once initCallKeep() has run:
//   __astrowaniSimulateCall()                         // audio, synthetic ids
//   __astrowaniSimulateCall({ callType: 'video' })
//   __astrowaniSimulateCall({ roomId: '<real>', sessionId: '<real>' })
//
// Pass ids from a genuinely pending call_requests row to exercise the accept
// against the backend for real. With the synthetic defaults acceptRequest will
// correctly fail to resolve a row and you will watch the "customer already
// cancelled" teardown instead -- which is a path worth seeing too.
// ---------------------------------------------------------------------------

function devUuid() {
  // CallKit requires UUID *shape*; cryptographic quality is irrelevant for a
  // throwaway identifier in a debug build, so this avoids pulling in a dependency.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function simulateIncomingCallKitCall(overrides = {}) {
  // __DEV__ is false in every release bundle, so this is inert there even if a
  // stray call survives -- belt and braces, because the failure mode is a fake
  // consultation ringing on a real astrologer's phone.
  if (!__DEV__) return null;
  if (!IS_IOS) {
    log('simulateIncomingCallKitCall is iOS-only; ignored on', Platform.OS);
    return null;
  }
  if (!didSetup) {
    log('WARNING: initCallKeep() has not run, so nothing is listening for the answer');
  }

  const uuid = overrides.uuid || overrides.sessionId || devUuid();
  const callType = overrides.callType || 'audio';
  const callerName = overrides.callerName || 'Test Customer';

  // Exactly the shape the backend sends -- see the sendVoipPush call in
  // /api/call/initiate. Diverging here would test a payload that never occurs.
  const payload = {
    type: callType === 'video' ? 'incoming_video_call' : 'incoming_call',
    uuid,
    callerName,
    callerId: overrides.callerId || '',
    callType,
    sessionId: overrides.sessionId || uuid,
    roomId: overrides.roomId || null,
  };

  // Deliberately routed through the real handler rather than writing
  // pendingByUuid directly: that storage step is part of what is under test.
  onVoipNotification(payload);

  try {
    // The same arguments AppDelegate.mm gives reportNewIncomingCall: handleType
    // 'generic' because the caller is an account and not a dialable number, and
    // every supports* flag off because a consultation is a single 1:1 session.
    RNCallKeep.displayIncomingCall(uuid, callerName, callerName, 'generic', callType === 'video', {
      ios: {
        supportsHolding: false,
        supportsDTMF: false,
        supportsGrouping: false,
        supportsUngrouping: false,
      },
    });
  } catch (e) {
    console.warn('[callKeep] simulate failed:', e?.message);
    return null;
  }

  log(`simulated incoming ${callType} call`, uuid);
  return uuid;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Wire up CallKit + PushKit.
 *
 * MUST be called from index.js, outside the component tree, for the same reason
 * notifee.onBackgroundEvent is: when a VoIP push wakes a killed app, these listeners have
 * to exist before the native events are replayed. Registering them inside a component
 * would miss the very case this feature exists for.
 *
 * Safe to call more than once; safe on Android (no-op); never throws.
 */
export function initCallKeep() {
  if (!IS_IOS || didSetup) return;
  didSetup = true;

  try {
    RNCallKeep.setup({
      ios: {
        appName: 'Astrowani Astrologer',
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
      },
      // Present for shape only — CallKeep is not linked on Android (see
      // react-native.config.js), so this branch is never reached there.
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'Allow Astrowani to manage calls',
        cancelButton: 'Cancel',
        okButton: 'ok',
        additionalPermissions: [],
      },
    });
  } catch (e) {
    // A failed CallKit setup must not take the app down on launch. It degrades to the
    // old behaviour: calls ring only while the app is alive.
    console.warn('[callKeep] setup failed:', e?.message);
    return;
  }

  RNCallKeep.addEventListener('answerCall', onAnswerCall);
  RNCallKeep.addEventListener('endCall', onEndCall);

  // iOS hands the activated audio session over here. The call screens wait on this before
  // touching InCallManager — see callKitOwnsAudio() / awaitCallKitAudioSession() above for
  // why configuring it any earlier produced a silent call.
  RNCallKeep.addEventListener('didActivateAudioSession', () => {
    log('CallKit activated the audio session');
    audioSessionActive = true;
    resolveAudioSessionWaiters();
  });

  // The system took the session back (another call, Siri, a hangup). Anything that
  // reconfigures audio after this has to wait for a fresh activation.
  RNCallKeep.addEventListener('didDeactivateAudioSession', () => {
    log('CallKit deactivated the audio session');
    audioSessionActive = false;
  });

  // iOS mutes/unmutes and holds through CallKit's own UI. We do not bridge those into the
  // WebRTC tracks yet — the in-app controls remain the source of truth — so they are
  // logged rather than silently ignored, to make it obvious during device testing if the
  // system controls appear to do nothing.
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted, callUUID }) =>
    log('system mute toggled (not bridged to WebRTC yet):', muted, callUUID),
  );

  VoipPushNotification.addEventListener('register', (token) => {
    log('PushKit token received');
    registerVoipToken(token);
  });

  VoipPushNotification.addEventListener('notification', onVoipNotification);

  // THE KILLED-APP CASE. When a VoIP push launches the app from scratch, `register` and
  // `notification` fire in native before any JS listener exists. This replays them.
  // Without it, the very scenario CallKit was added for — answering a call on an app that
  // was not running — would ring but have no payload to accept with.
  VoipPushNotification.addEventListener('didLoadWithEvents', (events) => {
    if (!Array.isArray(events)) return;
    log('replaying', events.length, 'buffered VoIP events');
    for (const e of events) {
      if (e?.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') {
        registerVoipToken(e.data);
      } else if (e?.name === 'RNVoipPushRemoteNotificationReceivedEvent') {
        onVoipNotification(e.data);
      }
    }
  });

  try {
    VoipPushNotification.registerVoipToken();
  } catch (e) {
    console.warn('[callKeep] registerVoipToken failed:', e?.message);
  }

  if (__DEV__) {
    // Exposed on `global` so it can be fired from the JS debugger console with no
    // import and no UI surface -- a dev-only button on a real screen would be one
    // bad conditional away from shipping. See the block comment above.
    global.__astrowaniSimulateCall = simulateIncomingCallKitCall;
    log('dev helper ready: __astrowaniSimulateCall({ callType, roomId, sessionId, callerName })');
  }

  log('initialised');
}
