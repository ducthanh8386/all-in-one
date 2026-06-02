'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  dateFnsLocalizer,
  SlotInfo,
  Views,
} from 'react-big-calendar'
import { format, getDay, parse, startOfWeek, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { Schedule, useSchedulerStore } from '@/store/schedulerStore'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'

import { FiCalendar, FiClock, FiFileText, FiPlus, FiEdit2, FiTrash2, FiExternalLink, FiX, FiCheckCircle } from 'react-icons/fi'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentOption {
  id: number
  title: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
}

interface ScheduleFormState {
  title: string
  description: string
  start_time: string
  end_time: string
  is_recurring: boolean
  recurrence_rule: string
  reference_doc_id: string
}

interface CalendarEvent {
  id: number
  title: string
  start: Date
  end: Date
  resource: Schedule
}

// ─── Configuration ────────────────────────────────────────────────────────────

const locales = { vi }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

const emptyForm: ScheduleFormState = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  is_recurring: false,
  recurrence_rule: '',
  reference_doc_id: '',
}

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function formFromSchedule(schedule: Schedule): ScheduleFormState {
  return {
    title: schedule.title,
    description: schedule.description ?? '',
    start_time: toDateTimeLocal(new Date(schedule.start_time)),
    end_time: toDateTimeLocal(new Date(schedule.end_time)),
    is_recurring: schedule.is_recurring,
    recurrence_rule: schedule.recurrence_rule ?? '',
    reference_doc_id: schedule.reference_doc_id ? String(schedule.reference_doc_id) : '',
  }
}

