import { toPublicBooking } from '../../../booking/present'
import { claimPayment, findBookingByToken } from '../../../booking/service'
import { getBookingSettings } from '../../../booking/settings'

/** Client pressed «Я оплатил» (SPEC §4.2). */
export default defineEventHandler(async event => {
  const db = useDb()
  const token = requireToken(event)
  const before = await findBookingByToken(db, token)
  const booking = await handleBooking(() => claimPayment(db, token))
  // claimPayment is idempotent; alert the admin only on the first press.
  if (before?.status === 'awaiting_payment') await useNotifier().paymentClaimed(booking)
  return toPublicBooking(booking, await getBookingSettings(db))
})
