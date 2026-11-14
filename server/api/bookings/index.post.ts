import { z } from 'zod'
import { toPublicBooking } from '../../booking/present'
import { createBooking, createBookingInputSchema } from '../../booking/service'
import { getBookingSettings } from '../../booking/settings'

const siteBookingSchema = createBookingInputSchema.extend({
  consentRules: z.literal(true),
  consentPrivacy: z.literal(true),
  // Honeypot: hidden field that humans leave empty (SPEC §11)
  website: z.string().max(0).optional(),
})

export default defineEventHandler(async event => {
  rateLimit(event, { key: 'create-booking', limit: 10, windowMs: 10 * 60_000 })
  const body = await readValidatedBody(event, siteBookingSchema.parse)
  const db = useDb()
  const booking = await handleBooking(() => createBooking(db, body, { source: 'site' }))
  await useNotifier().bookingCreated(booking)
  setResponseStatus(event, 201)
  return toPublicBooking(booking, await getBookingSettings(db))
})
