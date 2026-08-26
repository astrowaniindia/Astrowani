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
  if (activeUuid === target) activeUuid = null;
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
}

// ---------------------------------------------------------------------------
// Turning a payload into the shape acceptRequest/rejectRequest expect
// ---------------------------------------------------------------------------
function reqFromPayload(uuid, payload = {}) {
  return {
    // `roomId` is what matters for the backend's resolveOwnedRequestRow lookup — the
    // VoIP payload carries no requestId, and that function accepts either.
    roomId: payload.roomId || null,
    sessionId: payload.sessionId || uuid || null,
    callerId: payload.callerId || null,
    callerName: payload.callerName || null,
    callType: payload.callType || 'audio',
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

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function onAnswerCall({ callUUID }) {
  const uuid = callUUID;
  log('answerCall', uuid);
  answeredUuids.add(uuid);
  activeUuid = uuid;

  const req = reqFromPayload(uuid, pendingByUuid.get(uuid));

  try {
    const result = await acceptRequest(req);
    if (!result?.ok) {
      // Customer already cancelled. Tear the CallKit screen down rather than leaving the
      // astrologer looking at a live call that no longer exists.
      log('accept rejected by backend:', result?.reason);
      endCallKitCall(uuid);
      return;
    }

    // Keep the CallKit call ALIVE for the duration. It is what owns the audio session on
    // iOS, and ending it here would tear that session down underneath the WebRTC screen
    // we are about to open. It gets ended in doEndCall via endCallKitCall().
    try {
      RNCallKeep.setCurrentCallActive(uuid);
    } catch (_) {}

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
