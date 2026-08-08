// astrowani_vendors-main/src/utils/useSharedSocket.js
//
// One Socket.io connection shared across every hook/screen that needs live push
// signals from the backend, ref-counted so it disconnects once nothing is using
// it. Same pattern as astrowani_customer-main's useSharedSocket.js — kept here
// rather than shared across the two RN apps since they're separate projects.
import AsyncStorage from '@react-native-async-storage/async-storage';
import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';

let sharedSocket = null;
let refCount = 0;

// Async because join_room now requires an auth token in the handshake (server verifies it
// server-side and joins the caller's real room — see index.js resolveSocketIdentity) — the
// token must be attached before connect(), so it can no longer be created synchronously.
export async function acquireSharedSocket() {
  if (!sharedSocket) {
    const token = await AsyncStorage.getItem('token');
    sharedSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      auth: { token },
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
