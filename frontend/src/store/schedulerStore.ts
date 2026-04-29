/**
 * Zustand store for scheduler state
 * TODO: Implement in Phase 4
 */

import { create } from 'zustand'

interface Schedule {
  id: number
  title: string
  startTime: string
  endTime: string
  referenceDocId?: number
}

interface SchedulerStore {
  schedules: Schedule[]
  setSchedules: (schedules: Schedule[]) => void
  addSchedule: (schedule: Schedule) => void
  updateSchedule: (id: number, schedule: Partial<Schedule>) => void
  deleteSchedule: (id: number) => void
}

export const useSchedulerStore = create<SchedulerStore>((set) => ({
  schedules: [],
  
  setSchedules: (schedules) => set({ schedules }),
  addSchedule: (schedule) =>
    set((state) => ({
      schedules: [...state.schedules, schedule],
    })),
  updateSchedule: (id, updates) =>
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  deleteSchedule: (id) =>
    set((state) => ({
      schedules: state.schedules.filter((s) => s.id !== id),
    })),
}))
