import axios from 'axios';
const Instance = axios.create({
  baseURL: 'https://astrowani.onrender.com',
  // baseURL: 'http://10.0.2.2:4500',
  // baseURL: 'https://f92c77194ad6.ngrok-free.app/',
  timeout: 15000, // 15 seconds timeout
});

export const api = "https://astrowani.onrender.com"
// export const api = 'http://10.0.2.2:4500'
export default Instance;
