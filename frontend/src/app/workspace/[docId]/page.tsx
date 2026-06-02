'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { StatusBadge, type DocStatus } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { FiArrowLeft, FiDownload, FiEdit2, FiEye, FiFileText, FiMessageSquare, FiPlus, FiSearch, FiTarget, FiTrash2, FiUploadCloud } from 'react-icons/fi'

interface DocumentItem {
  id: number
  title: string
  original_filename?: string | null
  file_type?: string | null
  file_size?: number | null
  status: DocStatus
  created_at: string
}

interface Flashcard {
  id: number
  doc_id: number | null
  front_text: string
  back_text: string
  tag?: string | null
  next_review_date: string
}

type Tab = 'flashcards' | 'import' | 'quiz' | 'ai'

const emptyForm = { front_text: '', back_text: '', tag: '' }

function csvTemplate() {
  return 'front,back,tag\n"Deadlock là gì?","Tình trạng các tiến trình chờ nhau vô hạn.","Operating System"\n"TCP là gì?","Transmission Control Protocol.","Network"'
}

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const docId = Number(params?.docId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null)
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('flashcards')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3500)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [docRes, cardsRes] = await Promise.all([
        apiClient.get<DocumentItem>(`/api/v1/documents/${docId}`),
        apiClient.get<Flashcard[]>(`/api/v1/flashcards?doc_id=${docId}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
      ])
      setDocumentItem(docRes.data)
      setFlashcards(cardsRes.data)
    } catch {
      showToast('error', 'Không tải được tài liệu.')
    } finally {
      setLoading(false)
    }
  }, [docId, query])

  useEffect(() => {
    if (docId) loadData()
  }, [docId, loadData])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const submitCard = async () => {
    if (!form.front_text.trim() || !form.back_text.trim()) {
      showToast('error', 'Front và Back là bắt buộc.')
      return
    }
    try {
      if (editingId) {
        const res = await apiClient.put<Flashcard>(`/api/v1/flashcards/${editingId}`, form)
        setFlashcards((prev) => prev.map((card) => card.id === editingId ? res.data : card))
        showToast('success', 'Đã cập nhật flashcard.')
      } else {
        const res = await apiClient.post<Flashcard>('/api/v1/flashcards', { ...form, doc_id: docId })
        setFlashcards((prev) => [res.data, ...prev])
        showToast('success', 'Đã tạo flashcard.')
      }
      resetForm()
    } catch {
      showToast('error', 'Lưu flashcard thất bại.')
    }
  }

  const editCard = (card: Flashcard) => {
    setEditingId(card.id)
    setForm({ front_text: card.front_text, back_text: card.back_text, tag: card.tag || '' })
    setTab('flashcards')
  }

  const deleteCard = async (cardId: number) => {
    if (!confirm('Xóa flashcard này?')) return
    try {
      await apiClient.delete(`/api/v1/flashcards/${cardId}`)
      setFlashcards((prev) => prev.filter((card) => card.id !== cardId))
      showToast('success', 'Đã xóa flashcard.')
    } catch {
      showToast('error', 'Xóa flashcard thất bại.')
    }
  }

  const deleteDocument = async () => {
    if (!confirm('Xóa tài liệu này và toàn bộ flashcards liên quan?')) return
    try {
      await apiClient.delete(`/api/v1/documents/${docId}`)
      router.push('/workspace')
    } catch {
      showToast('error', 'Xóa tài liệu thất bại.')
    }
  }

  const renameDocument = async () => {
    if (!documentItem) return
    const nextTitle = window.prompt('Nhập tên hiển thị mới cho tài liệu:', documentItem.title)
    if (nextTitle === null) return
    const title = nextTitle.trim()
    if (!title) {
      showToast('error', 'Tên tài liệu không được để trống.')
      return
    }

    try {
      const res = await apiClient.put<DocumentItem>(`/api/v1/documents/${docId}`, { title })
      setDocumentItem(res.data)
      showToast('success', 'Đã cập nhật tài liệu.')
    } catch (error) {
      showToast('error', getApiErrorMessage(error, 'Cập nhật tài liệu thất bại.'))
    }
  }

  const downloadDocument = async () => {
    if (!documentItem) return
    try {
      const res = await apiClient.get(`/api/v1/documents/${docId}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = window.document.createElement('a')
      link.href = url
      link.download = documentItem.original_filename || `${documentItem.title}.${documentItem.file_type || 'bin'}`
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast('error', 'Không tải được file.')
    }
  }

  const viewDocument = async () => {
    if (!documentItem) return
    try {
      const res = await apiClient.get(`/api/v1/documents/${docId}/download`, { responseType: 'blob' })
      const type = documentItem.file_type === 'pdf'
        ? 'application/pdf'
        : documentItem.file_type === 'txt'
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

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8;' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'flashcards_template.csv'
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const importCsv = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('doc_id', String(docId))
    try {
      const res = await apiClient.post('/api/v1/flashcards/import', formData)
      setImportResult(`Đã tạo ${res.data.created} thẻ, bỏ qua ${res.data.skipped} dòng.`)
      await loadData()
    } catch {
      showToast('error', 'Import CSV thất bại.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const dueCount = flashcards.filter((card) => new Date(card.next_review_date) <= new Date()).length

  if (loading) {
    return (
      <AppShell>
        <LoadingSkeleton type="card" className="h-40" />
      </AppShell>
    )
  }

  if (!documentItem) {
    return (
      <AppShell>
        <EmptyState icon={FiFileText} title="Document not found" description="Tài liệu không tồn tại hoặc bạn không có quyền truy cập." />
      </AppShell>
    )
  }

  return (
    <AppShell>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
          {toast.message}
        </div>
      )}

      <div className="mb-6 flex items-start gap-4">
        <Link href="/workspace" className="rounded-lg p-2 text-on-surface-variant hover:bg-primary-container/20 hover:text-primary"><FiArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl font-bold text-on-surface">{documentItem.original_filename || documentItem.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
            <span>{(documentItem.file_type || 'file').toUpperCase()}</span>
            <span>{new Date(documentItem.created_at).toLocaleDateString()}</span>
            <StatusBadge status={documentItem.status} />
          </div>
        </div>
        <button onClick={renameDocument} className="rounded-lg bg-surface-container-highest px-3 py-2 text-sm font-semibold"><FiEdit2 className="mr-1 inline" /> Rename</button>
        <button onClick={viewDocument} className="rounded-lg bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary-container"><FiEye className="mr-1 inline" /> View</button>
        <button onClick={downloadDocument} className="rounded-lg bg-surface-container-highest px-3 py-2 text-sm font-semibold"><FiDownload className="mr-1 inline" /> Download</button>
        <button onClick={deleteDocument} className="rounded-lg bg-error-container/40 px-3 py-2 text-sm font-semibold text-error"><FiTrash2 className="mr-1 inline" /> Delete</button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SectionCard className="p-4"><p className="text-sm text-on-surface-variant">Flashcards</p><p className="text-3xl font-bold">{flashcards.length}</p></SectionCard>
        <SectionCard className="p-4"><p className="text-sm text-on-surface-variant">Due today</p><p className="text-3xl font-bold text-primary">{dueCount}</p></SectionCard>
        <SectionCard className="p-4"><p className="text-sm text-on-surface-variant">AI</p><p className="text-sm font-semibold text-on-surface">Tính năng AI đang phát triển</p></SectionCard>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-outline-variant/30">
        {[
          ['flashcards', 'Flashcards'],
          ['import', 'Import CSV'],
          ['quiz', 'Quiz Practice'],
          ['ai', 'AI Tools'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'flashcards' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <SectionCard className="p-5">
            <h2 className="mb-4 font-heading text-lg font-bold">{editingId ? 'Edit flashcard' : 'Create flashcard'}</h2>
            <div className="space-y-3">
              <textarea value={form.front_text} onChange={(event) => setForm({ ...form, front_text: event.target.value })} placeholder="Front" className="h-24 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <textarea value={form.back_text} onChange={(event) => setForm({ ...form, back_text: event.target.value })} placeholder="Back" className="h-28 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Tag (optional)" className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <div className="flex gap-2">
                <GradientButton onClick={submitCard} className="flex-1"><FiPlus className="mr-2" /> {editingId ? 'Save' : 'Create'}</GradientButton>
                {editingId && <button onClick={resetForm} className="rounded-lg border border-outline-variant/50 px-4 text-sm font-semibold">Cancel</button>}
              </div>
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search front, back, tag..." className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest py-2 pl-10 pr-4 text-sm outline-none focus:border-primary" />
              </div>
              <button onClick={loadData} className="rounded-lg bg-surface-container-highest px-4 py-2 text-sm font-semibold">Search</button>
            </div>

            {flashcards.length === 0 ? (
              <EmptyState icon={FiFileText} title="No flashcards" description="Tạo thủ công hoặc import CSV để bắt đầu." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-outline-variant/30 text-on-surface-variant">
                    <tr><th className="py-3">Front</th><th>Back</th><th>Tag</th><th className="text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {flashcards.map((card) => (
                      <tr key={card.id}>
                        <td className="max-w-[220px] truncate py-3 font-medium">{card.front_text}</td>
                        <td className="max-w-[280px] truncate text-on-surface-variant">{card.back_text}</td>
                        <td className="text-on-surface-variant">{card.tag || '-'}</td>
                        <td className="text-right">
                          <button onClick={() => editCard(card)} className="p-2 text-primary"><FiEdit2 /></button>
                          <button onClick={() => deleteCard(card.id)} className="p-2 text-error"><FiTrash2 /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'import' && (
        <SectionCard className="max-w-2xl p-8 text-center">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
          <FiUploadCloud className="mx-auto mb-4 text-4xl text-primary" />
          <h2 className="mb-2 font-heading text-xl font-bold">Import CSV</h2>
          <p className="mb-6 text-sm text-on-surface-variant">Format: front,back,tag. Tag là optional.</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <GradientButton onClick={() => fileInputRef.current?.click()}>Import CSV</GradientButton>
            <button onClick={downloadTemplate} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold"><FiDownload className="mr-1 inline" /> Download template</button>
          </div>
          {importResult && <p className="mt-5 rounded-lg bg-success-container/40 p-3 text-sm font-semibold text-on-success-container">{importResult}</p>}
        </SectionCard>
      )}

      {tab === 'quiz' && (
        <SectionCard className="max-w-xl p-8 text-center">
          <FiTarget className="mx-auto mb-4 text-4xl text-primary" />
          <h2 className="mb-2 font-heading text-xl font-bold">Quiz Practice</h2>
          <p className="mb-6 text-sm text-on-surface-variant">Quiz được sinh từ flashcards có sẵn trong tài liệu này, không dùng AI.</p>
          {flashcards.length < 4 ? (
            <p className="rounded-lg bg-error-container/30 p-3 text-sm font-semibold text-error">Cần ít nhất 4 flashcards để tạo quiz trắc nghiệm.</p>
          ) : (
            <Link href={`/flashcards/quiz?doc_id=${docId}`}><GradientButton>Start Quiz</GradientButton></Link>
          )}
        </SectionCard>
      )}

      {tab === 'ai' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {['AI Chat', 'Tạo flashcard bằng AI', 'Tạo quiz bằng AI'].map((label) => (
            <SectionCard key={label} className="p-6 text-center opacity-80">
              <FiMessageSquare className="mx-auto mb-3 text-3xl text-on-surface-variant" />
              <h3 className="mb-2 font-heading font-bold">{label}</h3>
              <button onClick={() => showToast('success', 'Tính năng AI đang phát triển.')} className="rounded-lg bg-surface-container-highest px-4 py-2 text-sm font-semibold text-on-surface-variant">
                Tính năng AI đang phát triển
              </button>
            </SectionCard>
          ))}
        </div>
      )}
    </AppShell>
  )
}
