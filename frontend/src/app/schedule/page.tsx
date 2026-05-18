'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  dateFnsLocalizer,
  SlotInfo,
  Views,
} from 'react-big-calendar'
import { format, getDay, parse, startOfWeek } from 'date-fns'
import { vi } from 'date-fns/locale'
import apiClient from '@/lib/axios'
import { Schedule, useSchedulerStore } from '@/store/schedulerStore'

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

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: any } }).response
    return (
      response?.data?.detail?.error?.message ||
      response?.data?.detail?.message ||
      response?.data?.detail ||
      'Request failed.'
    )
  }
  return 'Request failed.'
}

export default function SchedulePage() {
  const { schedules, setSchedules, addSchedule, updateSchedule, deleteSchedule } =
    useSchedulerStore()
  const [documents, setDocuments] = useState<DocumentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [form, setForm] = useState<ScheduleFormState>(emptyForm)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const completedDocs = useMemo(
    () => documents.filter((document) => document.status === 'COMPLETED'),
    [documents]
  )

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
    ? documents.find((document) => document.id === selectedSchedule.reference_doc_id)
    : null

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3500)
  }

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
        showToast('error', getErrorMessage(error))
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [setSchedules])

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
      showToast('error', 'End time must be after start time.')
      return
    }

    setSaving(true)
    try {
      const payload = buildPayload(form)
      if (selectedSchedule) {
        const response = await apiClient.put<Schedule>(
          `/api/v1/schedules/${selectedSchedule.id}`,
          payload
        )
        updateSchedule(selectedSchedule.id, response.data)
        setSelectedSchedule(response.data)
        showToast('success', 'Schedule updated.')
      } else {
        const response = await apiClient.post<Schedule>('/api/v1/schedules', payload)
        addSchedule(response.data)
        setSelectedSchedule(response.data)
        showToast('success', 'Schedule created.')
      }
      closeModal()
    } catch (error) {
      showToast('error', getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (schedule: Schedule) => {
    if (!window.confirm('Delete this schedule?')) {
      return
    }
    try {
      await apiClient.delete(`/api/v1/schedules/${schedule.id}`)
      deleteSchedule(schedule.id)
      setSelectedSchedule(null)
      showToast('success', 'Schedule deleted.')
    } catch (error) {
      showToast('error', getErrorMessage(error))
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 max-w-sm rounded-md border px-4 py-3 text-sm shadow-xl ${
            toast.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
              : 'border-red-500/40 bg-red-950 text-red-100'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm text-slate-400">Study calendar</p>
            <h1 className="text-3xl font-semibold tracking-normal text-white">Schedule</h1>
          </div>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 md:w-auto"
          >
            New schedule
          </button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-h-[680px] rounded-md border border-white/10 bg-white p-3 text-slate-950">
            {loading ? (
              <div className="flex h-[640px] items-center justify-center text-sm text-slate-500">
                Loading schedules...
              </div>
            ) : (
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
                style={{ minHeight: 640 }}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleSelectEvent}
                eventPropGetter={() => ({
                  className: 'rounded-md border-none bg-emerald-600 text-white',
                })}
              />
            )}
          </div>

          <aside className="rounded-md border border-white/10 bg-white/[0.04] p-5">
            {selectedSchedule ? (
              <div className="space-y-5">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                    Selected block
                  </p>
                  <h2 className="text-xl font-semibold text-white">{selectedSchedule.title}</h2>
                  {selectedSchedule.description && (
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {selectedSchedule.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-500">Start:</span>{' '}
                    {new Date(selectedSchedule.start_time).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-slate-500">End:</span>{' '}
                    {new Date(selectedSchedule.end_time).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-slate-500">Due cards:</span>{' '}
                    {selectedSchedule.flashcard_due_count}
                  </p>
                </div>

                {selectedDocument && (
                  <Link
                    href={`/workspace/${selectedDocument.id}`}
                    className="block rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/20"
                  >
                    Open document: {selectedDocument.title}
                  </Link>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedSchedule)}
                    className="flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedSchedule)}
                    className="flex-1 rounded-md border border-red-400/40 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] flex-col justify-center text-sm leading-6 text-slate-400">
                <p>Select a calendar block to inspect it.</p>
                <p>Click or drag on the calendar to create a new study block.</p>
              </div>
            )}
          </aside>
        </section>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-xl rounded-md border border-white/10 bg-slate-950 p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-white">
                {selectedSchedule ? 'Edit schedule' : 'Create schedule'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm">
                <span className="text-slate-300">Title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="text-slate-300">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="min-h-[84px] rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-300">Start</span>
                  <input
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(event) => setForm({ ...form, start_time: event.target.value })}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-300">End</span>
                  <input
                    type="datetime-local"
                    value={form.end_time}
                    onChange={(event) => setForm({ ...form, end_time: event.target.value })}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                    required
                  />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm">
                <span className="text-slate-300">Linked document</span>
                <select
                  value={form.reference_doc_id}
                  onChange={(event) => setForm({ ...form, reference_doc_id: event.target.value })}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-emerald-400"
                >
                  <option value="" className="bg-slate-950">
                    No document
                  </option>
                  {completedDocs.map((document) => (
                    <option key={document.id} value={document.id} className="bg-slate-950">
                      {document.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(event) =>
                      setForm({ ...form, is_recurring: event.target.checked })
                    }
                  />
                  Recurring
                </label>
                {form.is_recurring && (
                  <select
                    value={form.recurrence_rule}
                    onChange={(event) => setForm({ ...form, recurrence_rule: event.target.value })}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  >
                    <option value="" className="bg-slate-950">
                      Select recurrence
                    </option>
                    <option value="DAILY" className="bg-slate-950">
                      Daily
                    </option>
                    <option value="WEEKLY" className="bg-slate-950">
                      Weekly
                    </option>
                  </select>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
