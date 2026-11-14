import { toPublicBooking } from '../../../booking/present'
import { claimPayment } from '../../../booking/service'
import { getBookingSettings } from '../../../booking/settings'

/** Client pressed «Я оплатил» (SPEC §4.2). */
export default defineEventHandler(async event => {
  const db = useDb()
  const booking = await handleBooking(() => claimPayment(db, requireToken(event)))
  return toPublicBooking(booking, await getBookingSettings(db))
})
