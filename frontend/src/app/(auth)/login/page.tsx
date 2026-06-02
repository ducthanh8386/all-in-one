'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axiosInstance, { getApiErrorMessage } from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import { GradientButton } from '@/components/shared/GradientButton'
import { SectionCard } from '@/components/shared/SectionCard'
import { FiLock, FiUser } from 'react-icons/fi'

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
    } catch (err) {
      setError(getApiErrorMessage(err, 'Đăng nhập thất bại. Vui lòng thử lại.'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-gradient-to-br from-primary via-primary-container to-tertiary-container relative overflow-hidden">
        {/* CSS Background Pattern */}
        <div className="absolute inset-0 opacity-20" 
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 20%), 
                              radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0%, transparent 20%),
                              linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.1) 55%, transparent 60%)`,
            backgroundSize: '100% 100%, 100% 100%, 30px 30px'
          }}
        />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-primary font-bold shadow-lg">
              BS
            </div>
            <span className="font-heading font-bold text-2xl text-white">Brain-Sync</span>
          </div>
          
          <h1 className="font-heading font-bold text-5xl text-white leading-tight mb-4 max-w-lg">
            Study smarter.<br />Sync your brain.
          </h1>
          <p className="text-primary-fixed-dim text-lg max-w-md">
            The Intellectual Engine designed to optimize your learning curve and manage your study sessions efficiently.
          </p>
        </div>

        <div className="relative z-10 text-primary-fixed-dim text-sm font-medium">
          © {new Date().getFullYear()} Brain-Sync
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-tertiary flex items-center justify-center text-white font-bold shadow-lg">
              BS
            </div>
            <span className="font-heading font-bold text-2xl text-on-surface">Brain-Sync</span>
          </div>

          <SectionCard className="p-8 lg:p-10 border-none shadow-xl shadow-primary/5 bg-surface-container-lowest">
            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-on-surface mb-2">Welcome Back</h2>
              <p className="text-on-surface-variant text-sm">Enter your credentials to access your workspace.</p>
            </div>

            {error && (
              <div className="bg-error-container text-on-error-container p-4 rounded-xl mb-6 text-sm font-medium border border-error-container/50">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5" htmlFor="username">
                  Username
                </label>
                <div className="relative group">
                  <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all text-sm"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5" htmlFor="password">
                  Password
                </label>
                <div className="relative group">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all text-sm"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <GradientButton
                  type="submit"
                  disabled={isLoading}
                  fullWidth
                  size="lg"
                >
                  {isLoading ? 'Syncing...' : 'Log In'}
                </GradientButton>
              </div>
            </form>

            <div className="mt-8 text-center text-sm font-medium text-on-surface-variant">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="text-primary hover:text-primary-container hover:underline transition-colors"
              >
                Sign up here
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  )
}
