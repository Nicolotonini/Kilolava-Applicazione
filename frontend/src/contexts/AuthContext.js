import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEVICE_KEY = 'klv_device_id';
const LAST_USER_KEY = 'klv_last_username';

export const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

export const getDeviceName = () => {
  const ua = navigator.userAgent || '';
  const kind = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${kind} · ${browser}`;
};

export const getLastUsername = () => localStorage.getItem(LAST_USER_KEY) || '';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('kilolava_token'));
  const [loading, setLoading] = useState(true);

  // Set up axios interceptor for auth header
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        const currentToken = localStorage.getItem('kilolava_token');
        if (currentToken && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${currentToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);

  // Fetch current user on mount
  const fetchUser = useCallback(async () => {
    const storedToken = localStorage.getItem('kilolava_token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      });
      setUser(response.data);
      setToken(storedToken);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('kilolava_token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Salva token + utente e ricorda l'ultimo username usato su questo dispositivo
  const commitSession = (data) => {
    localStorage.setItem('kilolava_token', data.access_token);
    const uname = data.user?.login_username || data.user?.email;
    if (uname) localStorage.setItem(LAST_USER_KEY, uname);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  // Login con password SENZA committare la sessione (per il passaggio "imposta PIN")
  const loginWithPassword = async (username, password) => {
    const response = await axios.post(`${API}/auth/login`, {
      username, password, device_id: getDeviceId(), device_name: getDeviceName(),
    });
    return response.data;
  };

  const login = async (username, password) => commitSession(await loginWithPassword(username, password));

  const pinLogin = async (username, pin) => {
    const response = await axios.post(`${API}/auth/pin-login`, {
      username, pin, device_id: getDeviceId(),
    });
    return commitSession(response.data);
  };

  const activateAccount = async ({ username, code, newPassword, pin }) => {
    const response = await axios.post(`${API}/auth/activate`, {
      username, code, new_password: newPassword, pin,
      device_id: getDeviceId(), device_name: getDeviceName(),
    });
    return commitSession(response.data);
  };

  const loginOptions = async (username) => {
    const response = await axios.post(`${API}/auth/login-options`, {
      username, device_id: getDeviceId(),
    });
    return response.data;
  };

  // tokenOverride: usato prima del commit della sessione (setup PIN post-login)
  const setPinRemote = async (password, pin, tokenOverride) => {
    await axios.post(`${API}/auth/set-pin`,
      { password, pin, device_id: getDeviceId(), device_name: getDeviceName() },
      tokenOverride ? { headers: { Authorization: `Bearer ${tokenOverride}` } } : undefined);
  };

  const logout = () => {
    localStorage.removeItem('kilolava_token');
    setToken(null);
    setUser(null);
  };

  const updateUser = async (updates) => {
    const response = await axios.put(`${API}/auth/me`, updates);
    setUser(response.data);
    return response.data;
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    loginWithPassword,
    commitSession,
    pinLogin,
    activateAccount,
    loginOptions,
    setPinRemote,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
