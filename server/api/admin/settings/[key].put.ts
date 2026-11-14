import { z } from 'zod'
import { DEFAULT_BOOKING_SETTINGS, type BookingSettingsKey } from '#shared/booking/settings'
import { getBookingSettings, setBookingSetting } from '../../../booking/settings'

export default defineEventHandler(async event => {
  const key = getRouterParam(event, 'key') as BookingSettingsKey
  if (!Object.hasOwn(DEFAULT_BOOKING_SETTINGS, key)) throw createError({ statusCode: 404 })
  const db = useDb()
  try {
    await setBookingSetting(db, key, await readBody(event))
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw createError({ statusCode: 422, statusMessage: z.prettifyError(e), data: { code: 'invalid_input' } })
    }
    throw e
  }
  return getBookingSettings(db)
})
