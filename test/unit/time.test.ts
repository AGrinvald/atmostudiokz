import { describe, expect, it } from 'vitest'
import { addDays, isIsoDate, studioHourToUtc, toStudioParts, weekdayOf } from '../../server/booking/time'

describe('studio time (Asia/Almaty, UTC+5)', () => {
  it('converts a studio hour to UTC', () => {
    expect(studioHourToUtc('2026-12-01', 14).toISOString()).toBe('2026-12-01T09:00:00.000Z')
    expect(studioHourToUtc('2026-12-01', 0).toISOString()).toBe('2026-11-30T19:00:00.000Z')
  })

  it('reads studio date and hour from a UTC instant', () => {
    expect(toStudioParts(new Date('2026-11-30T19:30:00Z'))).toEqual({ date: '2026-12-01', hour: 0, minute: 30 })
  })

  it('round-trips', () => {
    const start = studioHourToUtc('2026-11-20', 21)
    expect(toStudioParts(start)).toMatchObject({ date: '2026-11-20', hour: 21 })
  })

  it('numbers weekdays from Monday = 0', () => {
    expect(weekdayOf('2026-11-16')).toBe(0) // Monday
    expect(weekdayOf('2026-11-22')).toBe(6) // Sunday
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
  })
})
