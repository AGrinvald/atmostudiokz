import { sql } from 'drizzle-orm'
import { createDb } from '../../server/db'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://atmo:atmo@localhost:5432/atmo_test'

export function createTestDb() {
  const { db, close } = createDb(TEST_DATABASE_URL)
  const reset = async () => {
    await db.execute(sql`
      truncate booking_events, bookings, clients, schedule_weekly, schedule_exceptions, settings, bot_sessions
      restart identity cascade
    `)
    await db.execute(sql`alter sequence booking_number_seq restart with 1001`)
  }
  return { db, close, reset }
}
