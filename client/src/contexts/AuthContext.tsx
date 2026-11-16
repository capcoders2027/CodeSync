'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '../lib/apiBase';

interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  avatarUrl?: string;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, user: User) => void;
  logout: () => void;
  updateUser: (updatedUser: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${getApiBase()}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.data.user);
          localStorage.setItem('user', JSON.stringify(data.data.user));
        } else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      } catch (e) {
        console.error('Auth initialization failed', e);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = (accessToken: string, user: User) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    window.location.href = '/dashboard';
  };

  const logout = async () => {
    try {
      await fetch(`${getApiBase()}/auth/logout`, { method: 'POST' });
    } catch (e) {
      console.error('Logout failed', e);
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/auth/login';
  };

  const updateUser = (updatedFields: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedFields } : null));
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
