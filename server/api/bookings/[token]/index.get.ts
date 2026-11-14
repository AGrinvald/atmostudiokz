import { toPublicBooking } from '../../../booking/present'
import { findBookingByToken } from '../../../booking/service'
import { getBookingSettings } from '../../../booking/settings'

export default defineEventHandler(async event => {
  const db = useDb()
  const booking = await findBookingByToken(db, requireToken(event))
  if (!booking) throw createError({ statusCode: 404, data: { code: 'not_found' } })
  return toPublicBooking(booking, await getBookingSettings(db))
})
