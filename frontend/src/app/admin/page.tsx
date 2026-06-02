'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FiActivity,
  FiBarChart2,
  FiChevronLeft,
  FiChevronRight,
  FiDatabase,
  FiEdit2,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUserPlus,
  FiUserX,
  FiUsers,
  FiX,
} from 'react-icons/fi'

import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'

interface AdminUser {
  id: string
  username: string
  email: string
  role: string
  ai_quota: number
  is_active: boolean
  created_at: string
}

interface AdminStats {
  total_users: number
  active_users: number
  disabled_users: number
  admin_users: number
  moderator_users: number
  regular_users: number
  total_ai_quota: number
  average_ai_quota: number
  total_documents: number
  total_flashcards: number
  total_schedules: number
  recent_users: AdminUser[]
}

interface UsersResponse {
  total: number
  limit: number
  offset: number
  users: AdminUser[]
}

interface UserFormState {
  username: string
  email: string
  password: string
  role: string
  ai_quota: string
  is_active: boolean
}

const emptyUserForm: UserFormState = {
  username: '',
  email: '',
  password: '',
  role: 'USER',
  ai_quota: '100',
  is_active: true,
}

const limit = 20

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export default function AdminPage() {
  const router = useRouter()
  const { user, hasHydrated } = useAuthStore()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string; id: number } | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) router.push('/login')
  }, [hasHydrated, router, user])

  const showToast = (type: 'success' | 'error', text: string) => {
    const id = Date.now()
    setMessage({ type, text, id })
    window.setTimeout(() => setMessage((current) => (current?.id === id ? null : current)), 4000)
  }

  const fetchDashboard = useCallback(async () => {
    if (!hasHydrated || user?.role !== 'ADMIN') {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [statsResponse, usersResponse] = await Promise.all([
        apiClient.get<AdminStats>('/api/v1/admin/stats'),
        apiClient.get<UsersResponse>('/api/v1/admin/users', {
          params: { limit, offset, role: role || undefined },
        }),
      ])

      setStats(statsResponse.data)
      setUsers(usersResponse.data.users)
      setTotal(usersResponse.data.total)
      setQuotaDrafts(Object.fromEntries(usersResponse.data.users.map((item) => [item.id, String(item.ai_quota)])))
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [hasHydrated, offset, role, user?.role])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return users
    return users.filter((item) =>
      [item.username, item.email, item.role].some((value) => value.toLowerCase().includes(normalized))
    )
  }, [query, users])

  const activeRate = stats?.total_users ? Math.round((stats.active_users / stats.total_users) * 100) : 0
  const adminRate = stats?.total_users ? Math.round((stats.admin_users / stats.total_users) * 100) : 0
  const canGoBack = offset > 0
  const canGoNext = offset + limit < total

  const openCreateModal = () => {
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setModalOpen(true)
  }

  const openEditModal = (target: AdminUser) => {
    setEditingUser(target)
    setUserForm({
      username: target.username,
      email: target.email,
      password: '',
      role: target.role,
      ai_quota: String(target.ai_quota),
      is_active: target.is_active,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingUser(null)
    setUserForm(emptyUserForm)
  }

  const submitUserForm = async (event: React.FormEvent) => {
    event.preventDefault()
    const quota = Number(userForm.ai_quota)
    if (!Number.isInteger(quota) || quota < 0) {
      showToast('error', 'Quota phải là số nguyên không âm.')
      return
    }
    if (!editingUser && userForm.password.length < 8) {
      showToast('error', 'Mật khẩu phải có ít nhất 8 ký tự.')
      return
    }

    setSavingId(editingUser?.id ?? 'new')
    try {
      const payload: Record<string, string | number | boolean> = {
        username: userForm.username.trim(),
        email: userForm.email.trim(),
        role: userForm.role,
        ai_quota: quota,
        is_active: userForm.is_active,
      }
      if (userForm.password.trim()) payload.password = userForm.password

      if (editingUser) {
        await apiClient.put<AdminUser>(`/api/v1/admin/users/${editingUser.id}`, payload)
        showToast('success', 'Đã cập nhật user.')
      } else {
        await apiClient.post<AdminUser>('/api/v1/admin/users', payload)
        showToast('success', 'Đã tạo user mới.')
      }
      closeModal()
      await fetchDashboard()
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  const updateQuota = async (target: AdminUser) => {
    const value = Number(quotaDrafts[target.id])
    if (!Number.isInteger(value) || value < 0) {
      showToast('error', 'Quota phải là số nguyên không âm.')
      return
    }
    setSavingId(target.id)
    try {
      await apiClient.put<AdminUser>(`/api/v1/admin/users/${target.id}/quota`, { ai_quota: value })
      showToast('success', 'Đã cập nhật quota.')
      await fetchDashboard()
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  const toggleStatus = async (target: AdminUser) => {
    setSavingId(target.id)
    try {
      await apiClient.put<AdminUser>(`/api/v1/admin/users/${target.id}/status`, { is_active: !target.is_active })
      showToast('success', 'Đã cập nhật trạng thái.')
      await fetchDashboard()
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  const deleteUser = async (target: AdminUser) => {
    if (!window.confirm(`Xoá user "${target.username}" và toàn bộ dữ liệu liên quan?`)) return
    setSavingId(target.id)
    try {
      await apiClient.delete(`/api/v1/admin/users/${target.id}`)
      showToast('success', 'Đã xoá user.')
      await fetchDashboard()
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  if (!hasHydrated) return null

  if (user?.role !== 'ADMIN') {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <EmptyState
            icon={FiShield}
            title="Không có quyền truy cập"
            description="Khu vực này chỉ dành cho tài khoản ADMIN."
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {message && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur-md ${
            message.type === 'success'
              ? 'border-success/20 bg-white text-success'
              : 'border-error/20 bg-white text-error'
          }`}
        >
          {message.text}
        </div>
      )}

      <PageHeader
        title="Admin Dashboard"
        subtitle="Theo dõi toàn hệ thống, kiểm soát user, quota và quyền truy cập."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fetchDashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container"
            >
              <FiRefreshCw /> Làm mới
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-container"
            >
              <FiUserPlus /> Tạo user
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={FiUsers} label="Tổng user" value={stats ? formatNumber(stats.total_users) : '-'} detail={`${activeRate}% đang hoạt động`} />
          <MetricCard icon={FiUserCheck} label="Active" value={stats ? formatNumber(stats.active_users) : '-'} detail={`${stats?.disabled_users ?? 0} tài khoản bị khoá`} tone="success" />
          <MetricCard icon={FiActivity} label="Tổng AI quota" value={stats ? formatNumber(stats.total_ai_quota) : '-'} detail={`Trung bình ${stats?.average_ai_quota ?? 0}/user`} tone="warning" />
          <MetricCard icon={FiShield} label="Admin" value={stats ? formatNumber(stats.admin_users) : '-'} detail={`${adminRate}% tổng tài khoản`} tone="primary" />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard className="p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-on-surface">Phân tích user</h2>
                <p className="text-sm text-on-surface-variant">Trạng thái tài khoản và phân bổ quyền.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary-container/40 text-secondary">
                <FiBarChart2 />
              </div>
            </div>

            {loading ? (
              <LoadingSkeleton type="card" />
            ) : (
              <div className="space-y-5">
                <ProgressRow label="Active" value={stats?.active_users ?? 0} total={stats?.total_users ?? 0} className="bg-success" />
                <ProgressRow label="Disabled" value={stats?.disabled_users ?? 0} total={stats?.total_users ?? 0} className="bg-error" />
                <ProgressRow label="ADMIN" value={stats?.admin_users ?? 0} total={stats?.total_users ?? 0} className="bg-primary" />
                <ProgressRow label="MODERATOR" value={stats?.moderator_users ?? 0} total={stats?.total_users ?? 0} className="bg-secondary" />
                <ProgressRow label="USER" value={stats?.regular_users ?? 0} total={stats?.total_users ?? 0} className="bg-tertiary" />
              </div>
            )}
          </SectionCard>

          <SectionCard className="p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-on-surface">Dữ liệu học tập</h2>
                <p className="text-sm text-on-surface-variant">Tài nguyên do user tạo trên hệ thống.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tertiary-container/30 text-tertiary">
                <FiDatabase />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ContentStat icon={FiFileText} label="Documents" value={stats?.total_documents ?? 0} />
              <ContentStat icon={FiActivity} label="Flashcards" value={stats?.total_flashcards ?? 0} />
              <ContentStat icon={FiDatabase} label="Schedules" value={stats?.total_schedules ?? 0} />
            </div>

            <div className="mt-6 border-t border-outline-variant/30 pt-5">
              <h3 className="mb-3 text-sm font-bold uppercase text-on-surface-variant">User mới nhất</h3>
              <div className="space-y-3">
                {(stats?.recent_users ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-low px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-on-surface">{item.username}</p>
                      <p className="truncate text-xs text-on-surface-variant">{item.email}</p>
                    </div>
                    <RoleBadge role={item.role} />
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </section>

        <SectionCard className="overflow-hidden">
          <div className="border-b border-outline-variant/30 bg-surface-container-low px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-on-surface">Quản lý user</h2>
                <p className="text-sm text-on-surface-variant">Cập nhật role, quota, trạng thái và tài khoản user.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative min-w-[240px]">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm user trên trang này"
                    className="h-10 w-full rounded-lg border border-outline-variant/50 bg-white pl-10 pr-3 text-sm outline-none focus:border-primary"
                  />
                </label>
                <select
                  value={role}
                  onChange={(event) => {
                    setOffset(0)
                    setRole(event.target.value)
                  }}
                  className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 text-sm font-semibold outline-none focus:border-primary"
                >
                  <option value="">Tất cả role</option>
                  <option value="USER">USER</option>
                  <option value="MODERATOR">MODERATOR</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>
          </div>

          <div className="min-h-[420px] overflow-x-auto">
            {loading ? (
              <div className="space-y-4 p-6">
                <LoadingSkeleton type="text" />
                <LoadingSkeleton type="text" />
                <LoadingSkeleton type="text" />
              </div>
            ) : visibleUsers.length === 0 ? (
              <EmptyState icon={FiUsers} title="Không có user" description="Không tìm thấy user phù hợp với bộ lọc hiện tại." />
            ) : (
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="border-b border-outline-variant/30 bg-white text-xs uppercase text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-4 font-bold">User</th>
                    <th className="px-5 py-4 font-bold">Role</th>
                    <th className="px-5 py-4 font-bold">AI quota</th>
                    <th className="px-5 py-4 font-bold">Trạng thái</th>
                    <th className="px-5 py-4 font-bold">Ngày tạo</th>
                    <th className="px-5 py-4 text-right font-bold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {visibleUsers.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-container-low/60">
                      <td className="px-5 py-4">
                        <div className="font-bold text-on-surface">{item.username}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">{item.email}</div>
                      </td>
                      <td className="px-5 py-4">
                        <RoleBadge role={item.role} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            value={quotaDrafts[item.id] ?? String(item.ai_quota)}
                            onChange={(event) => setQuotaDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                            disabled={savingId === item.id}
                            className="h-9 w-24 rounded-lg border border-outline-variant/50 bg-white px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuota(item)}
                            disabled={savingId === item.id || quotaDrafts[item.id] === String(item.ai_quota)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/40 text-primary hover:bg-primary-container/20 disabled:opacity-40"
                            title="Lưu quota"
                          >
                            <FiSave />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleStatus(item)}
                          disabled={savingId === item.id}
                          className={`inline-flex min-w-[92px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                            item.is_active
                              ? 'border-success/20 bg-success/10 text-success'
                              : 'border-error/20 bg-error-container/30 text-error'
                          }`}
                        >
                          {item.is_active ? <FiUserCheck /> : <FiUserX />}
                          {item.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-on-surface-variant">{formatDate(item.created_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            disabled={savingId === item.id}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/40 text-primary hover:bg-primary-container/20 disabled:opacity-40"
                            title="Sửa user"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(item)}
                            disabled={savingId === item.id || item.id === user?.id}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-error/20 text-error hover:bg-error-container/30 disabled:opacity-40"
                            title={item.id === user?.id ? 'Không thể xoá chính bạn' : 'Xoá user'}
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-outline-variant/30 bg-white px-5 py-4 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
            <span>
              Hiển thị <strong className="text-on-surface">{users.length ? offset + 1 : 0}-{offset + users.length}</strong> /{' '}
              <strong className="text-on-surface">{formatNumber(total)}</strong>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-3 py-2 font-semibold hover:bg-surface-container disabled:opacity-40"
              >
                <FiChevronLeft /> Trước
              </button>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => setOffset(offset + limit)}
                className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-3 py-2 font-semibold hover:bg-surface-container disabled:opacity-40"
              >
                Sau <FiChevronRight />
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <SectionCard className="w-full max-w-xl overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-6 py-4">
              <h2 className="text-xl font-bold">{editingUser ? 'Sửa user' : 'Tạo user mới'}</h2>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-variant hover:text-on-surface">
                <FiX />
              </button>
            </div>

            <form onSubmit={submitUserForm} className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Username">
                  <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} required minLength={3} className="admin-input" />
                </Field>
                <Field label="Email">
                  <input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required className="admin-input" />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Role">
                  <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} className="admin-input">
                    <option value="USER">USER</option>
                    <option value="MODERATOR">MODERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </Field>
                <Field label="AI quota">
                  <input type="number" min={0} max={100000} value={userForm.ai_quota} onChange={(event) => setUserForm({ ...userForm, ai_quota: event.target.value })} required className="admin-input" />
                </Field>
                <label className="flex items-end gap-2 rounded-lg border border-outline-variant/40 bg-white px-3 py-2 text-sm font-semibold">
                  <input type="checkbox" checked={userForm.is_active} onChange={(event) => setUserForm({ ...userForm, is_active: event.target.checked })} />
                  Active
                </label>
              </div>

              <Field label={`Password ${editingUser ? '(để trống nếu không đổi)' : ''}`}>
                <input type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} required={!editingUser} minLength={editingUser ? undefined : 8} className="admin-input" />
              </Field>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold">
                  Huỷ
                </button>
                <button type="submit" disabled={savingId === 'new' || savingId === editingUser?.id} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60">
                  {savingId === 'new' || savingId === editingUser?.id ? 'Đang lưu...' : 'Lưu user'}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}
    </AppShell>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'success' | 'warning' | 'primary'
}) {
  const toneClass = {
    neutral: 'bg-secondary-container/35 text-secondary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    primary: 'bg-primary-container/20 text-primary',
  }[tone]

  return (
    <SectionCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-on-surface-variant">{label}</p>
          <p className="mt-2 text-3xl font-bold text-on-surface">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon />
        </div>
      </div>
      <p className="mt-4 text-sm text-on-surface-variant">{detail}</p>
    </SectionCard>
  )
}

function ProgressRow({ label, value, total, className }: { label: string; value: number; total: number; className: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-on-surface">{label}</span>
        <span className="text-on-surface-variant">{formatNumber(value)} ({percent}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function ContentStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-white p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-primary">
        <Icon />
      </div>
      <p className="text-2xl font-bold text-on-surface">{formatNumber(value)}</p>
      <p className="text-sm font-semibold text-on-surface-variant">{label}</p>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const className =
    role === 'ADMIN'
      ? 'bg-primary-container/20 text-primary'
      : role === 'MODERATOR'
        ? 'bg-secondary-container/35 text-secondary'
        : 'bg-surface-container text-on-surface-variant'

  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${className}`}>{role}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-on-surface">
      <span>{label}</span>
      {children}
    </label>
  )
}
