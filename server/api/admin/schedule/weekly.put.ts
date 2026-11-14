import { setWeeklySchedule } from '../../../booking/schedule'

export default defineEventHandler(async event => {
  const body = await readBody(event)
  return handleBooking(() => setWeeklySchedule(useDb(), body))
})
