declare module 'react-big-calendar' {
  import type { ComponentType, CSSProperties } from 'react'

  export interface SlotInfo {
    start: Date
    end: Date
    slots: Date[]
    action: 'select' | 'click' | 'doubleClick'
  }

  export interface CalendarProps<TEvent extends object = object> {
    localizer: unknown
    events: TEvent[]
    startAccessor: keyof TEvent | string
    endAccessor: keyof TEvent | string
    titleAccessor?: keyof TEvent | string
    defaultView?: string
    views?: string[]
    selectable?: boolean
    popup?: boolean
    step?: number
    timeslots?: number
    style?: CSSProperties
    onSelectSlot?: (slotInfo: SlotInfo) => void
    onSelectEvent?: (event: TEvent) => void
    eventPropGetter?: (event: TEvent) => { className?: string; style?: CSSProperties }
  }

  export const Calendar: ComponentType<CalendarProps<any>>
  export function dateFnsLocalizer(config: {
    format: (...args: any[]) => string
    parse: (...args: any[]) => Date
    startOfWeek: (...args: any[]) => Date
    getDay: (date: Date) => number
    locales: Record<string, unknown>
  }): unknown

  export const Views: {
    MONTH: string
    WEEK: string
    DAY: string
    AGENDA: string
  }
}
