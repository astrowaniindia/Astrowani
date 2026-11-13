import { createContext, useContext, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('admin_user')) || null; } catch { return null; }
  });

  // `totp` is the authenticator-app code, sent only once the server has asked for it.
  const login = async (email, password, totp) => {
    const { data } = await client.post('/api/admin/login', totp ? { email, password, totp } : { email, password });
    if (!data?.success) throw new Error(data?.message || 'Login failed');
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_user', JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data.admin;
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setAdmin(null);
  };

  const isAuthed = !!localStorage.getItem('admin_token');

  return (
    <AuthContext.Provider value={{ admin, login, logout, isAuthed }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
