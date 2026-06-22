import axios from 'axios';
import { SOCKET_URL } from '../config/api';

const Instance = axios.create({
  baseURL: SOCKET_URL,
  // baseURL: 'https://f92c77194ad6.ngrok-free.app/',
  timeout: 15000, // 15 seconds timeout
});

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;
