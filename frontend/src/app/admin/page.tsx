'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import apiClient from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'

interface AdminUser {
  id: string
  username: string
  email: string
  role: string
  ai_quota: number
  is_active: boolean
  created_at: string
}

interface UsersResponse {
  total: number
  limit: number
  offset: number
  users: AdminUser[]
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: any } }).response
    return (
      response?.data?.detail?.error?.message ||
      response?.data?.detail?.message ||
      response?.data?.detail ||
      'Request failed.'
    )
  }
  return 'Request failed.'
}

export default function AdminPage() {
  const router = useRouter()
  const { user, hasHydrated } = useAuthStore()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const limit = 20

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) {
      router.push('/login')
      return
    }
    if (user.role !== 'ADMIN') {
      router.push('/dashboard')
    }
  }, [hasHydrated, router, user])

  useEffect(() => {
    if (!hasHydrated || user?.role !== 'ADMIN') return

    const fetchUsers = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const response = await apiClient.get<UsersResponse>('/api/v1/admin/users', {
          params: {
            limit,
            offset,
            role: role || undefined,
          },
        })
        setUsers(response.data.users)
        setTotal(response.data.total)
        setQuotaDrafts(
          Object.fromEntries(response.data.users.map((item) => [item.id, String(item.ai_quota)]))
        )
      } catch (error) {
        setMessage({ type: 'error', text: getErrorMessage(error) })
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [hasHydrated, offset, role, user?.role])

  const updateQuota = async (target: AdminUser) => {
    const value = Number(quotaDrafts[target.id])
    if (!Number.isInteger(value) || value < 0) {
      setMessage({ type: 'error', text: 'Quota must be a non-negative integer.' })
      return
    }
    setSavingId(target.id)
    try {
      const response = await apiClient.put<AdminUser>(`/api/v1/admin/users/${target.id}/quota`, {
        ai_quota: value,
      })
      setUsers((current) =>
        current.map((item) => (item.id === target.id ? response.data : item))
      )
      setMessage({ type: 'success', text: 'Quota updated.' })
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) })
    } finally {
      setSavingId(null)
    }
  }

  const toggleStatus = async (target: AdminUser) => {
    setSavingId(target.id)
    try {
      const response = await apiClient.put<AdminUser>(`/api/v1/admin/users/${target.id}/status`, {
        is_active: !target.is_active,
      })
      setUsers((current) =>
        current.map((item) => (item.id === target.id ? response.data : item))
      )
      setMessage({ type: 'success', text: 'Status updated.' })
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) })
    } finally {
      setSavingId(null)
    }
  }

  const canGoBack = offset > 0
  const canGoNext = offset + limit < total

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm uppercase tracking-wide text-emerald-300">Administration</p>
            <h1 className="text-3xl font-semibold text-white">Users</h1>
          </div>
          <select
            value={role}
            onChange={(event) => {
              setOffset(0)
              setRole(event.target.value)
            }}
            className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            <option value="">All roles</option>
            <option value="USER">USER</option>
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </header>

        {message && (
          <div
            className={`mb-5 rounded-md border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
                : 'border-red-500/40 bg-red-950 text-red-100'
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="overflow-hidden rounded-md border border-white/10">
          <div className="grid grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_0.8fr_1fr] bg-white/[0.06] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span>Username</span>
            <span>Email</span>
            <span>Role</span>
            <span>Quota</span>
            <span>Status</span>
            <span>Created</span>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No users found.</div>
          ) : (
            users.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.2fr_1.5fr_0.8fr_0.8fr_0.8fr_1fr] items-center gap-3 border-t border-white/10 px-4 py-3 text-sm"
              >
                <span className="font-medium text-white">{item.username}</span>
                <span className="truncate text-slate-300">{item.email}</span>
                <span className="text-slate-300">{item.role}</span>
                <input
                  value={quotaDrafts[item.id] ?? String(item.ai_quota)}
                  onChange={(event) =>
                    setQuotaDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') updateQuota(item)
                  }}
                  onBlur={() => updateQuota(item)}
                  disabled={savingId === item.id}
                  className="w-24 rounded-md border border-white/10 bg-slate-900 px-2 py-1.5 text-white outline-none focus:border-emerald-400 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => toggleStatus(item)}
                  disabled={savingId === item.id}
                  className={`w-24 rounded-md px-2 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                    item.is_active
                      ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                      : 'bg-red-500/15 text-red-200 hover:bg-red-500/25'
                  }`}
                >
                  {item.is_active ? 'Active' : 'Inactive'}
                </button>
                <span className="text-slate-400">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </section>

        <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
          <span>
            Showing {users.length ? offset + 1 : 0}-{offset + users.length} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="rounded-md border border-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setOffset(offset + limit)}
              className="rounded-md border border-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
