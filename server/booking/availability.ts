import type { RulesSettings } from '../../shared/booking/settings'
import { addDays, hoursBetween, studioHourToUtc, toStudioParts, weekdayOf } from './time'

export interface WeeklyHours {
  weekday: number
  isOpen: boolean
  firstSlotHour: number
  /** Start hour of the last slot of the day (inclusive). */
  lastSlotHour: number
}

export interface ScheduleException {
  date: string
  allDay: boolean
  blockedHours: number[] | null
}

/**
 * - `free`: can be booked by a client
 * - `booked`: an active booking holds it
 * - `blocked`: blocked by an admin exception
 * - `too_soon`: starts within `minLeadHours` (or already started)
 * - `past_horizon`: beyond `horizonDays`
 */
export type SlotStatus = 'free' | 'booked' | 'blocked' | 'too_soon' | 'past_horizon'

export interface Slot {
  hour: number
  start: Date
  status: SlotStatus
}

export interface DayAvailability {
  date: string
  slots: Slot[]
}

export interface AvailabilityInput {
  dates: string[]
  weekly: WeeklyHours[]
  exceptions: ScheduleException[]
  /** Start instants of active bookings. */
  occupied: Date[]
  now: Date
  rules: Pick<RulesSettings, 'minLeadHours' | 'horizonDays'>
  tz?: string
}

/**
 * Lists the hourly slots inside working hours for each date, with their status (SPEC §3.1–3.2).
 * Closed weekdays and all-day exceptions yield an empty slot list.
 */
export function computeAvailability(input: AvailabilityInput): DayAvailability[] {
  const { now, rules, tz } = input
  const weekly = new Map(input.weekly.map(w => [w.weekday, w]))
  const occupied = new Set(input.occupied.map(d => d.getTime()))
  const today = toStudioParts(now, tz).date
  const lastBookableDate = addDays(today, rules.horizonDays)

  return input.dates.map(date => {
    const hours = weekly.get(weekdayOf(date))
    const dayExceptions = input.exceptions.filter(e => e.date === date)
    if (!hours?.isOpen || dayExceptions.some(e => e.allDay)) return { date, slots: [] }

    const blocked = new Set(dayExceptions.flatMap(e => e.blockedHours ?? []))
    const slots: Slot[] = []
    for (let hour = hours.firstSlotHour; hour <= hours.lastSlotHour; hour++) {
      const start = studioHourToUtc(date, hour, tz)
      let status: SlotStatus = 'free'
      if (occupied.has(start.getTime())) status = 'booked'
      else if (blocked.has(hour)) status = 'blocked'
      else if (hoursBetween(now, start) < rules.minLeadHours) status = 'too_soon'
      else if (date > lastBookableDate) status = 'past_horizon'
      slots.push({ hour, start, status })
    }
    return { date, slots }
  })
}
