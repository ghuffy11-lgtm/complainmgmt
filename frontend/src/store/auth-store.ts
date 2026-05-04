import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Me } from '../types/api';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: Me | null;
  setSession: (s: { accessToken: string; refreshToken: string; user: Me }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: Me) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (s) => set(s),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'cts-auth' },
  ),
);
