'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/axios'
import { useAuthStore } from '@/store/authStore'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { AIComingSoonBadge } from '@/components/shared/AIComingSoonBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { DashboardAnalytics } from '@/types/examPlanner'

import { 
  FiFileText, FiLayers, FiTarget, FiCalendar, FiPlus, 
  FiUploadCloud, FiCpu, FiPlayCircle, FiArrowRight 
} from 'react-icons/fi'
import { isSameDay } from 'date-fns'

interface DashboardStats {
  docsCount: number
  cardsCount: number
  dueCardsCount: number
  schedulesToday: number
  recentDocs: any[]
  analytics?: DashboardAnalytics | null
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [docsRes, cardsRes, dueRes, schedulesRes, analyticsRes] = await Promise.all([
          apiClient.get<any[]>('/api/v1/documents'),
          apiClient.get<any[]>('/api/v1/flashcards'),
          apiClient.get<any[]>('/api/v1/flashcards/due'),
          apiClient.get<any[]>('/api/v1/schedules'),
          apiClient.get<DashboardAnalytics>('/api/v1/analytics/dashboard').catch(() => ({ data: null })),
        ])

        const docs = docsRes.data || []
        const today = new Date()
        const schedules = schedulesRes.data || []
        const todaysSchedules = schedules.filter(s => isSameDay(new Date(s.start_time), today))

