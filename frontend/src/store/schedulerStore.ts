import { create } from 'zustand'

export interface Schedule {
  id: number
  user_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  is_recurring: boolean
  recurrence_rule: string | null
  reference_doc_id: number | null
  created_at: string
  flashcard_due_count: number
}

interface SchedulerStore {
  schedules: Schedule[]
  setSchedules: (schedules: Schedule[]) => void
  addSchedule: (schedule: Schedule) => void
  updateSchedule: (id: number, schedule: Schedule) => void
  deleteSchedule: (id: number) => void
}

export const useSchedulerStore = create<SchedulerStore>((set) => ({
  schedules: [],
  setSchedules: (schedules) => set({ schedules }),
  addSchedule: (schedule) =>
    set((state) => ({ schedules: [...state.schedules, schedule] })),
  updateSchedule: (id, schedule) =>
    set((state) => ({
      schedules: state.schedules.map((item) => (item.id === id ? schedule : item)),
    })),
  deleteSchedule: (id) =>
    set((state) => ({
      schedules: state.schedules.filter((item) => item.id !== id),
    })),
}))
