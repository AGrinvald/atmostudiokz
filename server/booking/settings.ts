import { inArray } from 'drizzle-orm'
import {
  bookingSettingsSchema,
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
  type BookingSettingsKey,
} from '../../shared/booking/settings'
import type { DbOrTx } from '../db'
import { settings } from '../db/schema'

const KEYS = Object.keys(DEFAULT_BOOKING_SETTINGS) as BookingSettingsKey[]

/** Admin-editable booking settings, falling back to defaults for keys not stored yet. */
export async function getBookingSettings(db: DbOrTx): Promise<BookingSettings> {
  const rows = await db.select().from(settings).where(inArray(settings.key, KEYS))
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return bookingSettingsSchema.parse({ ...DEFAULT_BOOKING_SETTINGS, ...stored })
}

export async function setBookingSetting<K extends BookingSettingsKey>(
  db: DbOrTx,
  key: K,
  value: BookingSettings[K],
): Promise<void> {
  const parsed = bookingSettingsSchema.shape[key].parse(value)
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } })
}
