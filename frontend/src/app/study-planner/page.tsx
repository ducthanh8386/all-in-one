'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Subject } from '@/types/examPlanner'
import { FiClock, FiPlay, FiSquare } from 'react-icons/fi'

export default function StudyPlannerPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [planner, setPlanner] = useState<any>({ goals: [], sessions: [], stats: {} })
  const [goalForm, setGoalForm] = useState({ subject_id: '', title: '', target_minutes: '300', deadline: '' })
  const [sessionSubject, setSessionSubject] = useState('')
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)

  const minutes = useMemo(() => Math.floor(seconds / 60), [seconds])

  const load = useCallback(async () => {
    const [subjectsRes, plannerRes] = await Promise.all([apiClient.get<Subject[]>('/api/v1/subjects'), apiClient.get('/api/v1/planner')])
    setSubjects(subjectsRes.data)
    setPlanner(plannerRes.data)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const finishPomodoro = useCallback(async () => {
    setRunning(false)
    await apiClient.post('/api/v1/planner/sessions', { subject_id: sessionSubject ? Number(sessionSubject) : null, minutes: 25, activity_type: 'POMODORO' })
    setSeconds(25 * 60)
    await load()
  }, [load, sessionSubject])

  useEffect(() => {
    if (running && seconds === 0) finishPomodoro()
  }, [finishPomodoro, seconds, running])

  const createGoal = async () => {
    if (!goalForm.subject_id || !goalForm.title.trim()) return
    await apiClient.post('/api/v1/planner/goals', {
      subject_id: Number(goalForm.subject_id),
      title: goalForm.title,
      target_minutes: Number(goalForm.target_minutes),
      deadline: goalForm.deadline ? new Date(goalForm.deadline).toISOString() : null,
    })
    setGoalForm({ subject_id: '', title: '', target_minutes: '300', deadline: '' })
    await load()
  }

  return (
    <AppShell>
      <PageHeader title="Study Planner" subtitle="Goals, Pomodoro sessions, study log and streak stats." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <SectionCard className="p-6 text-center">
            <FiClock className="mx-auto mb-3 text-4xl text-primary" />
            <p className="font-mono text-5xl font-bold">{String(minutes).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>
            <select className="mt-5 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={sessionSubject} onChange={e => setSessionSubject(e.target.value)}>
              <option value="">No subject</option>
              {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <div className="mt-4 flex justify-center gap-3">
              <GradientButton onClick={() => setRunning(true)}><FiPlay className="mr-2" /> Start</GradientButton>
              <button onClick={finishPomodoro} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-bold"><FiSquare className="mr-1 inline" /> Finish</button>
            </div>
          </SectionCard>
          <SectionCard className="p-5">
            <h2 className="mb-4 font-heading text-lg font-bold">New Goal</h2>
            <div className="space-y-3">
              <select className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" value={goalForm.subject_id} onChange={e => setGoalForm({ ...goalForm, subject_id: e.target.value })}>
                <option value="">Subject</option>
                {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Goal title" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} />
              <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" placeholder="Target minutes" value={goalForm.target_minutes} onChange={e => setGoalForm({ ...goalForm, target_minutes: e.target.value })} />
              <input className="w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3 text-sm" type="datetime-local" value={goalForm.deadline} onChange={e => setGoalForm({ ...goalForm, deadline: e.target.value })} />
              <GradientButton onClick={createGoal} className="w-full">Create Goal</GradientButton>
            </div>
          </SectionCard>
        </aside>
        <main className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SectionCard className="p-5"><p className="text-sm text-on-surface-variant">Current streak</p><p className="text-3xl font-bold">{planner.stats?.current_streak || 0}</p></SectionCard>
            <SectionCard className="p-5"><p className="text-sm text-on-surface-variant">Longest streak</p><p className="text-3xl font-bold">{planner.stats?.longest_streak || 0}</p></SectionCard>
            <SectionCard className="p-5"><p className="text-sm text-on-surface-variant">Total minutes</p><p className="text-3xl font-bold">{planner.stats?.total_study_minutes || 0}</p></SectionCard>
          </div>
          <SectionCard className="p-6">
            <h2 className="mb-4 font-heading text-lg font-bold">Goals</h2>
            {planner.goals?.length ? planner.goals.map((goal: any) => (
              <div key={goal.id} className="mb-3 rounded-lg border border-outline-variant/40 p-4">
                <div className="mb-2 flex justify-between text-sm"><b>{goal.title}</b><span>{goal.completed_minutes}/{goal.target_minutes} min</span></div>
                <div className="h-2 rounded-full bg-surface-variant"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (goal.completed_minutes / goal.target_minutes) * 100)}%` }} /></div>
              </div>
            )) : <EmptyState icon={FiClock} title="No goals" description="Tạo mục tiêu học tập theo môn để theo dõi tiến độ." />}
          </SectionCard>
          <SectionCard className="p-6">
            <h2 className="mb-4 font-heading text-lg font-bold">Study Log</h2>
            {planner.sessions?.length ? planner.sessions.map((session: any) => <div key={session.id} className="border-b border-outline-variant/20 py-3 text-sm">{session.minutes} minutes · {session.activity_type} · {new Date(session.studied_at).toLocaleString()}</div>) : <EmptyState icon={FiClock} title="No sessions" description="Kết thúc Pomodoro để ghi study log." />}
          </SectionCard>
        </main>
      </div>
    </AppShell>
  )
}
