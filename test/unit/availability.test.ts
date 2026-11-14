import { describe, expect, it } from 'vitest'
import { computeAvailability, type AvailabilityInput, type WeeklyHours } from '../../server/booking/availability'
import { studioHourToUtc } from '../../server/booking/time'

// Saturday 2026-11-14, 11:00 studio time
const NOW = studioHourToUtc('2026-11-14', 11)

const openEveryDay: WeeklyHours[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isOpen: true,
  firstSlotHour: 10,
  lastSlotHour: 21,
}))

function run(overrides: Partial<AvailabilityInput>) {
  return computeAvailability({
    dates: ['2026-11-20'],
    weekly: openEveryDay,
    exceptions: [],
    occupied: [],
    now: NOW,
    rules: { minLeadHours: 2, horizonDays: 30 },
    ...overrides,
  })
}

const statusOf = (result: ReturnType<typeof run>, hour: number) =>
  result[0]!.slots.find(s => s.hour === hour)?.status

describe('computeAvailability', () => {
  it('lists every hourly slot inside working hours, last slot inclusive', () => {
    const [day] = run({})
    expect(day!.slots.map(s => s.hour)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    expect(day!.slots.every(s => s.status === 'free')).toBe(true)
  })

  it('a booking occupies its whole hour and nothing else', () => {
    const result = run({ occupied: [studioHourToUtc('2026-11-20', 14)] })
    expect(statusOf(result, 13)).toBe('free')
    expect(statusOf(result, 14)).toBe('booked')
    expect(statusOf(result, 15)).toBe('free')
  })

  it('returns no slots on a closed weekday', () => {
    const weekly = openEveryDay.map(w => (w.weekday === 4 ? { ...w, isOpen: false } : w)) // Friday
    expect(run({ weekly })[0]!.slots).toEqual([])
  })

  it('returns no slots on an all-day exception', () => {
    const result = run({ exceptions: [{ date: '2026-11-20', allDay: true, blockedHours: null }] })
    expect(result[0]!.slots).toEqual([])
  })

  it('marks blocked hours from an exception', () => {
    const result = run({ exceptions: [{ date: '2026-11-20', allDay: false, blockedHours: [10, 11] }] })
    expect(statusOf(result, 10)).toBe('blocked')
    expect(statusOf(result, 11)).toBe('blocked')
    expect(statusOf(result, 12)).toBe('free')
  })

  it('shows a booked slot as booked even if the hour is also blocked', () => {
    const result = run({
      occupied: [studioHourToUtc('2026-11-20', 10)],
      exceptions: [{ date: '2026-11-20', allDay: false, blockedHours: [10] }],
    })
    expect(statusOf(result, 10)).toBe('booked')
  })

  it('enforces the minimum lead time', () => {
    const result = run({ dates: ['2026-11-14'] })
    expect(statusOf(result, 10)).toBe('too_soon') // already past
    expect(statusOf(result, 12)).toBe('too_soon') // 1h ahead
    expect(statusOf(result, 13)).toBe('free') // exactly 2h ahead
  })

  it('enforces the booking horizon', () => {
    const result = run({ dates: ['2026-12-14', '2026-12-15'] })
    expect(result[0]!.slots[0]!.status).toBe('free') // today + 30 days
    expect(result[1]!.slots[0]!.status).toBe('past_horizon')
  })
})
