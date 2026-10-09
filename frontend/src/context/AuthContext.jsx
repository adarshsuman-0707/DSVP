import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, loginUser, registerUser } from '../services/api';

const AuthContext = createContext(null);

const hasStoredToken = () => {
  try { return !!localStorage.getItem('dsvp_token'); } catch { return false; }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only "loading" when there is actually a session to verify. Logged-out
  // visitors get the real page on the first paint instead of a blank frame.
  const [loading, setLoading] = useState(hasStoredToken);

  useEffect(() => {
    if (!hasStoredToken()) return;
    let cancelled = false;
    getMe()
      .then((res) => { if (!cancelled) setUser(res.data.user); })
      .catch((err) => {
        // Only an auth rejection invalidates the token; a network blip or 5xx
        // must not silently log the user out.
        const status = err?.response?.status;
        if (status === 401 || status === 403) localStorage.removeItem('dsvp_token');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await loginUser({ email, password });
    localStorage.setItem('dsvp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (fullName, email, password) => {
    const res = await registerUser({ fullName, email, password });
    localStorage.setItem('dsvp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // Called after OTP-verified signup — token is already stored, just load user
  const loadUser = useCallback(async () => {
    try {
      const res = await getMe();
      setUser(res.data.user);
      return res.data.user;
    } catch (_) {
      localStorage.removeItem('dsvp_token');
      setUser(null);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dsvp_token');
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedFields) => {
    setUser(prev => (prev ? { ...prev, ...updatedFields } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser, loadUser }),
    [user, loading, login, register, logout, updateUser, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
