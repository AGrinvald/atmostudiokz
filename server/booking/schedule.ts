import { asc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '../db'
import { scheduleExceptions, scheduleWeekly } from '../db/schema'
import type { WeeklyHours } from './availability'
import { BookingError } from './errors'
import { isIsoDate } from './time'

const hour = z.number().int().min(0).max(23)

export const weeklyScheduleSchema = z
  .array(
    z
      .object({ weekday: z.number().int().min(0).max(6), isOpen: z.boolean(), firstSlotHour: hour, lastSlotHour: hour })
      .refine(d => d.firstSlotHour <= d.lastSlotHour, { message: 'firstSlotHour must be <= lastSlotHour' }),
  )
  .length(7)
  .refine(days => new Set(days.map(d => d.weekday)).size === 7, { message: 'Each weekday exactly once' })

export const scheduleExceptionInputSchema = z
  .object({
    date: z.string().refine(isIsoDate, 'Invalid date'),
    allDay: z.boolean(),
    blockedHours: z.array(hour).max(24).nullish(),
    note: z.string().trim().max(500).nullish(),
  })
  .refine(e => e.allDay || (e.blockedHours?.length ?? 0) > 0, { message: 'Pick blocked hours or the whole day' })

/** All 7 weekdays (0 = Monday); days never configured come back closed. */
export async function getWeeklySchedule(db: DbOrTx): Promise<WeeklyHours[]> {
  const rows = await db.select().from(scheduleWeekly)
  const byDay = new Map(rows.map(r => [r.weekday, r]))
  return Array.from({ length: 7 }, (_, weekday) => {
    const row = byDay.get(weekday)
    return row
      ? { weekday, isOpen: row.isOpen, firstSlotHour: row.firstSlotHour, lastSlotHour: row.lastSlotHour }
      : { weekday, isOpen: false, firstSlotHour: 10, lastSlotHour: 21 }
  })
}

export async function setWeeklySchedule(db: Db, input: unknown): Promise<WeeklyHours[]> {
  const parsed = weeklyScheduleSchema.safeParse(input)
  if (!parsed.success) throw new BookingError('invalid_input', z.prettifyError(parsed.error))
  await db.transaction(async tx => {
    for (const day of parsed.data) {
      await tx
        .insert(scheduleWeekly)
        .values(day)
        .onConflictDoUpdate({ target: scheduleWeekly.weekday, set: day })
    }
  })
  return getWeeklySchedule(db)
}

export function listScheduleExceptions(db: DbOrTx, fromDate: string) {
  return db
    .select()
    .from(scheduleExceptions)
    .where(gte(scheduleExceptions.date, fromDate))
    .orderBy(asc(scheduleExceptions.date))
}

export async function addScheduleException(db: Db, input: unknown) {
  const parsed = scheduleExceptionInputSchema.safeParse(input)
  if (!parsed.success) throw new BookingError('invalid_input', z.prettifyError(parsed.error))
  const { date, allDay, blockedHours, note } = parsed.data
  const [row] = await db
    .insert(scheduleExceptions)
    .values({
      date,
      allDay,
      blockedHours: allDay ? null : [...new Set(blockedHours)].sort((a, b) => a - b),
      note: note || null,
    })
    .returning()
  return row!
}

export async function deleteScheduleException(db: Db, id: number): Promise<void> {
  const deleted = await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, id)).returning()
  if (deleted.length === 0) throw new BookingError('not_found')
}
