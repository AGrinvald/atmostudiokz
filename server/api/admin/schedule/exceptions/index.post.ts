import { addScheduleException } from '../../../../booking/schedule'

/** Close a whole day or block specific hours on a date. */
export default defineEventHandler(async event => {
  const body = await readBody(event)
  const row = await handleBooking(() => addScheduleException(useDb(), body))
  setResponseStatus(event, 201)
  return row
})
