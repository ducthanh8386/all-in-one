'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { StatusBadge, type DocStatus } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { FiDownload, FiEdit2, FiEye, FiFileText, FiLayers, FiMessageSquare, FiSearch, FiTarget, FiTrash2, FiUploadCloud } from 'react-icons/fi'

interface DocumentItem {
  id: number
  title: string
  original_filename?: string | null
  file_type?: string | null
  file_size?: number | null
  status: DocStatus
  created_at: string
  error_message?: string | null
}

function formatBytes(value?: number | null) {
  if (!value) return 'Unknown size'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export default function WorkspacePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3500)
  }

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get<DocumentItem[]>('/api/v1/documents')
      setDocuments(res.data)
    } catch {
      showToast('error', 'Không tải được danh sách tài liệu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const uploadFile = async (file: File) => {
    const allowed = ['pdf', 'docx', 'txt']
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !allowed.includes(ext)) {
      showToast('error', 'Chỉ hỗ trợ PDF, Word (.docx), TXT.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('error', 'File vượt quá giới hạn 20MB.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const res = await apiClient.post('/api/v1/documents/upload', formData)
      const created: DocumentItem = {
        id: res.data.document_id,
        title: res.data.title,
        original_filename: res.data.original_filename,
        file_type: res.data.file_type,
        file_size: res.data.file_size,
        status: res.data.status,
        created_at: new Date().toISOString(),
      }
      setDocuments((prev) => [created, ...prev])
      showToast('success', 'Tài liệu đã được lưu vào workspace.')
    } catch (error) {
      showToast('error', getApiErrorMessage(error, 'Upload thất bại.'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const downloadDocument = async (doc: DocumentItem) => {
    try {
      const res = await apiClient.get(`/api/v1/documents/${doc.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.original_filename || `${doc.title}.${doc.file_type || 'bin'}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast('error', 'Không tải được file.')
    }
  }

  const viewDocument = async (doc: DocumentItem) => {
    try {
      const res = await apiClient.get(`/api/v1/documents/${doc.id}/download`, { responseType: 'blob' })
      const type = doc.file_type === 'pdf'
        ? 'application/pdf'
        : doc.file_type === 'txt'
          ? 'text/plain;charset=utf-8'
          : res.data.type || 'application/octet-stream'
      const url = URL.createObjectURL(new Blob([res.data], { type }))
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        showToast('error', 'Trình duyệt đã chặn popup xem file.')
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      showToast('error', getApiErrorMessage(error, 'Không mở được file.'))
    }
  }

  const deleteDocument = async (docId: number) => {
    if (!confirm('Xóa tài liệu này và toàn bộ flashcards liên quan?')) return
    try {
      await apiClient.delete(`/api/v1/documents/${docId}`)
      setDocuments((prev) => prev.filter((doc) => doc.id !== docId))
      showToast('success', 'Đã xóa tài liệu.')
    } catch {
      showToast('error', 'Xóa tài liệu thất bại.')
    }
  }

  const renameDocument = async (doc: DocumentItem) => {
    const nextTitle = window.prompt('Nhập tên hiển thị mới cho tài liệu:', doc.title)
    if (nextTitle === null) return
    const title = nextTitle.trim()
    if (!title) {
      showToast('error', 'Tên tài liệu không được để trống.')
      return
    }

    try {
      const res = await apiClient.put<DocumentItem>(`/api/v1/documents/${doc.id}`, { title })
      setDocuments((prev) => prev.map((item) => (item.id === doc.id ? res.data : item)))
      showToast('success', 'Đã cập nhật tài liệu.')
    } catch (error) {
      showToast('error', getApiErrorMessage(error, 'Cập nhật tài liệu thất bại.'))
    }
  }

  const filtered = documents.filter((doc) => {
    const name = (doc.original_filename || doc.title).toLowerCase()
    if (query && !name.includes(query.toLowerCase())) return false
    if (filter !== 'All' && doc.file_type?.toUpperCase() !== filter) return false
    return true
  })

  return (
    <AppShell>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
          {toast.message}
        </div>
      )}

      <PageHeader
        title="Workspace"
        subtitle="Document Workspace cho PDF, Word (.docx), TXT. AI là tính năng tương lai."
        actions={<GradientButton onClick={() => inputRef.current?.click()}><FiUploadCloud className="mr-2" /> Upload</GradientButton>}
      />

      <SectionCard className="mb-8 border-2 border-dashed border-outline-variant/50 p-8 text-center">
        <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(event) => event.target.files?.[0] && uploadFile(event.target.files[0])} />
        <FiUploadCloud className="mx-auto mb-3 text-4xl text-primary" />
        <h2 className="mb-2 font-heading text-xl font-bold text-on-surface">Upload tài liệu học tập</h2>
        <p className="mb-5 text-sm text-on-surface-variant">Hỗ trợ PDF, Word (.docx), TXT - tối đa 20MB</p>
        <GradientButton onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Đang upload...' : 'Chọn file'}
        </GradientButton>
      </SectionCard>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          {['All', 'PDF', 'DOCX', 'TXT'].map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${filter === item ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/50 bg-surface text-on-surface-variant'}`}>
              {item}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents..." className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest py-2 pl-10 pr-4 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <LoadingSkeleton key={item} type="card" className="h-44" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FiFileText} title="No documents found" description="Upload tài liệu để dùng làm nguồn tham chiếu khi tự tạo flashcard." />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc) => (
            <SectionCard key={doc.id} className="flex flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-bold text-on-surface" title={doc.original_filename || doc.title}>{doc.original_filename || doc.title}</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {(doc.file_type || 'file').toUpperCase()} · {formatBytes(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
              </div>

              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-outline-variant/30 pt-4">
                <Link href={`/workspace/${doc.id}`} className="rounded-lg bg-primary-container px-3 py-2 text-center text-sm font-semibold text-on-primary-container">
                  Flashcards
                </Link>
                <button onClick={() => viewDocument(doc)} className="rounded-lg bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary-container">
                  <FiEye className="mr-1 inline" /> View
                </button>
                <Link href={`/flashcards/quiz?doc_id=${doc.id}`} className="rounded-lg bg-surface-container-highest px-3 py-2 text-center text-sm font-semibold text-on-surface">
                  <FiTarget className="mr-1 inline" /> Quiz
                </Link>
                <button onClick={() => downloadDocument(doc)} className="rounded-lg bg-surface-container-highest px-3 py-2 text-sm font-semibold text-on-surface">
                  <FiDownload className="mr-1 inline" /> Download
                </button>
                <button onClick={() => renameDocument(doc)} className="rounded-lg bg-surface-container-highest px-3 py-2 text-sm font-semibold text-on-surface">
                  <FiEdit2 className="mr-1 inline" /> Rename
                </button>
                <button onClick={() => showToast('success', 'Tính năng AI đang phát triển.')} className="rounded-lg bg-surface-container-highest px-3 py-2 text-sm font-semibold text-on-surface-variant">
                  <FiMessageSquare className="mr-1 inline" /> AI Chat
                </button>
                <Link href={`/workspace/${doc.id}?tab=flashcards`} className="rounded-lg bg-surface-container-highest px-3 py-2 text-center text-sm font-semibold text-on-surface">
                  <FiLayers className="mr-1 inline" /> Create
                </Link>
                <button onClick={() => deleteDocument(doc.id)} className="rounded-lg bg-error-container/40 px-3 py-2 text-sm font-semibold text-error">
                  <FiTrash2 className="mr-1 inline" /> Delete
                </button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  )
}
