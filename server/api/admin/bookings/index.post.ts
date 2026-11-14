import { z } from 'zod'
import { getBookingDetail } from '../../../admin/queries'
import { createBooking, createBookingInputSchema } from '../../../booking/service'
import { paymentMethod } from '../../../db/schema'

const bodySchema = createBookingInputSchema.extend({
  paymentMethod: z.enum(paymentMethod.enumValues),
  priceOverride: z.number().int().nonnegative().nullish(),
})

/** Admin-created booking: confirmed immediately (SPEC §4.4). */
export default defineEventHandler(async event => {
  const { paymentMethod, priceOverride, ...input } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const booking = await handleBooking(() =>
    createBooking(db, input, { source: 'admin', paymentMethod, priceOverride: priceOverride ?? undefined }),
  )
  setResponseStatus(event, 201)
  return getBookingDetail(db, booking.id)
})
