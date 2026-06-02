'use client'

import { useCallback, useEffect, useState } from 'react'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { Chapter, Question, Subject } from '@/types/examPlanner'
import { FiBookOpen, FiCheckCircle, FiLayers, FiPlus, FiTarget } from 'react-icons/fi'

export default function SubjectDetailPage({ params }: { params: { subjectId: string } }) {
  const subjectId = Number(params.subjectId)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [chapterTitle, setChapterTitle] = useState('')
  const [questionForm, setQuestionForm] = useState({ chapter_id: '', question_text: '', options: '', correct_answer: '', explanation: '', difficulty: 'MEDIUM' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [subjectRes, chaptersRes, questionsRes] = await Promise.all([
        apiClient.get<Subject>(`/api/v1/subjects/${subjectId}`),
        apiClient.get<Chapter[]>(`/api/v1/subjects/${subjectId}/chapters`),
        apiClient.get<Question[]>(`/api/v1/questions?subject_id=${subjectId}`),
      ])
      setSubject(subjectRes.data)
      setChapters(chaptersRes.data)
      setQuestions(questionsRes.data)
      setError('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không tải được chi tiết môn học.'))
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => { load() }, [load])

  const addChapter = async () => {
    if (!chapterTitle.trim()) return
    try {
      await apiClient.post(`/api/v1/subjects/${subjectId}/chapters`, { title: chapterTitle, order_index: chapters.length + 1 })
      setChapterTitle('')
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Tạo chương thất bại.'))
    }
  }

  const addQuestion = async () => {
    if (!questionForm.question_text.trim() || !questionForm.correct_answer.trim()) return setError('Question và correct answer là bắt buộc.')
    try {
      await apiClient.post('/api/v1/questions', {
        subject_id: subjectId,
        chapter_id: questionForm.chapter_id ? Number(questionForm.chapter_id) : null,
        question_text: questionForm.question_text,
        question_type: 'MULTIPLE_CHOICE',
        options: questionForm.options.split('|').map(item => item.trim()).filter(Boolean),
        correct_answer: questionForm.correct_answer,
        explanation: questionForm.explanation || null,
        difficulty: questionForm.difficulty,
      })
      setQuestionForm({ chapter_id: '', question_text: '', options: '', correct_answer: '', explanation: '', difficulty: 'MEDIUM' })
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Tạo câu hỏi thất bại.'))
    }
  }

  return (
    <AppShell>
      <PageHeader title={subject?.name || 'Subject Detail'} subtitle="Chapter list, question bank and exam readiness." />
      {error && <div className="mb-4 rounded-lg bg-error-container/40 px-4 py-3 text-sm font-semibold text-error">{error}</div>}
      {loading || !subject ? <LoadingSkeleton type="card" className="h-96" /> : (
        <div className="space-y-6">
          <SectionCard className="p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div><p className="text-sm text-on-surface-variant">Code</p><p className="font-bold">{subject.code || '-'}</p></div>
              <div><p className="text-sm text-on-surface-variant">Exam</p><p className="font-bold">{subject.exam_date ? new Date(subject.exam_date).toLocaleDateString() : '-'}</p></div>
              <div><p className="text-sm text-on-surface-variant">Target</p><p className="font-bold">{subject.target_score ?? '-'}</p></div>
              <div><p className="text-sm text-on-surface-variant">Question bank</p><p className="font-bold">{questions.length}</p></div>
            </div>
          </SectionCard>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-6">
              <SectionCard className="p-5">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold"><FiBookOpen /> Chapters</h2>
                <div className="mb-4 flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="New chapter" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} />
                  <button className="rounded-lg bg-primary px-3 text-on-primary" onClick={addChapter}><FiPlus /></button>
                </div>
                {chapters.length === 0 ? <EmptyState icon={FiLayers} title="No chapters" description="Thêm chương để lọc quiz và phân tích điểm yếu." /> : (
                  <div className="space-y-2">
                    {chapters.map(chapter => (
                      <div key={chapter.id} className="rounded-lg border border-outline-variant/40 p-3">
                        <p className="font-semibold">{chapter.order_index}. {chapter.title}</p>
                        <p className="text-xs text-on-surface-variant">{chapter.flashcard_count} cards · {chapter.question_count} questions</p>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
              <SectionCard className="p-5">
                <h2 className="mb-4 font-heading text-lg font-bold">Add Question</h2>
                <div className="space-y-3">
                  <select className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={questionForm.chapter_id} onChange={e => setQuestionForm({ ...questionForm, chapter_id: e.target.value })}>
                    <option value="">No chapter</option>
                    {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                  <textarea className="h-24 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Question text" value={questionForm.question_text} onChange={e => setQuestionForm({ ...questionForm, question_text: e.target.value })} />
                  <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Options separated by |" value={questionForm.options} onChange={e => setQuestionForm({ ...questionForm, options: e.target.value })} />
                  <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Correct answer" value={questionForm.correct_answer} onChange={e => setQuestionForm({ ...questionForm, correct_answer: e.target.value })} />
                  <textarea className="h-20 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Explanation" value={questionForm.explanation} onChange={e => setQuestionForm({ ...questionForm, explanation: e.target.value })} />
                  <select className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={questionForm.difficulty} onChange={e => setQuestionForm({ ...questionForm, difficulty: e.target.value })}>
                    <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
                  </select>
                  <GradientButton onClick={addQuestion} className="w-full"><FiPlus className="mr-2" /> Add Question</GradientButton>
                </div>
              </SectionCard>
            </aside>
            <SectionCard className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold"><FiTarget /> Question Bank</h2>
              {questions.length === 0 ? <EmptyState icon={FiCheckCircle} title="No questions" description="Import hoặc tạo câu hỏi để làm quiz theo chương." /> : (
                <div className="divide-y divide-outline-variant/20">
                  {questions.map(question => (
                    <div key={question.id} className="py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded bg-surface-variant px-2 py-1 text-xs font-bold">{question.difficulty}</span>
                        <span className="text-xs text-on-surface-variant">{chapters.find(c => c.id === question.chapter_id)?.title || 'No chapter'}</span>
                      </div>
                      <p className="font-semibold">{question.question_text}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">Answer: {question.correct_answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </AppShell>
  )
}
