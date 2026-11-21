import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4500';

const client = axios.create({ baseURL });

// Attach the admin JWT (stored at login) to every request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, drop the token so the route guard kicks the user back to /login.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      // manu.astrowani.com serves the admin at the root; the backend also mounts the
      // same build under /admin. Send the user to the login page of whichever one
      // they are on -- /admin/login at the root is a blank page (two path segments).
      const login = location.pathname.startsWith('/admin/') ? '/admin/login' : '/login';
      if (location.pathname !== login) location.href = login;
    }
    return Promise.reject(err);
  }
);

export default client;
