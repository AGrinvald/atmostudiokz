import { getBookingDetail } from '../../../../admin/queries'

export default defineEventHandler(event =>
  handleBooking(() => getBookingDetail(useDb(), requireIdParam(event))),
)
