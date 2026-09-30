// astrowani-backend/src/ringAstrologer.js
//
// Make an astrologer's phone ring for an incoming call.
//
// Extracted from /api/call/initiate (2026-09-27) because the free INSTANT call needs the
// identical three channels, and a second copy of this is the kind of thing that drifts:
// the first bug fixed in only one of them is a call that silently never rings on iOS, or
// rings on a device the astrologer is no longer signed in to. There is one copy.
//
// THREE CHANNELS, all of them needed, none of them sufficient alone:
//   socket  reaches an astrologer whose HomeScreen is mounted right now.
//   FCM     data-only, so the vendor app renders its own accept/reject notification
//           instead of Android auto-displaying a plain one. Reaches a backgrounded app.
//   VoIP    PushKit. The ONLY thing that can ring a KILLED iOS app — see src/voipPush.js
//           for why FCM cannot.
//
// Rings the astrologer's NEWEST signed-in device only, falling back to the legacy
// account-level columns when there are no device rows (an old build, or the migration not
// applied). Ringing EVERY device was considered and deliberately not done: answering on
// one would leave the other ringing, and a CallKit screen left ringing is something iOS
// penalises. See src/vendorDevices.js.
//
// Fire-and-forget by design: this returns as soon as the socket emit is done and the
// pushes are in flight. A push failure must never fail the request that created the call.

const { sendPush } = require('./push');
const { sendVoipPush } = require('./voipPush');
const vendorDevices = require('./vendorDevices');

/**
 * @param {object}  opts
 * @param {object}  opts.io          socket.io server (may be null)
 * @param {object}  opts.db          service-role Supabase client
 * @param {string}  opts.receiverId  astrologer id
 * @param {string}  opts.callType    'audio' | 'video'
 * @param {string}  opts.callerName
 * @param {string}  opts.callerId    real customer UUID
 * @param {string}  opts.sessionId   pre-generated; also the CallKit call UUID on iOS
 * @param {string}  opts.roomId
 * @param {boolean} [opts.isFree]    a free introductory call — shown as such to the astrologer
 * @param {number}  [opts.freeMinutes]
 */
async function ringAstrologer({
  io, db, receiverId, callType, callerName, callerId, sessionId, roomId,
  isFree = false, freeMinutes = 0,
}) {
  const type = callType === 'video' ? 'incoming_video_call' : 'incoming_call';

  // The astrologer is told plainly that this one is free, and for how long. Dressing a
  // free call up as a paid one would get a higher pick-up rate exactly once, and then
  // they would find out from their earnings.
  const freeFields = isFree
    ? { isFree: true, freeMinutes: Number(freeMinutes) || 0 }
    : {};

  // Notify via socket — no ENX tokens, WebRTC signalling happens over socket.io.
  const ringRoom = await vendorDevices.ringRoomFor(receiverId);
  if (io) {
    io.to(ringRoom).emit('incoming_call', {
      callType: callType || 'audio',
      callerName,
      callerId,
      sessionId,
      roomId,
      ...freeFields,
    });
  }
  console.log(`[Call] Notified vendor ${receiverId} of incoming ${isFree ? 'FREE ' : ''}${callType || 'audio'} call (WebRTC)`);

  // One lookup serves both push channels.
  Promise.all([
    db.from('astrologers').select('fcm_token, voip_token').eq('id', receiverId).single(),
    vendorDevices.activeDevice(receiverId),
  ])
    .then(([{ data: legacy }, device]) => {
      const data = device
        ? { fcm_token: device.fcm_token || legacy?.fcm_token, voip_token: device.voip_token || legacy?.voip_token }
        : legacy;

      if (data?.fcm_token) {
        sendPush(data.fcm_token, {
          // FCM data values must be strings; a boolean here is dropped silently by the
          // SDK and the vendor app would never see the free flag.
          data: {
            type,
            callerName,
            callerId: callerId || '',
            sessionId,
            roomId,
            ...(isFree ? { isFree: 'true', freeMinutes: String(freeMinutes || 0) } : {}),
          },
        }).catch((e) => console.error('[Call] push send error:', e.message));
      }

      // iOS VoIP ring. The payload's keys are consumed in AppDelegate.mm's PushKit
      // handler, which must report the call to CallKit immediately (iOS kills the app and
      // eventually revokes the VoIP privilege otherwise), so keep it flat, small and
      // stable. `uuid` is the CallKit call identifier and MUST be a real UUID — sessionId
      // already is one, so reusing it means the app can end the right CallKit call later
      // without extra bookkeeping.
      if (data?.voip_token) {
        sendVoipPush(data.voip_token, {
          type,
          uuid: sessionId,
          callerName: callerName || 'Astrowani',
          callerId: callerId || '',
          callType: callType || 'audio',
          sessionId,
          roomId,
          ...freeFields,
        })
          .then((r) => {
            if (r && r.unregistered) {
              // Dead token: app uninstalled, or (very common during the iOS rollout) a
              // sandbox token being sent to the production APNs host. Clear it so we stop
              // paying the latency of a doomed send on every call.
              console.warn(`[Call] clearing dead VoIP token for astrologer ${receiverId} (${r.reason})`);
              db.from('astrologers')
                .update({ voip_token: null, voip_platform: null })
                .eq('id', receiverId)
                .then(() => {})
                .catch((e) => console.error('[Call] voip token clear error:', e.message));
            }
          })
          .catch((e) => console.error('[Call] voip send error:', e.message));
      }
    })
    .catch((e) => console.error('[Call] push lookup error:', e.message));
}

module.exports = { ringAstrologer };
