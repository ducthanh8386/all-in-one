'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axiosInstance from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Step 1: Login → lấy access_token
      const res = await axiosInstance.post('/auth/login', {
        username,
        password,
      })

      const { access_token } = res.data

      // Step 2: Lưu token vào store (để interceptor dùng)
      setAuth(null, access_token)

      // Step 3: Gọi /auth/me (interceptor tự gắn Bearer)
      const userRes = await axiosInstance.get('/auth/me')

      // Step 4: Lưu user + token
      setAuth(userRes.data, access_token)

      // Redirect
      router.push('/dashboard')
    } catch (err: any) {
      const message =
        err.response?.data?.detail?.message ||
        err.response?.data?.detail ||
        'Dang nhap that bai. Vui long thu lai.'

      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold mb-8 text-center text-slate-800">
          Brain-Sync
        </h1>

        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-100">
          <h2 className="text-2xl font-bold mb-6 text-slate-800">
            Dang nhap
          </h2>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ten dang nhap
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mat khau
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-semibold p-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isLoading ? 'Dang xu ly...' : 'Dang nhap'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            Chua co tai khoan?{' '}
            <Link
              href="/register"
              className="text-blue-600 font-semibold hover:underline"
            >
              Dang ky ngay
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}