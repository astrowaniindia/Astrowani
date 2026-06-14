import axios from 'axios';
const Instance = axios.create({
  // baseURL: 'https://backapi.astrowaniindia.com/',
  baseURL: 'https://astrowani.onrender.com', // Using live Render URL
});

// export const api = 'https://backapi.astrowaniindia.com'
export const api = 'https://astrowani.onrender.com'
export default Instance;

export const PROKERALA_API_KEY = 'CLEXsZgZTKo890F2Al0Nn1u3LYDfjdydiX2BFJgE';