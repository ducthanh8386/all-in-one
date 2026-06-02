'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { FiCheckCircle, FiDownload, FiEdit2, FiFileText, FiFolder, FiPlus, FiSearch, FiTarget, FiTrash2, FiType, FiUploadCloud } from 'react-icons/fi'

interface DocumentItem {
  id: number
  title: string
  original_filename?: string | null
}

interface Flashcard {
  id: number
  doc_id: number | null
  front_text: string
  back_text: string
  tag?: string | null
  repetition_count: number
  ease_factor: number
  interval_days: number
  next_review_date: string
}

type Tab = 'review' | 'manage' | 'typing' | 'import'

const emptyForm = { front_text: '', back_text: '', tag: '' }

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function templateCsv() {
  return 'front,back,tag\n"Deadlock là gì?","Tình trạng các tiến trình chờ nhau vô hạn.","Operating System"\n"TCP là gì?","Transmission Control Protocol.","Network"'
}

export default function FlashcardsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [cards, setCards] = useState<Flashcard[]>([])
  const [dueQueue, setDueQueue] = useState<Flashcard[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>('all')
  const [tab, setTab] = useState<Tab>('review')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showBack, setShowBack] = useState(false)
  const [typingIndex, setTypingIndex] = useState(0)
  const [typingValue, setTypingValue] = useState('')
  const [typingResult, setTypingResult] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3500)
  }

  const currentDocParam = selectedDocId === 'all' ? '' : `doc_id=${selectedDocId}`

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const dueParams = new URLSearchParams()
      if (selectedDocId !== 'all') {
        params.set('doc_id', selectedDocId)
        dueParams.set('doc_id', selectedDocId)
      }
      if (query.trim()) params.set('q', query.trim())
      const [docsRes, cardsRes, dueRes] = await Promise.all([
        apiClient.get<DocumentItem[]>('/api/v1/documents'),
        apiClient.get<Flashcard[]>(`/api/v1/flashcards${params.toString() ? `?${params}` : ''}`),
        apiClient.get<Flashcard[]>(`/api/v1/flashcards/due${dueParams.toString() ? `?${dueParams}` : ''}`),
      ])
      setDocuments(docsRes.data)
      setCards(cardsRes.data)
      setDueQueue(dueRes.data)
      setShowBack(false)
    } catch {
      showToast('error', 'Không tải được flashcards.')
    } finally {
      setLoading(false)
    }
  }, [query, selectedDocId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const submitCard = async () => {
    if (!form.front_text.trim() || !form.back_text.trim()) {
      showToast('error', 'Front và Back là bắt buộc.')
      return
    }
    const doc_id = selectedDocId === 'all' ? null : Number(selectedDocId)
    try {
      if (editingId) {
        const res = await apiClient.put<Flashcard>(`/api/v1/flashcards/${editingId}`, form)
        setCards((prev) => prev.map((card) => card.id === editingId ? res.data : card))
        showToast('success', 'Đã cập nhật flashcard.')
      } else {
        const res = await apiClient.post<Flashcard>('/api/v1/flashcards', { ...form, doc_id })
        setCards((prev) => [res.data, ...prev])
        setDueQueue((prev) => [res.data, ...prev])
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
    setTab('manage')
  }

  const deleteCard = async (cardId: number) => {
    if (!confirm('Xóa flashcard này?')) return
    try {
      await apiClient.delete(`/api/v1/flashcards/${cardId}`)
      setCards((prev) => prev.filter((card) => card.id !== cardId))
      setDueQueue((prev) => prev.filter((card) => card.id !== cardId))
      showToast('success', 'Đã xóa flashcard.')
    } catch {
      showToast('error', 'Xóa flashcard thất bại.')
    }
  }

  const reviewCurrent = async (quality: number) => {
    if (!dueQueue[0]) return
    try {
      await apiClient.post(`/api/v1/flashcards/${dueQueue[0].id}/review`, { quality })
      setDueQueue((prev) => prev.slice(1))
      setShowBack(false)
    } catch {
      showToast('error', 'Gửi review thất bại.')
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8;' }))
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
    if (selectedDocId !== 'all') formData.append('doc_id', selectedDocId)
    try {
      const res = await apiClient.post('/api/v1/flashcards/import', formData)
      showToast('success', `Đã tạo ${res.data.created} thẻ, bỏ qua ${res.data.skipped} dòng.`)
      await loadData()
    } catch {
      showToast('error', 'Import CSV thất bại.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const typingCards = cards
  const typingCard = typingCards[typingIndex % Math.max(typingCards.length, 1)]
  const checkTyping = () => {
    if (!typingCard) return
    setTypingResult(normalize(typingValue) === normalize(typingCard.back_text) ? 'Chính xác!' : `Sai. Đáp án: ${typingCard.back_text}`)
  }
  const nextTyping = () => {
    setTypingIndex((idx) => idx + 1)
    setTypingValue('')
    setTypingResult(null)
  }

  const totalCards = cards.length
  const selectedDocName = selectedDocId === 'all' ? 'All Documents' : documents.find((doc) => String(doc.id) === selectedDocId)?.original_filename || documents.find((doc) => String(doc.id) === selectedDocId)?.title || 'Document'

  return (
    <AppShell>
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
          {toast.message}
        </div>
      )}

      <PageHeader
        title="Flashcards"
        subtitle="Manual cards, SM-2 review, quiz practice, and typing practice."
        actions={<Link href={`/flashcards/quiz${currentDocParam ? `?${currentDocParam}` : ''}`}><GradientButton><FiTarget className="mr-2" /> Quiz</GradientButton></Link>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <SectionCard className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-heading font-bold"><FiFolder /> Decks</h2>
            <div className="space-y-2">
              <button onClick={() => setSelectedDocId('all')} className={`w-full rounded-lg border p-3 text-left text-sm font-semibold ${selectedDocId === 'all' ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40'}`}>
                All Documents <span className="block text-xs font-normal text-on-surface-variant">{totalCards} cards</span>
              </button>
              {documents.map((doc) => (
                <button key={doc.id} onClick={() => setSelectedDocId(String(doc.id))} className={`w-full rounded-lg border p-3 text-left text-sm font-semibold ${selectedDocId === String(doc.id) ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40'}`}>
                  <span className="block truncate">{doc.original_filename || doc.title}</span>
                  <span className="text-xs font-normal text-on-surface-variant">{cards.filter((card) => card.doc_id === doc.id).length} loaded cards</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="p-4">
            <h2 className="mb-3 font-heading font-bold">{editingId ? 'Edit Card' : 'Add Card'}</h2>
            <div className="space-y-3">
              <textarea value={form.front_text} onChange={(event) => setForm({ ...form, front_text: event.target.value })} placeholder="Front" className="h-20 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <textarea value={form.back_text} onChange={(event) => setForm({ ...form, back_text: event.target.value })} placeholder="Back" className="h-24 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Tag" className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" />
              <GradientButton onClick={submitCard} className="w-full"><FiPlus className="mr-2" /> {editingId ? 'Save Card' : 'Add Card'}</GradientButton>
              {editingId && <button onClick={resetForm} className="w-full rounded-lg border border-outline-variant/50 py-2 text-sm font-semibold">Cancel</button>}
            </div>
          </SectionCard>
        </aside>

        <main className="min-w-0">
          <div className="mb-6 flex gap-2 overflow-x-auto border-b border-outline-variant/30">
            {[
              ['review', 'Review'],
              ['manage', 'Manage'],
              ['typing', 'Typing Practice'],
              ['import', 'Import CSV'],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key as Tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <LoadingSkeleton type="card" className="h-80" />
          ) : tab === 'review' ? (
            <SectionCard className="p-6">
              {dueQueue.length === 0 ? (
                <EmptyState icon={FiCheckCircle} title="Done for today" description="Bạn đã ôn hết thẻ due trong deck hiện tại." />
              ) : (
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mb-4 flex items-center justify-between text-sm text-on-surface-variant">
                    <span>{selectedDocName}</span>
                    <span className="font-semibold text-primary">{dueQueue.length} due</span>
                  </div>
                  <button onClick={() => setShowBack(true)} className="mb-6 min-h-[260px] w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-8 text-center shadow-sm">
                    <p className="mb-3 text-xs font-bold uppercase text-on-surface-variant">{showBack ? 'Back' : 'Front'}</p>
                    <p className="whitespace-pre-wrap text-2xl font-semibold text-on-surface">{showBack ? dueQueue[0].back_text : dueQueue[0].front_text}</p>
                    {!showBack && <p className="mt-8 text-sm text-primary">Click để lật thẻ</p>}
                  </button>
                  {showBack ? (
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                      {[0, 1, 2, 3, 4, 5].map((quality) => (
                        <button key={quality} onClick={() => reviewCurrent(quality)} className="rounded-lg border border-outline-variant/40 px-3 py-3 text-sm font-bold hover:border-primary hover:text-primary">
                          {quality}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <GradientButton onClick={() => setShowBack(true)}>Show Answer</GradientButton>
                  )}
                </div>
              )}
            </SectionCard>
          ) : tab === 'manage' ? (
            <SectionCard className="p-5">
              <div className="mb-4 flex gap-3">
                <div className="relative flex-1">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search front, back, tag..." className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest py-2 pl-10 pr-4 text-sm outline-none focus:border-primary" />
                </div>
                <button onClick={loadData} className="rounded-lg bg-surface-container-highest px-4 py-2 text-sm font-semibold">Search</button>
              </div>
              {cards.length === 0 ? (
                <EmptyState icon={FiFileText} title="No flashcards" description="Tạo thẻ ở panel bên trái hoặc import CSV." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-outline-variant/30 text-on-surface-variant"><tr><th className="py-3">Front</th><th>Back</th><th>Tag</th><th>Next Review</th><th className="text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {cards.map((card) => (
                        <tr key={card.id}>
                          <td className="max-w-[220px] truncate py-3 font-medium">{card.front_text}</td>
                          <td className="max-w-[280px] truncate text-on-surface-variant">{card.back_text}</td>
                          <td className="text-on-surface-variant">{card.tag || '-'}</td>
                          <td className="text-on-surface-variant">{new Date(card.next_review_date).toLocaleDateString()}</td>
                          <td className="text-right"><button onClick={() => editCard(card)} className="p-2 text-primary"><FiEdit2 /></button><button onClick={() => deleteCard(card.id)} className="p-2 text-error"><FiTrash2 /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : tab === 'typing' ? (
            <SectionCard className="mx-auto max-w-2xl p-8 text-center">
              {typingCards.length === 0 || !typingCard ? (
                <EmptyState icon={FiType} title="No cards for typing" description="Tạo hoặc import flashcards trước." />
              ) : (
                <>
                  <FiType className="mx-auto mb-4 text-4xl text-primary" />
                  <p className="mb-5 whitespace-pre-wrap text-2xl font-semibold">{typingCard.front_text}</p>
                  <input value={typingValue} onChange={(event) => setTypingValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && checkTyping()} placeholder="Nhập đáp án..." className="mb-4 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-center text-lg outline-none focus:border-primary" />
                  {typingResult && <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${typingResult.startsWith('Chính') ? 'bg-success-container/40 text-on-success-container' : 'bg-error-container/30 text-error'}`}>{typingResult}</p>}
                  <div className="flex justify-center gap-3"><GradientButton onClick={checkTyping}>Kiểm tra</GradientButton><button onClick={nextTyping} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold">Tiếp</button></div>
                </>
              )}
            </SectionCard>
          ) : (
            <SectionCard className="mx-auto max-w-2xl p-8 text-center">
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} />
              <FiUploadCloud className="mx-auto mb-4 text-4xl text-primary" />
              <h2 className="mb-2 font-heading text-xl font-bold">Import CSV</h2>
              <p className="mb-6 text-sm text-on-surface-variant">Import vào deck hiện tại. CSV columns: front,back,tag.</p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row"><GradientButton onClick={() => fileInputRef.current?.click()}>Import CSV</GradientButton><button onClick={downloadTemplate} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-semibold"><FiDownload className="mr-1 inline" /> Download template</button></div>
            </SectionCard>
          )}
        </main>
      </div>
    </AppShell>
  )
}
