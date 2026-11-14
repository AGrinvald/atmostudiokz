// Seeds the default weekly schedule (and, with --dev, a placeholder Kaspi link so
// bookings can be created locally). Safe to re-run: existing rows are kept.
//
//   npm run db:seed            # schedule only
//   npm run db:seed -- --dev   # + placeholder payment settings

import { createDb } from '../server/db'
import { scheduleWeekly } from '../server/db/schema'
import { getBookingSettings, setBookingSetting } from '../server/booking/settings'

// Placeholder working hours until the owner sets real ones in the admin panel.
const FIRST_SLOT_HOUR = 10
const LAST_SLOT_HOUR = 21

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const { db, close } = createDb(url)

try {
  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isOpen: true,
    firstSlotHour: FIRST_SLOT_HOUR,
    lastSlotHour: LAST_SLOT_HOUR,
  }))
  const inserted = await db.insert(scheduleWeekly).values(days).onConflictDoNothing().returning()
  console.log(`schedule_weekly: ${inserted.length} day(s) inserted`)

  if (process.argv.includes('--dev')) {
    const { payment } = await getBookingSettings(db)
    if (!payment.kaspiLink) {
      await setBookingSetting(db, 'payment', { kaspiLink: 'https://kaspi.kz/pay/placeholder', kaspiQrUrl: null })
      console.log('payment: placeholder Kaspi link set (dev only)')
    }
  }
} finally {
  await close()
}
