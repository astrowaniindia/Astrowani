import axios from 'axios';
const Instance = axios.create({
  baseURL: 'https://astrowani.onrender.com',
  // baseURL: 'https://f92c77194ad6.ngrok-free.app/',
  timeout: 15000, // 15 seconds timeout
});
// export const newInstance = axios.create({
//   baseURL: 'http://localhost:8080/',
// });

export const api = "https://astrowani.onrender.com"
// export const api = "https://f92c77194ad6.ngrok-free.app"
// export const api = "https://atro-server.onrender.com"
export default Instance;
