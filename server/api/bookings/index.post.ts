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
  const body = await readValidatedBody(event, siteBookingSchema.parse)
  const db = useDb()
  const booking = await handleBooking(() => createBooking(db, body, { source: 'site' }))
  setResponseStatus(event, 201)
  return toPublicBooking(booking, await getBookingSettings(db))
})
