import { deleteScheduleException } from '../../../../booking/schedule'

export default defineEventHandler(async event => {
  await handleBooking(() => deleteScheduleException(useDb(), requireIdParam(event)))
  return { ok: true }
})
