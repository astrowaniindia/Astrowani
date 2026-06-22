import axios from 'axios';
import { SOCKET_URL } from '../config/api';

const Instance = axios.create({
  baseURL: SOCKET_URL,
});

export const api = SOCKET_URL;
// export const api = SOCKET_URL
export default Instance;

export const PROKERALA_API_KEY = 'CLEXsZgZTKo890F2Al0Nn1u3LYDfjdydiX2BFJgE';