import { createContext, useContext, useEffect, useState } from 'react';
import { getMe, loginUser, registerUser } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('dsvp_token');
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('dsvp_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await loginUser({ email, password });
    localStorage.setItem('dsvp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  async function register(fullName, email, password) {
    const res = await registerUser({ fullName, email, password });
    localStorage.setItem('dsvp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  // Called after OTP-verified signup — token is already stored, just load user
  async function loadUser() {
    try {
      const res = await getMe();
      setUser(res.data.user);
      return res.data.user;
    } catch (_) {
      localStorage.removeItem('dsvp_token');
      setUser(null);
    }
  }

  function logout() {
    localStorage.removeItem('dsvp_token');
    setUser(null);
  }

  function updateUser(updatedFields) {
    setUser(prev => prev ? { ...prev, ...updatedFields } : prev);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
