'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/axios'
import FlashcardItem from '@/components/flashcards/FlashcardItem'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Flashcard {
  id: number
  doc_id: number | null
  front_text: string
  back_text: string
  next_review_date: string
}

interface Document {
  id: number
  title: string
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FlashcardsLibraryPage() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch docs for filter
        const docsRes = await apiClient.get<Document[]>('/api/v1/documents')
        setDocuments(docsRes.data)

        // Fetch all flashcards
        const cardsUrl = selectedDocId === 'all' 
          ? '/api/v1/flashcards' 
          : `/api/v1/flashcards?doc_id=${selectedDocId}`
        const cardsRes = await apiClient.get<Flashcard[]>(cardsUrl)
        setFlashcards(cardsRes.data)

        // Count due cards (could be optimized with a separate backend endpoint, but we compute client-side for now)
        const now = new Date()
        const due = cardsRes.data.filter(c => new Date(c.next_review_date) <= now)
        setDueCount(due.length)

      } catch (error) {
        console.error('Failed to fetch flashcards data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedDocId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">🗂️ Flashcard Library</h1>
            <p className="text-white/60 text-sm">
              You have {flashcards.length} total cards. 
              {dueCount > 0 && <span className="text-emerald-400 font-medium ml-1">{dueCount} due for review.</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            {/* Document Filter Dropdown (Custom Tailwind) */}
            <div className="relative flex-1 md:flex-none">
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full appearance-none bg-white/10 border border-white/20 text-white text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="all" className="bg-slate-800">All Documents</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id} className="bg-slate-800">
                    {doc.title}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-white/50">
                ▼
              </div>
            </div>

            {/* Study Now Button */}
            <Link
              href="/flashcards/quiz"
              className={`px-6 py-3 rounded-xl font-medium text-sm transition-all shadow-lg flex-1 md:flex-none text-center ${
                dueCount > 0 
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30' 
                  : 'bg-white/10 text-white/50 cursor-not-allowed hover:bg-white/10'
              }`}
              onClick={(e) => {
                if (dueCount === 0) e.preventDefault()
              }}
            >
              Study Now ({dueCount})
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : flashcards.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="text-6xl mb-6">📭</div>
            <h3 className="text-xl font-medium text-white mb-2">No flashcards found</h3>
            <p className="text-white/50 max-w-md">
              {selectedDocId === 'all' 
                ? "You don't have any flashcards yet. Go to your Workspace and generate some from a document!"
                : "This document doesn't have any flashcards."}
            </p>
            {selectedDocId === 'all' && (
              <Link 
                href="/workspace" 
                className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
              >
                Go to Workspace →
              </Link>
            )}
          </div>
        ) : (
          /* Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {flashcards.map(card => (
              <FlashcardItem
                key={card.id}
                front={card.front_text}
                back={card.back_text}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
