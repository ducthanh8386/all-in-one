'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { FiArrowLeft, FiCheckCircle, FiPlayCircle, FiRefreshCw, FiTarget, FiXCircle } from 'react-icons/fi'

interface DocumentItem {
  id: number
  title: string
  original_filename?: string | null
}

interface QuizQuestion {
  card_id: number
  question: string
  options: string[]
  correct_option_index: number
}

type QuizState = 'setup' | 'session' | 'result'

export default function QuizPracticePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>('all')
  const [limit, setLimit] = useState(10)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [quizState, setQuizState] = useState<QuizState>('setup')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const docId = query.get('doc_id')
    if (docId) setSelectedDocId(docId)
    apiClient.get<DocumentItem[]>('/api/v1/documents')
      .then((res) => setDocuments(res.data))
      .catch(() => setError('Không tải được danh sách tài liệu.'))
      .finally(() => setLoading(false))
  }, [])

  const startQuiz = async () => {
    setError(null)
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (selectedDocId !== 'all') params.set('doc_id', selectedDocId)
    try {
      const res = await apiClient.get<{ questions: QuizQuestion[] }>(`/api/v1/quiz?${params}`)
      setQuestions(res.data.questions)
      setCurrentIndex(0)
      setSelectedOption(null)
      setScore(0)
      setQuizState('session')
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Không tạo được quiz.')
    }
  }

  const chooseOption = (index: number) => {
    if (selectedOption !== null) return
    setSelectedOption(index)
    if (index === questions[currentIndex].correct_option_index) {
      setScore((value) => value + 1)
    }
  }

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((value) => value + 1)
      setSelectedOption(null)
    } else {
      setQuizState('result')
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingSkeleton type="card" className="h-80" />
      </AppShell>
    )
  }

  if (quizState === 'setup') {
    return (
      <AppShell>
        <div className="mb-6 flex items-center gap-4">
          <Link href="/flashcards" className="rounded-lg p-2 text-on-surface-variant hover:bg-primary-container/20 hover:text-primary"><FiArrowLeft /></Link>
          <PageHeader title="Quiz Practice" subtitle="Multiple choice quiz sinh từ flashcards hiện có, không dùng AI." />
        </div>

        <SectionCard className="max-w-3xl p-8">
          <FiTarget className="mb-4 text-4xl text-primary" />
          <h2 className="mb-6 font-heading text-2xl font-bold">Configure Quiz</h2>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold">Deck</label>
              <select value={selectedDocId} onChange={(event) => setSelectedDocId(event.target.value)} className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary">
                <option value="all">All Documents</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.original_filename || doc.title}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Number of questions</label>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 20].map((value) => <button key={value} onClick={() => setLimit(value)} className={`rounded-lg border px-4 py-3 text-sm font-bold ${limit === value ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/50'}`}>{value}</button>)}
              </div>
            </div>
            {error && <p className="rounded-lg bg-error-container/30 p-3 text-sm font-semibold text-error">{error}</p>}
            <GradientButton onClick={startQuiz} className="w-full justify-center"><FiPlayCircle className="mr-2" /> Start Quiz</GradientButton>
          </div>
        </SectionCard>
      </AppShell>
    )
  }

  if (quizState === 'session') {
    const question = questions[currentIndex]
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <button onClick={() => setQuizState('setup')} className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant"><FiArrowLeft /> Exit</button>
            <p className="text-sm font-semibold text-on-surface-variant">Question {currentIndex + 1} / {questions.length} · Score {score}</p>
          </div>
          <SectionCard className="mb-5 p-8">
            <p className="mb-2 text-xs font-bold uppercase text-primary">Question</p>
            <h1 className="whitespace-pre-wrap text-2xl font-semibold text-on-surface">{question.question}</h1>
          </SectionCard>
          <div className="space-y-3">
            {question.options.map((option, index) => {
              const correct = index === question.correct_option_index
              const selected = selectedOption === index
              const locked = selectedOption !== null
              const className = locked && correct
                ? 'border-success bg-success/10 text-success'
                : locked && selected
                  ? 'border-error bg-error-container/30 text-error'
                  : locked
                    ? 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant/60'
                    : 'border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:border-primary'
              return (
                <button key={`${question.card_id}-${index}`} onClick={() => chooseOption(index)} disabled={locked} className={`flex w-full items-center justify-between rounded-xl border-2 p-4 text-left font-semibold ${className}`}>
                  <span>{option}</span>
                  {locked && correct && <FiCheckCircle />}
                  {locked && selected && !correct && <FiXCircle />}
                </button>
              )
            })}
          </div>
          {selectedOption !== null && (
            <div className="mt-6">
              <GradientButton onClick={nextQuestion} className="w-full justify-center">{currentIndex < questions.length - 1 ? 'Next Question' : 'View Results'}</GradientButton>
            </div>
          )}
        </div>
      </AppShell>
    )
  }

  const percentage = questions.length ? Math.round((score / questions.length) * 100) : 0
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl text-center">
        <SectionCard className="p-10">
          <FiCheckCircle className="mx-auto mb-4 text-5xl text-primary" />
          <h1 className="mb-2 font-heading text-3xl font-bold">Quiz Complete</h1>
          <p className="mb-8 text-on-surface-variant">Bạn trả lời đúng {score}/{questions.length} câu.</p>
          <p className="mb-8 text-6xl font-bold text-primary">{percentage}%</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button onClick={() => setQuizState('setup')} className="rounded-lg border border-outline-variant/50 px-4 py-3 text-sm font-semibold"><FiRefreshCw className="mr-1 inline" /> Làm lại</button>
            <Link href="/flashcards"><GradientButton>Quay lại Flashcards</GradientButton></Link>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  )
}
