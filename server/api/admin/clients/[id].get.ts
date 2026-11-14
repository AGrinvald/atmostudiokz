import { getClientDetail } from '../../../admin/queries'

export default defineEventHandler(event =>
  handleBooking(() => getClientDetail(useDb(), requireIdParam(event))),
)
