/**
 * Zustand store for authentication state
 * TODO: Implement in Phase 1
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  email: string
  role: string
  ai_quota: number
}

interface AuthStore {
  user: User | null
  accessToken: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  updateQuota: (quota: number) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, token) => set({ user, accessToken: token }),
      clearAuth: () => set({ user: null, accessToken: null }),
      updateQuota: (quota) =>
        set((state) => ({
          user: state.user ? { ...state.user, ai_quota: quota } : null,
        })),
    }),
    {
      name: 'auth-storage',
    }
  )
)
