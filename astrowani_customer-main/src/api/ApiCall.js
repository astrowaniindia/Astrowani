import axios from 'axios';
const Instance = axios.create({
  // baseURL: 'https://backapi.astrowaniindia.com/',
  baseURL: 'https://astrowani.onrender.com', // Using live Render URL
  // baseURL: 'http://10.0.2.2:4500', // Using local backend
});

// export const api = 'https://backapi.astrowaniindia.com'
export const api = 'https://astrowani.onrender.com'
// export const api = 'http://10.0.2.2:4500'
export default Instance;

export const PROKERALA_API_KEY = 'CLEXsZgZTKo890F2Al0Nn1u3LYDfjdydiX2BFJgE';