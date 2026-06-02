'use client'

import { useEffect, useState } from 'react'
import apiClient from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Question, Subject } from '@/types/examPlanner'
import { FiDownload, FiFileText, FiPlayCircle } from 'react-icons/fi'

interface Paper {
  id: number
  title: string
  subject_id: number
  duration_minutes: number
  question_count: number
  questions: Question[]
}

export default function ExamPapersPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [paper, setPaper] = useState<Paper | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [result, setResult] = useState('')
  const [form, setForm] = useState({ subject_id: '', title: 'Practice Exam', duration_minutes: '60', question_count: '20', easy: '30', medium: '50', hard: '20' })

  useEffect(() => {
    apiClient.get<Subject[]>('/api/v1/subjects').then(res => setSubjects(res.data))
  }, [])

  const createPaper = async () => {
    const res = await apiClient.post<Paper>('/api/v1/exam-papers', {
      subject_id: Number(form.subject_id),
      title: form.title,
      duration_minutes: Number(form.duration_minutes),
      question_count: Number(form.question_count),
      difficulty_mix: {
        EASY: Math.round(Number(form.question_count) * Number(form.easy) / 100),
        MEDIUM: Math.round(Number(form.question_count) * Number(form.medium) / 100),
        HARD: Math.round(Number(form.question_count) * Number(form.hard) / 100),
      },
    })
    setPaper(res.data)
    setResult('')
  }

  const submit = async () => {
    if (!paper) return
    const res = await apiClient.post('/api/v1/quiz/submit', {
      subject_id: paper.subject_id,
      mode: 'EXAM',
      answers: paper.questions.map(q => ({ question_id: q.id, selected_answer: answers[q.id] || '' })),
    })
    setResult(`Score ${res.data.score}% · ${res.data.correct_count}/${res.data.total_questions} correct`)
  }

  return (
    <AppShell>
      <PageHeader title="Exam Papers" subtitle="Random đề thi thử từ question bank, làm Exam Mode và export PDF." />
      {result && <div className="mb-4 rounded-lg bg-success-container/30 px-4 py-3 text-sm font-bold">{result}</div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <SectionCard className="p-5">
          <h2 className="mb-4 font-heading text-lg font-bold">Generate Paper</h2>
          <div className="space-y-3">
            <select className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>
              <option value="">Subject</option>
              {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Minutes" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Questions" value={form.question_count} onChange={e => setForm({ ...form, question_count: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Easy %" value={form.easy} onChange={e => setForm({ ...form, easy: e.target.value })} />
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Med %" value={form.medium} onChange={e => setForm({ ...form, medium: e.target.value })} />
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Hard %" value={form.hard} onChange={e => setForm({ ...form, hard: e.target.value })} />
            </div>
            <GradientButton disabled={!form.subject_id} onClick={createPaper} className="w-full">Generate</GradientButton>
          </div>
        </SectionCard>
        <SectionCard className="p-6">
          {!paper ? <EmptyState icon={FiFileText} title="No paper generated" description="Chọn subject và cấu hình số câu để random đề từ question bank." /> : (
            <div>
              <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="font-heading text-xl font-bold">{paper.title}</h2>
                  <p className="text-sm text-on-surface-variant">{paper.duration_minutes} minutes · {paper.question_count} questions</p>
                </div>
                <div className="flex gap-2">
                  <a className="rounded-lg border border-outline-variant/50 px-3 py-2 text-sm font-bold" href={`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/v1/exam-papers/${paper.id}/pdf`} target="_blank"><FiDownload className="mr-1 inline" /> PDF</a>
                  <a className="rounded-lg border border-outline-variant/50 px-3 py-2 text-sm font-bold" href={`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'}/api/v1/exam-papers/${paper.id}/pdf?with_answers=true`} target="_blank">Answers</a>
                </div>
              </div>
              <div className="space-y-5">
                {paper.questions.map((question, index) => (
                  <div key={question.id} className="rounded-lg border border-outline-variant/40 p-4">
                    <p className="mb-3 font-semibold">{index + 1}. {question.question_text}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {question.options.map(option => <button key={option} onClick={() => setAnswers({ ...answers, [question.id]: option })} className={`rounded-lg border p-3 text-left text-sm ${answers[question.id] === option ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40'}`}>{option}</button>)}
                    </div>
                  </div>
                ))}
              </div>
              <GradientButton onClick={submit} className="mt-5"><FiPlayCircle className="mr-2" /> Submit Exam</GradientButton>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  )
}
