import { getClientDetail, updateClient } from '../../../admin/queries'

/** Edit a client's name and admin notes. */
export default defineEventHandler(async event => {
  const id = requireIdParam(event)
  const body = await readBody(event)
  const db = useDb()
  await handleBooking(() => updateClient(db, id, body))
  return getClientDetail(db, id)
})
