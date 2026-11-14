import { z } from 'zod'
import { getBookingDetail } from '../../../../admin/queries'
import {
  cancelByAdmin,
  confirmPayment,
  markPhotosSent,
  markRefunded,
  moveBooking,
  rejectPayment,
  setPhotosLink,
} from '../../../../booking/service'
import type { Db } from '../../../../db'

const ACTIONS = {
  'confirm': (db: Db, id: number) => confirmPayment(db, id),
  'reject': (db: Db, id: number) => rejectPayment(db, id),
  'cancel': (db: Db, id: number, body: unknown) =>
    cancelByAdmin(db, id, z.object({ refund: z.boolean() }).parse(body)),
  'refunded': (db: Db, id: number) => markRefunded(db, id),
  'move': (db: Db, id: number, body: unknown) =>
    moveBooking(db, id, z.object({ date: z.string(), hour: z.number().int() }).parse(body)),
  'photos': (db: Db, id: number, body: unknown) =>
    setPhotosLink(db, id, z.object({ link: z.string() }).parse(body).link),
  'photos-sent': (db: Db, id: number) => markPhotosSent(db, id),
} as const

type Action = keyof typeof ACTIONS

/** Admin actions on a booking (SPEC §8). Returns the updated booking detail. */
export default defineEventHandler(async event => {
  const id = requireIdParam(event)
  const action = getRouterParam(event, 'action') as Action
  if (!Object.hasOwn(ACTIONS, action)) throw createError({ statusCode: 404 })

  const body = ['cancel', 'move', 'photos'].includes(action) ? await readBody(event) : undefined
  const db = useDb()
  try {
    await handleBooking(() => ACTIONS[action](db, id, body))
  } catch (e) {
    if (e instanceof z.ZodError) throw createError({ statusCode: 400, data: { code: 'invalid_input' } })
    throw e
  }
  // TODO: notify bot clients (status change, photos link) once the Telegram bot exists.
  return getBookingDetail(db, id)
})
