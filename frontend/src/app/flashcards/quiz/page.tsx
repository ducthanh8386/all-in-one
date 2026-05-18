'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '@/lib/axios'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Flashcard {
  id: number
  front_text: string
  back_text: string
  repetition_count: number
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function QuizModePage() {
  const [queue, setQueue] = useState<Flashcard[]>([])
  const [loading, setLoading] = useState(true)
  const [showAnswer, setShowAnswer] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Fetch due cards
  useEffect(() => {
    const fetchDueCards = async () => {
      try {
        const res = await apiClient.get<Flashcard[]>('/api/v1/flashcards/due')
        setQueue(res.data)
      } catch (error) {
        console.error('Failed to fetch due flashcards:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDueCards()
  }, [])

  // Handlers
  const handleShowAnswer = () => {
    setShowAnswer(true)
  }

  const handleReview = useCallback(async (quality: number) => {
    if (submitting || queue.length === 0) return
    setSubmitting(true)

    const currentCard = queue[0]

    try {
      await apiClient.post(`/api/v1/flashcards/${currentCard.id}/review`, { quality })
      
      // Delay slightly for UI smoothness, then pop the card
      setTimeout(() => {
        setQueue(prev => prev.slice(1))
        setShowAnswer(false)
        setSubmitting(false)
      }, 150)

    } catch (error) {
      console.error('Review submission failed:', error)
      setSubmitting(false)
    }
  }, [queue, submitting])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (queue.length === 0 || submitting) return

      if (!showAnswer && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault()
        handleShowAnswer()
      } else if (showAnswer) {
        if (e.key === '1') handleReview(2) // Hard
        if (e.key === '2') handleReview(4) // Good
        if (e.key === '3') handleReview(5) // Easy
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleReview, showAnswer, queue.length, submitting])


  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="text-white/50">Loading your study deck...</p>
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="bg-white/10 border border-white/20 p-10 rounded-3xl max-w-lg shadow-2xl backdrop-blur-md"
        >
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-white mb-3">You&apos;re all caught up!</h1>
          <p className="text-white/70 mb-8 leading-relaxed">
            Congratulations! You have completed all your reviews for today. 
            Taking regular breaks helps consolidate memory.
          </p>
          <Link
            href="/flashcards"
            className="inline-block px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-indigo-500/30"
          >
            Back to Library
          </Link>
        </motion.div>
      </div>
    )
  }

  const currentCard = queue[0]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden">
      
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-slate-900/50 backdrop-blur-sm z-10">
        <Link href="/flashcards" className="text-white/50 hover:text-white transition-colors text-sm font-medium">
          ← Exit Quiz
        </Link>
        <div className="text-white/50 text-sm font-medium bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
          <span className="text-indigo-400 font-bold">{queue.length}</span> cards remaining
        </div>
      </header>

      {/* Main Play Area */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-6 perspective-1000">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 100, rotateY: -20 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: -100, rotateY: 20, scale: 0.9 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
            className="w-full max-w-2xl aspect-[4/3] md:aspect-[3/2] relative preserve-3d"
          >
            {/* The Flipping Card */}
            <motion.div
              className="w-full h-full relative preserve-3d"
              animate={{ rotateX: showAnswer ? 180 : 0 }}
              transition={{ duration: 0.6, type: "spring", stiffness: 200, damping: 20 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Front Face */}
              <div 
                className="absolute w-full h-full backface-hidden bg-slate-800 border border-slate-700 rounded-3xl p-8 md:p-12 flex flex-col justify-center items-center shadow-2xl"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="absolute top-6 text-slate-500 text-sm font-bold uppercase tracking-widest">
                  Question
                </div>
                <h2 className="text-2xl md:text-4xl font-medium text-slate-100 text-center leading-relaxed">
                  {currentCard.front_text}
                </h2>
              </div>

              {/* Back Face */}
              <div 
                className="absolute w-full h-full backface-hidden bg-indigo-900/80 border border-indigo-500/30 rounded-3xl p-8 md:p-12 flex flex-col justify-center items-center shadow-2xl overflow-y-auto"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
              >
                <div className="absolute top-6 text-indigo-400/60 text-sm font-bold uppercase tracking-widest">
                  Answer
                </div>
                <p className="text-xl md:text-3xl text-indigo-50 text-center leading-relaxed whitespace-pre-wrap mt-8">
                  {currentCard.back_text}
                </p>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Controls */}
      <footer className="h-32 shrink-0 border-t border-white/5 bg-slate-900/80 backdrop-blur-md flex items-center justify-center px-6 z-10">
        <div className="w-full max-w-2xl">
          {!showAnswer ? (
            <button
              onClick={handleShowAnswer}
              className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-lg transition-colors shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
            >
              Show Answer
              <span className="block text-xs text-indigo-300 mt-1 font-normal opacity-80 hidden md:block">Press Space or Enter</span>
            </button>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-3 md:gap-4"
            >
              <button
                onClick={() => handleReview(2)}
                disabled={submitting}
                className="group flex flex-col items-center justify-center py-3 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 hover:border-red-500/50 rounded-2xl transition-all disabled:opacity-50"
              >
                <span className="text-red-400 font-semibold mb-1">Hard</span>
                <span className="text-xs text-red-500/50 group-hover:text-red-400/80">Press 1</span>
              </button>
              
              <button
                onClick={() => handleReview(4)}
                disabled={submitting}
                className="group flex flex-col items-center justify-center py-3 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-900/50 hover:border-emerald-500/50 rounded-2xl transition-all disabled:opacity-50"
              >
                <span className="text-emerald-400 font-semibold mb-1">Good</span>
                <span className="text-xs text-emerald-500/50 group-hover:text-emerald-400/80">Press 2</span>
              </button>
              
              <button
                onClick={() => handleReview(5)}
                disabled={submitting}
                className="group flex flex-col items-center justify-center py-3 bg-blue-950/40 hover:bg-blue-900/60 border border-blue-900/50 hover:border-blue-500/50 rounded-2xl transition-all disabled:opacity-50"
              >
                <span className="text-blue-400 font-semibold mb-1">Easy</span>
                <span className="text-xs text-blue-500/50 group-hover:text-blue-400/80">Press 3</span>
              </button>
            </motion.div>
          )}
        </div>
      </footer>

    </div>
  )
}
