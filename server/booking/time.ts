// Studio-time helpers. All timestamps are stored in UTC; the schedule is defined in
// studio-local dates (YYYY-MM-DD) and hours (SPEC §1 "Locale & time").

export const STUDIO_TZ = 'Asia/Almaty'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HOUR_MS = 3_600_000

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterFor(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

function zonedParts(date: Date, tz: string) {
  const parts = Object.fromEntries(
    formatterFor(tz).formatToParts(date).map(p => [p.type, p.value]),
  ) as Record<string, string>
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The UTC instant at which `hour:00` starts on `isoDate` in studio time. */
export function studioHourToUtc(isoDate: string, hour: number, tz: string = STUDIO_TZ): Date {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const guess = Date.UTC(y, m - 1, d, hour)
  const first = guess - offsetMs(new Date(guess), tz)
  // Re-check once in case the guess straddled an offset change.
  return new Date(guess - offsetMs(new Date(first), tz))
}

export interface StudioParts {
  date: string
  hour: number
  minute: number
}

export function toStudioParts(date: Date, tz: string = STUDIO_TZ): StudioParts {
  const p = zonedParts(date, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour, minute: p.minute }
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Monday … 6 = Sunday (matches `schedule_weekly.weekday`). */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / HOUR_MS
}
