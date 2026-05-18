/**
 * Providers wrapper for client-side providers
 * Handles auth verification and route protection
 */

'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import axiosInstance from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'

// Prevent multiple /auth/me calls at startup
let authVerificationInProgress = false

function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { setAuth, clearAuth, accessToken, hasHydrated } = useAuthStore()

  useEffect(() => {
    if (!hasHydrated) {
      return
    }

    if (authVerificationInProgress) {
      return
    }

    // Skip verification on auth pages
    if (pathname === '/login' || pathname === '/register') {
      return
    }

    const verifyAuth = async () => {
      authVerificationInProgress = true
      try {
        // If we have accessToken in store, verify it's still valid
        if (accessToken) {
          try {
            const res = await axiosInstance.get('/auth/me')
            setAuth(res.data, accessToken)
            return
          } catch (err) {
            // Token is invalid, clear and redirect
            clearAuth()
            router.push('/login')
            return
          }
        }

        // No token in store, check if refresh cookie exists
        // If yes, try to get new access_token
        try {
          const res = await axiosInstance.post('/auth/refresh')
          const newAccessToken = res.data.access_token
          // Re-fetch user info with new token
          const userRes = await axiosInstance.get('/auth/me', {
            headers: { Authorization: `Bearer ${newAccessToken}` },
          })
          setAuth(userRes.data, newAccessToken)
        } catch (err) {
          // No valid refresh token or refresh failed
          clearAuth()
          if (pathname !== '/login' && pathname !== '/register') {
            router.push('/login')
          }
        }
      } finally {
        authVerificationInProgress = false
      }
    }

    verifyAuth()
  }, [accessToken, clearAuth, hasHydrated, pathname, router, setAuth])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