        setStats({
          docsCount: docs.length,
          cardsCount: (cardsRes.data || []).length,
          dueCardsCount: (dueRes.data || []).length,
          schedulesToday: todaysSchedules.length,
          recentDocs: docs.slice(0, 3),
          analytics: analyticsRes.data
        })
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        // gracefully degrade
        setStats({
          docsCount: 0,
          cardsCount: 0,
          dueCardsCount: 0,
          schedulesToday: 0,
          recentDocs: [],
          analytics: null
        })
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  return (
    <AppShell>
      <PageHeader 
        title={`Welcome back, ${user?.username || 'Student'}`} 
        subtitle="Here's your study sync for today." 
        actions={
          <div className="flex items-center gap-3">
            <Link href="/workspace">
              <GradientButton variant="secondary"><FiUploadCloud className="mr-2" /> Upload</GradientButton>
            </Link>
            <Link href="/flashcards">
              <GradientButton><FiPlayCircle className="mr-2" /> Start Review</GradientButton>
            </Link>
          </div>
        }
      />
      
      {loading || !stats ? (
        <div className="space-y-6">
          <LoadingSkeleton type="card" className="h-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <LoadingSkeleton type="card" className="h-32" />
            <LoadingSkeleton type="card" className="h-32" />
            <LoadingSkeleton type="card" className="h-32" />
            <LoadingSkeleton type="card" className="h-32" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Hero Focus Card */}
          <SectionCard className="p-8 md:p-12 bg-gradient-to-br from-primary to-tertiary border-none shadow-xl text-on-primary overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/3" />
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-widest mb-6">
                <FiTarget /> Today&apos;s Focus
              </div>
              <h1 className="text-3xl md:text-5xl font-heading font-bold mb-4 leading-tight">
                {stats.dueCardsCount > 0 
                  ? `You have ${stats.dueCardsCount} flashcards to review.` 
                  : "You&apos;re all caught up for today!"}
              </h1>
              <p className="text-primary-container mb-8 text-lg">
                {stats.schedulesToday > 0 
                  ? `You have ${stats.schedulesToday} study session(s) scheduled today.` 
                  : "No study sessions planned for today."}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/flashcards">
                  <GradientButton className="bg-white text-primary hover:bg-white/90 border-none shadow-lg">
                    {stats.dueCardsCount > 0 ? 'Start Reviewing' : 'Practice Quiz'} <FiArrowRight className="ml-2" />
                  </GradientButton>
                </Link>
                <Link href="/schedule" className="px-6 py-3 font-semibold text-white hover:bg-white/10 rounded-xl transition-colors">
                  Plan Study
                </Link>
              </div>
            </div>
          </SectionCard>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <SectionCard className="p-6 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-primary-container/30 text-primary flex items-center justify-center mb-4">
                <FiFileText className="text-xl" />
              </div>
              <p className="text-sm font-medium text-on-surface-variant mb-1">Total Documents</p>
              <h3 className="text-3xl font-heading font-bold text-on-surface">{stats.docsCount}</h3>
            </SectionCard>

            <SectionCard className="p-6 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-tertiary-container/30 text-tertiary flex items-center justify-center mb-4">
                <FiLayers className="text-xl" />
              </div>
              <p className="text-sm font-medium text-on-surface-variant mb-1">Total Flashcards</p>
              <h3 className="text-3xl font-heading font-bold text-on-surface">{stats.cardsCount}</h3>
            </SectionCard>

            <SectionCard className={`p-6 flex flex-col justify-between ${stats.dueCardsCount > 0 ? 'border-primary shadow-sm' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <FiTarget className="text-xl" />
              </div>
              <p className="text-sm font-medium text-on-surface-variant mb-1">Due Today</p>
              <h3 className="text-3xl font-heading font-bold text-primary">{stats.dueCardsCount}</h3>
            </SectionCard>

            <SectionCard className="p-6 flex flex-col justify-between">
              <div className="w-10 h-10 rounded-xl bg-surface-variant text-on-surface-variant flex items-center justify-center mb-4">
                <FiCalendar className="text-xl" />
              </div>
              <p className="text-sm font-medium text-on-surface-variant mb-1">Study Sessions</p>
              <h3 className="text-3xl font-heading font-bold text-on-surface">{stats.schedulesToday}</h3>
            </SectionCard>
          </div>

          {stats.analytics && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <SectionCard className="p-6">
                <h3 className="mb-4 font-heading font-bold text-on-surface">Exam Countdown</h3>
                {stats.analytics.exam_countdown.length === 0 ? <p className="text-sm text-on-surface-variant">No exam dates yet.</p> : stats.analytics.exam_countdown.map(item => (
                  <div key={item.subject_id} className="mb-3 rounded-lg bg-surface-container-lowest p-3 text-sm">
                    <b>{item.name}</b><span className="float-right text-primary">{item.days_left} days</span>
                  </div>
                ))}
              </SectionCard>
              <SectionCard className="p-6">
                <h3 className="mb-4 font-heading font-bold text-on-surface">Weak Chapters</h3>
                {stats.analytics.weak_chapters.length === 0 ? <p className="text-sm text-on-surface-variant">No weak chapter detected.</p> : stats.analytics.weak_chapters.map(item => (
                  <div key={item.chapter_id} className="mb-3 rounded-lg bg-error-container/20 p-3 text-sm">
                    <b>{item.chapter_title}</b><span className="float-right text-error">{item.accuracy}%</span>
                  </div>
                ))}
              </SectionCard>
              <SectionCard className="p-6">
                <h3 className="mb-4 font-heading font-bold text-on-surface">Planner Stats</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-surface-container-lowest p-3"><p>Streak</p><b className="text-xl">{stats.analytics.current_streak}</b></div>
                  <div className="rounded-lg bg-surface-container-lowest p-3"><p>Mistakes</p><b className="text-xl">{stats.analytics.mistake_count}</b></div>
                  <div className="col-span-2 rounded-lg bg-surface-container-lowest p-3"><p>This week</p><b className="text-xl">{stats.analytics.study_time_this_week} min</b></div>
                </div>
              </SectionCard>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Recent Documents */}
            <SectionCard className="lg:col-span-2 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-bold text-lg text-on-surface">Recent Documents</h3>
                <Link href="/workspace" className="text-sm font-medium text-primary hover:underline">View All</Link>
              </div>
              
              {stats.recentDocs.length === 0 ? (
                <EmptyState 
                  icon={FiFileText}
                  title="No documents yet"
                  description="Upload a PDF to start extracting concepts."
                  action={
                    <Link href="/workspace">
                      <GradientButton variant="secondary" size="sm">Upload Document</GradientButton>
                    </Link>
                  }
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {stats.recentDocs.map(doc => (
                    <Link key={doc.id} href={`/workspace/${doc.id}`} className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:border-primary/50 transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-surface-variant text-on-surface-variant flex items-center justify-center group-hover:bg-primary-container group-hover:text-primary transition-colors">
                          <FiFileText />
                        </div>
                        <div>
                          <h4 className="font-semibold text-on-surface text-sm mb-0.5">{doc.title}</h4>
                          <p className="text-xs text-on-surface-variant">{doc.status}</p>
                        </div>
                      </div>
                      <FiArrowRight className="text-on-surface-variant group-hover:text-primary transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Quick Actions & AI Teaser */}
            <div className="flex flex-col gap-6">
              <SectionCard className="p-6">
                <h3 className="font-heading font-bold text-lg text-on-surface mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/flashcards" className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-variant transition-colors flex flex-col items-center text-center gap-2">
                    <FiLayers className="text-xl text-primary" />
                    <span className="text-xs font-semibold">Flashcards</span>
                  </Link>
                  <Link href="/flashcards/quiz" className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-variant transition-colors flex flex-col items-center text-center gap-2">
                    <FiPlayCircle className="text-xl text-tertiary" />
                    <span className="text-xs font-semibold">Quiz Mode</span>
                  </Link>
                  <Link href="/schedule" className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-variant transition-colors flex flex-col items-center text-center gap-2">
                    <FiCalendar className="text-xl text-on-surface" />
                    <span className="text-xs font-semibold">Schedule</span>
                  </Link>
                  <Link href="/arena" className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-variant transition-colors flex flex-col items-center text-center gap-2">
                    <FiTarget className="text-xl text-success" />
                    <span className="text-xs font-semibold">Arena</span>
                  </Link>
                </div>
              </SectionCard>

              {/* AI Badge Teaser */}
              <SectionCard className="p-5 border-dashed border-primary/30 bg-primary-container/5 relative overflow-hidden">
                <AIComingSoonBadge className="absolute top-4 right-4" />
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary-container/50 text-primary flex items-center justify-center">
                    <FiCpu />
                  </div>
                  <h4 className="font-bold text-on-surface text-sm">Study Coach</h4>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Tính năng AI đang phát triển. Phân tích tiến độ học và gợi ý lịch ôn tập cá nhân hóa.
                </p>
              </SectionCard>
            </div>

          </div>

        </div>
      )}
    </AppShell>
  )
}
