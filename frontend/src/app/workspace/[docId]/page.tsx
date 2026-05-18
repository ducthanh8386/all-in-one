'use client'

/**
 * /workspace/[docId] — Chat interface with a document via SSE streaming RAG.
 * Messages render in real-time as chunks arrive from the server.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import MathRenderer from '@/components/MathRenderer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: number
  title: string
  status: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams()
  const docId = params?.docId as string
  const router = useRouter()
  const { user } = useAuthStore()

  const [document, setDocument] = useState<Document | null>(null)
  const [docLoading, setDocLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [quotaWarning, setQuotaWarning] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch document info ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const token = useAuthStore.getState().accessToken
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/documents/${docId}`,
          { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' }
        )
        if (!res.ok) { router.push('/workspace'); return }
        const data = await res.json()
        if (data.status !== 'COMPLETED') { router.push('/workspace'); return }
        setDocument(data)
      } catch {
        router.push('/workspace')
      } finally {
        setDocLoading(false)
      }
    }
    if (docId) fetchDoc()
  }, [docId, router])

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-Generate Flashcards ──────────────────────────────────────────────
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const handleGenerateFlashcards = async () => {
    if (generating || !document) return
    setGenerating(true)

    try {
      const token = useAuthStore.getState().accessToken
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/flashcards/generate/${docId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        showToast('success', `Generated ${data.generated_count} flashcards successfully! Redirecting...`)
        setTimeout(() => router.push('/flashcards'), 2000)
      } else if (res.status === 403) {
        showToast('error', 'AI quota exhausted. Contact admin to refill.')
      } else {
        showToast('error', 'Failed to generate flashcards. Please try again.')
      }
    } catch (error) {
      showToast('error', 'An error occurred while generating flashcards.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Send message + SSE streaming ──────────────────────────────────────────
  const sendMessage = async () => {
    const question = input.trim()
    if (!question || sending) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }
    const assistantMsgId = `ai-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setSending(true)

    try {
      const token = useAuthStore.getState().accessToken
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/documents/${docId}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ question }),
        }
      )

      if (res.status === 403) {
        const errData = await res.json()
        const code = errData?.detail?.error?.code
        if (code === 'QUOTA_EXCEEDED') {
          setQuotaWarning(true)
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, content: '⚠️ Your AI quota is exhausted. Contact admin to refill.', streaming: false }
                : m
            )
          )
          return
        }
      }

      if (!res.ok) throw new Error('Chat request failed')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream reader available')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            const chunk: string = parsed.chunk ?? ''
            if (chunk) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + chunk }
                    : m
                )
              )
            }
          } catch {
            // Ignore malformed SSE chunk
          }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: '❌ Failed to get a response. Please try again.', streaming: false }
            : m
        )
      )
    } finally {
      // Mark streaming done
      setMessages(prev =>
        prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m)
      )
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (docLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center">
        <div className="text-white/50 text-lg animate-pulse">Loading document…</div>
      </div>
    )
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col">
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

      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-sm shrink-0">
        <Link
          href="/workspace"
          className="text-white/50 hover:text-white transition-colors text-sm shrink-0"
        >
          ← Workspace
        </Link>
        <div className="h-4 w-px bg-white/20 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-white font-semibold truncate">📄 {document?.title ?? 'Document'}</h1>
        </div>

        <div className="ml-auto flex items-center gap-4 shrink-0">
          {/* Auto Generate Button */}
          <button
            onClick={handleGenerateFlashcards}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            {generating ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              '✨ Auto-Generate Flashcards'
            )}
          </button>

          {/* AI Quota */}
          {user && (
            <div className="flex items-center gap-2 text-xs text-white/40 border-l border-white/10 pl-4">
              <span>AI Quota:</span>
              <span className={`font-mono font-bold ${user.ai_quota <= 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                {user.ai_quota}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 text-white/30">
            <div className="text-6xl mb-4">🤖</div>
            <p className="text-lg font-medium text-white/50">Ask anything about your document</p>
            <p className="text-sm mt-1">Questions, summaries, explanations — AI will answer from your PDF.</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm shrink-0 mt-1">
                🤖
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white/8 border border-white/10 text-white/90 rounded-bl-sm'
                }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div className="text-sm">
                  {msg.content ? (
                    <MathRenderer content={msg.content} />
                  ) : (
                    msg.streaming && (
                      <div className="flex gap-1 items-center h-5">
                        <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm shrink-0 mt-1">
                👤
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Quota warning banner */}
      {quotaWarning && (
        <div className="mx-4 md:mx-8 mb-2 px-4 py-2 bg-red-900/40 border border-red-500/30 rounded-xl text-red-300 text-sm text-center">
          ⚠️ AI quota exhausted. Contact admin to get more credits.
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 md:px-8 py-4 border-t border-white/10 bg-slate-900/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your document…"
            rows={1}
            disabled={sending}
            className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition disabled:opacity-50 max-h-40 overflow-y-auto"
            style={{ minHeight: '48px' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 text-white font-medium rounded-xl transition-all text-sm shrink-0 h-12"
          >
            {sending ? '…' : 'Send ↑'}
          </button>
        </div>
        <p className="text-center text-white/20 text-xs mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
