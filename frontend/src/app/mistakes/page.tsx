'use client'

import { useEffect, useState } from 'react'
import apiClient from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Question } from '@/types/examPlanner'
import { FiAlertTriangle, FiPlayCircle } from 'react-icons/fi'

interface Mistake {
  id: number
  question_id: number
  selected_answer?: string
  correct_answer: string
  mistake_count: number
  correct_streak: number
  resolved_at?: string | null
  question: Question
}

export default function MistakesPage() {
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [practice, setPractice] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [result, setResult] = useState('')

  const load = async () => {
    const res = await apiClient.get<Mistake[]>('/api/v1/mistakes')
    setMistakes(res.data)
  }

  useEffect(() => { load() }, [])

  const startPractice = async () => {
    const res = await apiClient.get<{ questions: Question[] }>('/api/v1/mistakes/practice')
    setPractice(res.data.questions)
    setResult('')
  }

  const submit = async () => {
    const res = await apiClient.post('/api/v1/quiz/submit', {
      mode: 'PRACTICE',
      answers: practice.map(q => ({ question_id: q.id, selected_answer: answers[q.id] || '' })),
    })
    setResult(`Score ${res.data.score}% · ${res.data.correct_count}/${res.data.total_questions} correct`)
    await load()
  }

  return (
    <AppShell>
      <PageHeader title="Mistake Notebook" subtitle="Câu sai được lưu tự động. Đúng 3 lần liên tiếp sẽ resolved." actions={<GradientButton onClick={startPractice}><FiPlayCircle className="mr-2" /> Practice Mistakes</GradientButton>} />
      {result && <div className="mb-4 rounded-lg bg-success-container/30 px-4 py-3 text-sm font-bold">{result}</div>}
      {practice.length > 0 ? (
        <SectionCard className="mb-6 p-6">
          <h2 className="mb-4 font-heading text-lg font-bold">Mistake Practice</h2>
          <div className="space-y-5">
            {practice.map(question => (
              <div key={question.id} className="rounded-lg border border-outline-variant/40 p-4">
                <p className="mb-3 font-semibold">{question.question_text}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {question.options.map(option => (
                    <button key={option} onClick={() => setAnswers({ ...answers, [question.id]: option })} className={`rounded-lg border p-3 text-left text-sm ${answers[question.id] === option ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40'}`}>{option}</button>
                  ))}
                </div>
              </div>
            ))}
            <GradientButton onClick={submit}>Submit Practice</GradientButton>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard className="p-6">
        {mistakes.length === 0 ? <EmptyState icon={FiAlertTriangle} title="No open mistakes" description="Sai quiz một câu hỏi trong question bank để notebook tự ghi lại." /> : (
          <div className="divide-y divide-outline-variant/20">
            {mistakes.map(item => (
              <div key={item.id} className="py-4">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded bg-error-container/40 px-2 py-1 text-xs font-bold text-error">{item.mistake_count} mistakes</span>
                  <span className="rounded bg-surface-variant px-2 py-1 text-xs font-bold">{item.correct_streak}/3 streak</span>
                </div>
                <p className="font-semibold">{item.question.question_text}</p>
                <p className="mt-1 text-sm text-error">Selected: {item.selected_answer || '-'}</p>
                <p className="text-sm text-success">Correct: {item.correct_answer}</p>
                {item.question.explanation && <p className="mt-2 text-sm text-on-surface-variant">{item.question.explanation}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </AppShell>
  )
}