function buildPayload(form: ScheduleFormState) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    start_time: new Date(form.start_time).toISOString(),
    end_time: new Date(form.end_time).toISOString(),
    is_recurring: form.is_recurring,
    recurrence_rule: form.is_recurring ? form.recurrence_rule || null : null,
    reference_doc_id: form.reference_doc_id ? Number(form.reference_doc_id) : null,
  }
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { schedules, setSchedules, addSchedule, updateSchedule, deleteSchedule } = useSchedulerStore()
  
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [form, setForm] = useState<ScheduleFormState>(emptyForm)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; id: number } | null>(null)

  const completedDocs = useMemo(() => documents.filter((doc) => doc.status === 'COMPLETED'), [documents])

  const events = useMemo<CalendarEvent[]>(
    () =>
      schedules.map((schedule) => ({
        id: schedule.id,
        title: schedule.title,
        start: new Date(schedule.start_time),
        end: new Date(schedule.end_time),
        resource: schedule,
      })),
    [schedules]
  )

  const selectedDocument = selectedSchedule?.reference_doc_id
    ? documents.find((doc) => doc.id === selectedSchedule.reference_doc_id)
    : null

  // ── Fetch Initial Data ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true)
      try {
        const [scheduleRes, documentRes] = await Promise.all([
          apiClient.get<Schedule[]>('/api/v1/schedules'),
          apiClient.get<DocumentOption[]>('/api/v1/documents'),
        ])
        setSchedules(scheduleRes.data)
        setDocuments(documentRes.data)
      } catch (error) {
        showToast('error', getApiErrorMessage(error))
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [setSchedules])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now()
    setToast({ type, message, id })
    window.setTimeout(() => setToast(current => current?.id === id ? null : current), 4000)
  }

  const openCreateModal = (start?: Date, end?: Date) => {
    const now = new Date()
    const defaultStart = start ?? now
    const defaultEnd = end ?? new Date(defaultStart.getTime() + 60 * 60 * 1000)
    setSelectedSchedule(null)
    setForm({
      ...emptyForm,
      start_time: toDateTimeLocal(defaultStart),
      end_time: toDateTimeLocal(defaultEnd),
    })
    setModalOpen(true)
  }

  const openEditModal = (schedule: Schedule) => {
    setSelectedSchedule(schedule)
    setForm(formFromSchedule(schedule))
    setModalOpen(true)
  }

  const handleSelectSlot = (slot: SlotInfo) => {
    openCreateModal(slot.start, slot.end)
  }

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedSchedule(event.resource)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(emptyForm)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) {
      showToast('error', 'Title is required.')
      return
    }
    if (!form.start_time || !form.end_time || new Date(form.end_time) <= new Date(form.start_time)) {
      showToast('error', 'End time must be strictly after start time.')
      return
    }

    setSaving(true)
    try {
      const payload = buildPayload(form)
      if (selectedSchedule) {
        const response = await apiClient.put<Schedule>(`/api/v1/schedules/${selectedSchedule.id}`, payload)
        updateSchedule(selectedSchedule.id, response.data)
        setSelectedSchedule(response.data)
        showToast('success', 'Study block updated successfully.')
      } else {
        const response = await apiClient.post<Schedule>('/api/v1/schedules', payload)
        addSchedule(response.data)
        setSelectedSchedule(response.data)
        showToast('success', 'Study block created successfully.')
      }
      closeModal()
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (schedule: Schedule) => {
    if (!window.confirm('Delete this study block?')) return
    try {
      await apiClient.delete(`/api/v1/schedules/${schedule.id}`)
      deleteSchedule(schedule.id)
      setSelectedSchedule(null)
      showToast('success', 'Study block deleted.')
    } catch (error) {
      showToast('error', getApiErrorMessage(error))
    }
  }

  // ── Today's Data ─────────────────────────────────────────────────────────
  const today = new Date()
  const todaysEvents = events.filter(e => isSameDay(e.start, today)).sort((a, b) => a.start.getTime() - b.start.getTime())

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Toast Notification */}
      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium
          border backdrop-blur-md transition-all duration-300 flex items-center gap-3
          ${toast.type === 'success' ? 'bg-success-container/90 border-success-container text-on-success-container' : 'bg-error-container/90 border-error-container text-on-error-container'}
        `}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <PageHeader 
        title="Study Planner" 
        subtitle="Plan your sessions and keep your reviews on track."
        actions={
          <GradientButton onClick={() => openCreateModal()}>
            <FiPlus className="mr-2" /> Create Study Block
          </GradientButton>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        
        {/* Main Calendar View */}
        <div className="flex flex-col gap-6">
          <SectionCard className="p-4 md:p-6 bg-surface-container-lowest min-h-[700px] overflow-hidden">
            {loading ? (
              <div className="flex h-full min-h-[600px] items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="h-[700px] rbc-theme-stitch">
                {/* Custom CSS overrides for React Big Calendar will apply globally or via parent context */}
                <style dangerouslySetInnerHTML={{__html: `
                  .rbc-theme-stitch .rbc-calendar { font-family: inherit; }
                  .rbc-theme-stitch .rbc-header { padding: 10px 0; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); }
                  .rbc-theme-stitch .rbc-today { background-color: rgba(99, 102, 241, 0.05); }
                  .rbc-theme-stitch .rbc-event { border-radius: 6px; padding: 2px 6px; }
                  .rbc-theme-stitch .rbc-time-view, .rbc-theme-stitch .rbc-month-view { border-color: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
                  .rbc-theme-stitch .rbc-day-bg + .rbc-day-bg { border-left: 1px solid rgba(255,255,255,0.05); }
                  .rbc-theme-stitch .rbc-time-content { border-top: 1px solid rgba(255,255,255,0.05); }
                  .rbc-theme-stitch .rbc-timeslot-group { border-bottom: 1px solid rgba(255,255,255,0.05); }
                  .rbc-theme-stitch .rbc-time-header-content { border-left: 1px solid rgba(255,255,255,0.1); }
                  .rbc-toolbar button { border: 1px solid rgba(255,255,255,0.2) !important; color: inherit !important; border-radius: 8px !important; margin-right: 8px !important; }
                  .rbc-toolbar button:hover { background-color: rgba(255,255,255,0.1) !important; }
                  .rbc-toolbar button.rbc-active { background-color: rgba(99, 102, 241, 0.2) !important; color: #818cf8 !important; border-color: #6366f1 !important; box-shadow: none !important; }
                `}} />
                <Calendar
                  localizer={localizer}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  titleAccessor="title"
                  defaultView={Views.WEEK}
                  views={[Views.MONTH, Views.WEEK, Views.DAY]}
                  selectable
                  popup
                  step={30}
                  timeslots={2}
                  onSelectSlot={handleSelectSlot}
                  onSelectEvent={handleSelectEvent}
                  eventPropGetter={(event) => {
                    // Highlight selected event
                    const isSelected = selectedSchedule?.id === event.id
                    return {
                      className: `border-none shadow-sm transition-all text-xs font-medium ${
                        isSelected 
                          ? 'bg-primary text-on-primary ring-2 ring-primary-container ring-offset-2 ring-offset-surface-container-lowest' 
                          : 'bg-primary/80 text-on-primary hover:bg-primary'
                      }`,
                    }
                  }}
                />
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right Sidebar */}
        <div className="flex flex-col gap-6">
          
          {/* Today Panel */}
          <SectionCard className="p-6 border-primary/20 bg-gradient-to-b from-primary-container/10 to-surface-container-low">
            <h3 className="font-heading font-bold text-on-surface text-lg mb-1 flex items-center gap-2">
              <FiCalendar className="text-primary" /> Today&apos;s Focus
            </h3>
            <p className="text-sm text-on-surface-variant mb-6">
              {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            <div className="space-y-3">
              {todaysEvents.length === 0 ? (
                <div className="text-center py-6 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                  <p className="text-sm text-on-surface-variant mb-3">No study blocks planned for today.</p>
                  <GradientButton variant="secondary" size="sm" onClick={() => openCreateModal()}>
                    Schedule Now
                  </GradientButton>
                </div>
              ) : (
                todaysEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => handleSelectEvent(event)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedSchedule?.id === event.id 
                        ? 'border-primary bg-primary-container/20' 
                        : 'border-outline-variant/30 bg-surface-container-lowest hover:border-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-on-surface text-sm mb-1 truncate">{event.title}</div>
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <FiClock /> {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                    </div>
                  </button>
                ))
              )}
            </div>
          </SectionCard>

          {/* Selected Event Details Panel */}
          <SectionCard className="p-6 flex-1 flex flex-col">
            {selectedSchedule ? (
              <div className="space-y-6">
                <div>
                  <div className="inline-block px-2.5 py-1 bg-surface-variant text-on-surface-variant text-[10px] font-bold uppercase tracking-widest rounded-md mb-3">
                    Selected Block
                  </div>
                  <h2 className="text-xl font-heading font-bold text-on-surface leading-tight">
                    {selectedSchedule.title}
                  </h2>
                  {selectedSchedule.description && (
                    <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
                      {selectedSchedule.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                    <p className="text-xs font-medium text-on-surface-variant mb-1">Start Time</p>
                    <p className="text-sm font-semibold text-on-surface">{format(new Date(selectedSchedule.start_time), 'HH:mm')}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{format(new Date(selectedSchedule.start_time), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                    <p className="text-xs font-medium text-on-surface-variant mb-1">End Time</p>
                    <p className="text-sm font-semibold text-on-surface">{format(new Date(selectedSchedule.end_time), 'HH:mm')}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{format(new Date(selectedSchedule.end_time), 'MMM d, yyyy')}</p>
                  </div>
                </div>

                {selectedSchedule.flashcard_due_count !== undefined && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary-container/10 border border-primary/20">
                    <span className="text-sm font-medium text-on-surface">Flashcards Due</span>
                    <span className="text-primary font-bold">{selectedSchedule.flashcard_due_count}</span>
                  </div>
                )}

                {selectedDocument && (
                  <div>
                    <p className="text-xs font-medium text-on-surface-variant mb-2">Linked Material</p>
                    <Link
                      href={`/workspace/${selectedDocument.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest hover:border-primary/50 hover:bg-surface-container-low transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary-container/30 text-primary flex items-center justify-center shrink-0">
                        <FiFileText />
                      </div>
                      <span className="text-sm font-medium text-on-surface truncate flex-1 group-hover:text-primary transition-colors">
                        {selectedDocument.title}
                      </span>
                      <FiExternalLink className="text-on-surface-variant group-hover:text-primary transition-colors" />
                    </Link>
                  </div>
                )}

                <div className="pt-4 border-t border-outline-variant/30 flex items-center gap-3 mt-auto">
                  <button
                    onClick={() => openEditModal(selectedSchedule)}
                    className="flex-1 py-2.5 rounded-xl bg-surface-variant text-on-surface-variant font-medium text-sm hover:bg-surface-container-highest hover:text-on-surface transition-colors flex items-center justify-center gap-2"
                  >
                    <FiEdit2 /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(selectedSchedule)}
                    className="flex-1 py-2.5 rounded-xl bg-error-container/20 text-error font-medium text-sm border border-error/20 hover:bg-error-container hover:text-on-error-container transition-colors flex items-center justify-center gap-2"
                  >
                    <FiTrash2 /> Delete
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState 
                icon={FiCalendar}
                title="No block selected"
                description="Click on a calendar event to view its details, or click any empty slot to create a new one."
              />
            )}
          </SectionCard>

        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <SectionCard className="w-full max-w-lg p-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-low flex items-center justify-between">
              <h2 className="text-xl font-heading font-bold text-on-surface">
                {selectedSchedule ? 'Edit Study Block' : 'Create Study Block'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors"
              >
                <FiX />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
              
              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Block Title <span className="text-error">*</span></label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Biology Review"
                  className="w-full px-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What will you focus on?"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-1.5">Start Time <span className="text-error">*</span></label>
                  <input
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface [color-scheme:dark]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-1.5">End Time <span className="text-error">*</span></label>
                  <input
                    type="datetime-local"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface [color-scheme:dark]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-on-surface mb-1.5">Link to Document</label>
                <div className="relative">
                  <select
                    value={form.reference_doc_id}
                    onChange={(e) => setForm({ ...form, reference_doc_id: e.target.value })}
                    className="w-full appearance-none px-4 py-2.5 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface cursor-pointer"
                  >
                    <option value="">No Document</option>
                    {completedDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                    ▼
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input
                      type="checkbox"
                      checked={form.is_recurring}
                      onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                      className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded bg-surface-container-lowest checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary/30 transition-colors cursor-pointer"
                    />
                    <FiCheckCircle className="absolute text-on-primary w-3.5 h-3.5 opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                  </div>
                  <span className="text-sm font-medium text-on-surface">Repeat this session</span>
                </label>
                
                {form.is_recurring && (
                  <div className="relative pl-8 animate-in slide-in-from-top-2 duration-200">
                    <select
                      value={form.recurrence_rule}
                      onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })}
                      className="w-full appearance-none px-4 py-2 bg-surface-container-lowest border border-outline-variant/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-on-surface cursor-pointer"
                      required={form.is_recurring}
                    >
                      <option value="">Select recurrence frequency</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                      ▼
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-6 py-2.5 rounded-xl font-medium text-sm bg-surface-variant text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <GradientButton
                  type="submit"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Block'}
                </GradientButton>
              </div>

            </form>
          </SectionCard>
        </div>
      )}

    </AppShell>
  )
}
