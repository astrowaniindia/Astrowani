import axios from 'axios';
import { SOCKET_URL } from '../config/api';

const Instance = axios.create({
  baseURL: SOCKET_URL,
  // baseURL: 'https://f92c77194ad6.ngrok-free.app/',
  // Raised from 15s (audit 2026-08-18). The backend's EnableX send had no
  // timeout at all, so a slow carrier meant this client gave up first: the app
  // showed "Failed to send OTP" while the backend went on to send the SMS and
  // store the row. The user got a code AND an error, tapped Resend, and hit the
  // 45s cooldown 429.
  //
  // 20s is deliberately LONGER than the backend's own 10s EnableX timeout, so
  // the backend is always the party that decides a send failed and can roll the
  // stored OTP back. Never drop this below that.
  timeout: 20000,
});

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;
