'use client'

/**
 * /workspace — Document list + HTML5 Drag & Drop PDF upload.
 * Real-time status update via Socket.io.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/lib/axios'
import { initSocket } from '@/lib/socket'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

interface Document {
  id: number
  title: string
  status: DocStatus
  created_at: string
  error_message?: string | null
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DocStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  PROCESSING: { label: 'Processing…', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse' },
  COMPLETED: { label: 'Ready', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  FAILED: { label: 'Failed', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
}

function StatusBadge({ status }: { status: DocStatus }) {
  const { label, cls } = STATUS_CONFIG[status] ?? STATUS_CONFIG.FAILED
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  )
}

// ─── Upload Zone ───────────────────────────────────────────────────────────────

interface UploadZoneProps {
  onUploadSuccess: (doc: Document) => void
}

function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.')
      return
    }

    const maxBytes = 20 * 1024 * 1024
    if (file.size > maxBytes) {
      setError('File exceeds the 20 MB limit.')
      return
    }

    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Sử dụng apiClient thay vì XMLHttpRequest
      const res = await apiClient.post('/api/v1/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setProgress(percentCompleted)
          }
        },
      })

      if (res.status === 202) {
        const data = res.data
        // Tạo Document ảo tạm thời để hiện lên UI ngay lập tức
        const newDoc: Document = {
          id: data.document_id,
          title: data.title,
          status: 'PENDING',
          created_at: new Date().toISOString(),
        }
        onUploadSuccess(newDoc)
      }
    } catch (err: any) {
      console.error('Upload Error:', err)
      setError(err?.response?.data?.detail?.message || err.message || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [onUploadSuccess])

  // ── Drag & Drop handlers ───────────────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`
        relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
        transition-all duration-200 select-none
        ${dragging
          ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
          : 'border-white/20 bg-white/5 hover:border-indigo-400/60 hover:bg-indigo-500/5'
        }
        ${uploading ? 'pointer-events-none opacity-80' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onInputChange}
      />

      {/* Hiển thị lỗi nếu có */}
      {error && (
        <div className="absolute top-4 left-0 right-0 text-red-400 font-medium text-sm">
          {error}
        </div>
      )}

      {uploading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl">⬆️</div>
          <p className="text-white/70 text-sm">Uploading… {progress}%</p>
          <div className="w-48 bg-white/10 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="text-5xl">📄</div>
          <p className="text-white font-medium">
            {dragging ? 'Drop your PDF here' : 'Drag & drop a PDF, or click to browse'}
          </p>
          <p className="text-white/40 text-sm">Maximum file size: 20 MB</p>
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // ── Fetch documents on mount ───────────────────────────────────────────────
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await apiClient.get<Document[]>('/api/v1/documents')
        setDocuments(res.data)
      } catch {
        showToast('error', 'Failed to load documents.')
      } finally {
        setLoading(false)
      }
    }
    fetchDocs()
  }, [])

  // ── Socket listener for processing events ─────────────────────────────────
  useEffect(() => {
    const token = useAuthStore.getState().accessToken || undefined
    const socket = initSocket(token)

    socket.on('document:processing_done', (data: { document_id: number }) => {
      setDocuments(prev =>
        prev.map(d =>
          d.id === data.document_id ? { ...d, status: 'COMPLETED' } : d
        )
      )
      showToast('success', `Document processed successfully!`)
    })

    socket.on('document:processing_failed', (data: { document_id: number; error: string }) => {
      setDocuments(prev =>
        prev.map(d =>
          d.id === data.document_id
            ? { ...d, status: 'FAILED', error_message: data.error }
            : d
        )
      )
      showToast('error', `Processing failed: ${data.error}`)
    })

    return () => {
      socket.off('document:processing_done')
      socket.off('document:processing_failed')
    }
  }, [])

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const handleUploadSuccess = (doc: Document) => {
    setDocuments(prev => [doc, ...prev])
    showToast('success', `"${doc.title}" is now being processed.`)
  }

  const handleDelete = async (docId: number) => {
    if (!confirm('Delete this document and all associated flashcards?')) return
    try {
      await apiClient.delete(`/api/v1/documents/${docId}`)
      setDocuments(prev => prev.filter(d => d.id !== docId))
      showToast('success', 'Document deleted.')
    } catch {
      showToast('error', 'Failed to delete document.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-10">
      {/* Toast */}
      {toast && (
        <div className={`
          fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium
          border backdrop-blur-sm transition-all duration-300 max-w-sm
          ${toast.type === 'success'
            ? 'bg-emerald-900/80 border-emerald-500/40 text-emerald-200'
            : 'bg-red-900/80 border-red-500/40 text-red-200'
          }
        `}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">📚 Workspace</h1>
          <p className="text-white/50">Upload PDFs and chat with your documents using AI.</p>
        </div>

        {/* Upload Zone */}
        <UploadZone onUploadSuccess={handleUploadSuccess} />

        {/* Document List */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white/80 mb-4">Your Documents</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <div className="text-5xl mb-3">📭</div>
              <p>No documents yet. Upload a PDF to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4 hover:bg-white/8 transition-colors group"
                >
                  {/* Left: title + status */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="text-2xl shrink-0">
                      {doc.status === 'COMPLETED' ? '✅' : doc.status === 'FAILED' ? '❌' : '⏳'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{doc.title}</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        {new Date(doc.created_at).toLocaleDateString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {doc.status === 'FAILED' && doc.error_message && (
                        <p className="text-red-400/80 text-xs mt-1 truncate max-w-xs">
                          {doc.error_message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: badge + actions */}
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <StatusBadge status={doc.status} />

                    {doc.status === 'COMPLETED' && (
                      <Link
                        href={`/workspace/${doc.id}`}
                        className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                      >
                        Chat →
                      </Link>
                    )}

                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete document"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}