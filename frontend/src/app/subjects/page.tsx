'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { Subject } from '@/types/examPlanner'
import { FiBookOpen, FiCalendar, FiPlus, FiTarget } from 'react-icons/fi'

const emptyForm = { name: '', code: '', teacher_name: '', exam_date: '', target_score: '', color: '#2563eb', description: '' }

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get<Subject[]>('/api/v1/subjects')
      setSubjects(res.data)
      setError('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không tải được danh sách môn học.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const createSubject = async () => {
    if (!form.name.trim()) return setError('Tên môn học là bắt buộc.')
    try {
      await apiClient.post('/api/v1/subjects', {
        ...form,
        exam_date: form.exam_date ? new Date(form.exam_date).toISOString() : null,
        target_score: form.target_score ? Number(form.target_score) : null,
      })
      setForm(emptyForm)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Tạo môn học thất bại.'))
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="My Subjects"
        subtitle="Quản lý môn học, deadline thi, mục tiêu điểm và chương học."
        actions={<GradientButton onClick={createSubject}><FiPlus className="mr-2" /> Add Subject</GradientButton>}
      />
      {error && <div className="mb-4 rounded-lg bg-error-container/40 px-4 py-3 text-sm font-semibold text-error">{error}</div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <SectionCard className="p-5">
          <h2 className="mb-4 font-heading text-lg font-bold">New Subject</h2>
          <div className="space-y-3">
            <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="Subject name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
            </div>
            <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="Teacher" value={form.teacher_name} onChange={e => setForm({ ...form, teacher_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" type="datetime-local" value={form.exam_date} onChange={e => setForm({ ...form, exam_date: e.target.value })} />
              <input className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="Target /10" value={form.target_score} onChange={e => setForm({ ...form, target_score: e.target.value })} />
            </div>
            <textarea className="h-24 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm outline-none focus:border-primary" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </SectionCard>
        <main>
          {loading ? <LoadingSkeleton type="card" className="h-80" /> : subjects.length === 0 ? (
            <EmptyState icon={FiBookOpen} title="No subjects yet" description="Tạo môn học đầu tiên để gắn flashcard, câu hỏi và kế hoạch ôn thi." />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {subjects.map(subject => (
                <Link key={subject.id} href={`/subjects/${subject.id}`} className="block">
                  <SectionCard className="p-5 transition-colors hover:border-primary/50">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 h-2 w-16 rounded-full" style={{ backgroundColor: subject.color }} />
                        <h3 className="truncate font-heading text-xl font-bold">{subject.name}</h3>
                        <p className="text-sm text-on-surface-variant">{subject.code || 'No code'}{subject.teacher_name ? ` · ${subject.teacher_name}` : ''}</p>
                      </div>
                      <span className="rounded-lg bg-surface-variant px-2 py-1 text-xs font-bold">{subject.chapter_count} chapters</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-on-surface-variant">Cards</p><p className="font-bold">{subject.flashcard_count}</p></div>
                      <div><p className="text-on-surface-variant">Questions</p><p className="font-bold">{subject.question_count}</p></div>
                      <div><p className="text-on-surface-variant">Target</p><p className="font-bold">{subject.target_score ?? '-'}</p></div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
                      <FiCalendar /> {subject.exam_date ? new Date(subject.exam_date).toLocaleDateString() : 'No exam date'}
                      <FiTarget className="ml-3" /> Goal tracked
                    </div>
                  </SectionCard>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </AppShell>
  )
}
