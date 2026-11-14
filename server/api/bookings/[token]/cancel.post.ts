import { toPublicBooking } from '../../../booking/present'
import { cancelByClient } from '../../../booking/service'
import { getBookingSettings } from '../../../booking/settings'

/** Client self-cancel, ≥ 72h before the session (SPEC §4.3). */
export default defineEventHandler(async event => {
  const db = useDb()
  const booking = await handleBooking(() => cancelByClient(db, requireToken(event)))
  return toPublicBooking(booking, await getBookingSettings(db))
})
