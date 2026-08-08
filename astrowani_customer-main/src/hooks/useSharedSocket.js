// astrowani_customer-main/src/hooks/useSharedSocket.js
//
// One Socket.io connection shared across every hook/screen that needs live push
// signals from the backend (astrologer-list changes, notification badges, ...).
// Extracted out of useAstrologerListSync.js so a second consumer doesn't open a
// second physical socket — that would just move the "one connection per concern"
// problem this file exists to avoid down one layer. Ref-counted: the underlying
// socket disconnects once nothing is using it anymore.
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

let sharedSocket = null;
let refCount = 0;

export function acquireSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
  }
  refCount += 1;
  return sharedSocket;
}

export function releaseSharedSocket() {
  refCount -= 1;
  if (refCount <= 0) {
    refCount = 0;
    if (sharedSocket) {
      sharedSocket.disconnect();
      sharedSocket = null;
    }
  }
}
