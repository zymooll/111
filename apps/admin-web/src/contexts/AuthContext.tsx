import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { adminApi, adminTokenKey } from '../api/client';
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

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(username, password) {
      setLoading(true);
      try {
        const result = await adminApi.login(username, password);
        sessionStorage.setItem(adminTokenKey, result.accessToken);
        sessionStorage.setItem(adminUserKey, JSON.stringify(result.user));
        setUser(result.user);
      } finally {
        setLoading(false);
      }
    },
    logout() {
      sessionStorage.removeItem(adminTokenKey);
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
