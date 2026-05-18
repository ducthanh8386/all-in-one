'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import axiosInstance from '@/lib/axios'

export function Header() {
  const { user, clearAuth } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    try {
      await axiosInstance.post('/auth/logout')
    } catch (err) {
      console.error('Logout error', err)
    } finally {
      clearAuth()
      router.push('/login')
    }
  }

  if (pathname === '/login' || pathname === '/register') {
    return null
  }

  return (
    <header className="bg-white shadow-sm border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/dashboard" className="text-xl font-bold text-slate-800">
              Brain-Sync
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            {user?.role === 'ADMIN' && (
              <Link
                href="/admin"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Admin
              </Link>
            )}
            {user ? (
              <>
                <span className="text-sm text-slate-600">
                  Xin chao, <span className="font-semibold text-slate-800">{user.username}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-600 font-medium hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-md transition"
                >
                  Dang xuat
                </button>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 font-medium hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-md transition"
              >
                Dang xuat
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
