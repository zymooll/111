import { App as AntApp } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { adminApi, clearSession, onSessionExpired, storeSession } from '../api/client';
import type { AdminUser } from '../types';

const adminUserKey = 'campus-foodie-admin-user';

function readUser(): AdminUser | null {
  const value = sessionStorage.getItem(adminUserKey);
  if (!value) return null;
  try {
    return JSON.parse(value) as AdminUser;
  } catch {
    sessionStorage.removeItem(adminUserKey);
    return null;
  }
}

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AdminUser | null>(() => readUser());
  const [loading, setLoading] = useState(false);
  const { message } = AntApp.useApp();

  useEffect(() => onSessionExpired(() => {
    sessionStorage.removeItem(adminUserKey);
    setUser(null);
    message.warning('登录状态已过期，请重新登录');
  }), [message]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(username, password) {
      setLoading(true);
      try {
        const result = await adminApi.login(username, password);
        storeSession({ accessToken: result.accessToken, refreshToken: result.refreshToken });
        sessionStorage.setItem(adminUserKey, JSON.stringify(result.user));
        setUser(result.user);
      } finally {
        setLoading(false);
      }
    },
    logout() {
      clearSession();
      sessionStorage.removeItem(adminUserKey);
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
