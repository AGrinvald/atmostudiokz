import { z } from 'zod'
import { getBookingDetail } from '../../../../admin/queries'
import type { Notifier } from '../../../../bot/notifier'
import {
  cancelByAdmin,
  confirmPayment,
  markPhotosSent,
  markRefunded,
  moveBooking,
  rejectPayment,
  setPhotosLink,
} from '../../../../booking/service'
import type { Booking, Db } from '../../../../db'

interface ActionSpec {
  run: (db: Db, id: number, body: unknown) => Promise<Booking>
  /** Telegram message to the client (bot clients only), if any. */
  notify?: (notifier: Notifier, booking: Booking) => Promise<unknown>
}

const ACTIONS: Record<string, ActionSpec> = {
  'confirm': { run: (db, id) => confirmPayment(db, id), notify: (n, b) => n.paymentConfirmed(b) },
  'reject': { run: (db, id) => rejectPayment(db, id), notify: (n, b) => n.paymentRejected(b) },
  'cancel': {
    run: (db, id, body) => cancelByAdmin(db, id, z.object({ refund: z.boolean() }).parse(body)),
    notify: (n, b) => n.cancelledByStudio(b),
  },
  'refunded': { run: (db, id) => markRefunded(db, id), notify: (n, b) => n.refunded(b) },
  'move': {
    run: (db, id, body) => moveBooking(db, id, z.object({ date: z.string(), hour: z.number().int() }).parse(body)),
    notify: (n, b) => n.bookingMoved(b),
  },
  // Bot clients get the link automatically (and it's marked sent); site clients get it from the admin manually.
  'photos': {
    run: (db, id, body) => setPhotosLink(db, id, z.object({ link: z.string() }).parse(body).link),
    notify: (n, b) => n.photosReady(b),
  },
  'photos-sent': { run: (db, id) => markPhotosSent(db, id) },
}

/** Admin actions on a booking (SPEC §8). Returns the updated booking detail. */
export default defineEventHandler(async event => {
  const id = requireIdParam(event)
  const action = getRouterParam(event, 'action') ?? ''
  const spec = Object.hasOwn(ACTIONS, action) ? ACTIONS[action]! : null
  if (!spec) throw createError({ statusCode: 404 })

  const body = ['cancel', 'move', 'photos'].includes(action) ? await readBody(event) : undefined
  const db = useDb()
  let booking: Booking
  try {
    booking = await handleBooking(() => spec.run(db, id, body))
  } catch (e) {
    if (e instanceof z.ZodError) throw createError({ statusCode: 400, data: { code: 'invalid_input' } })
    throw e
  }
  await spec.notify?.(useNotifier(), booking)
  return getBookingDetail(db, id)
})
