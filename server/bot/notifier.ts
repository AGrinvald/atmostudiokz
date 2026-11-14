import { eq } from 'drizzle-orm'
import { InlineKeyboard, type Api } from 'grammy'
import type { Booking, Db } from '../db'
import { clients } from '../db/schema'
import { listDueReminders, markPhotosSent, markReminderSent } from '../booking/service'
import { getBookingSettings } from '../booking/settings'
import { T } from './texts'

/**
 * Telegram notifications (SPEC §5). Every method is best-effort: failures are logged,
 * never thrown, so a Telegram outage can't break booking. Without an API (no bot token)
 * everything is a no-op.
 */
export function createNotifier(api: Api | null, db: Db) {
  async function clientOf(booking: Booking) {
    const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId))
    return client!
  }

  async function adminChatId(): Promise<number | null> {
    return (await getBookingSettings(db)).telegram.adminChatId
  }

  async function safely(label: string, fn: (api: Api) => Promise<unknown>): Promise<boolean> {
    if (!api) return false
    try {
      await fn(api)
      return true
    } catch (e) {
      console.error(`[telegram] ${label} failed:`, e)
      return false
    }
  }

  async function toAdmin(label: string, text: (client: { name: string; phone: string }) => string, booking: Booking, keyboard?: InlineKeyboard) {
    return safely(label, async api => {
      const chatId = await adminChatId()
      if (!chatId) return
      const client = await clientOf(booking)
      await api.sendMessage(chatId, text(client), { parse_mode: 'HTML', reply_markup: keyboard })
    })
  }

  /** Messages the client only if they booked via (or linked) Telegram. */
  async function toClient(label: string, booking: Booking, text: string): Promise<boolean> {
    let sent = false
    await safely(label, async api => {
      const client = await clientOf(booking)
      if (!client.telegramChatId) return
      await api.sendMessage(client.telegramChatId, text, { link_preview_options: { is_disabled: true } })
      sent = true
    })
    return sent
  }

  return {
    // → admin chat
    bookingCreated: (b: Booking) => toAdmin('bookingCreated', c => T.adminNew(b, c), b),
    paymentClaimed: (b: Booking) =>
      toAdmin(
        'paymentClaimed',
        c => T.adminClaimed(b, c),
        b,
        new InlineKeyboard().text(T.adminConfirm, `a:ok:${b.id}`).text(T.adminReject, `a:no:${b.id}`),
      ),
    clientCancelled: (b: Booking) => toAdmin('clientCancelled', c => T.adminCancelled(b, c), b),

    // → client
    paymentConfirmed: (b: Booking) => toClient('paymentConfirmed', b, T.confirmedClient(b)),
    paymentRejected: (b: Booking) => toClient('paymentRejected', b, T.rejectedClient(b)),
    bookingExpired: (b: Booking) => toClient('bookingExpired', b, T.expiredClient(b)),
    bookingMoved: (b: Booking) => toClient('bookingMoved', b, T.movedClient(b)),
    cancelledByStudio: (b: Booking) => toClient('cancelledByStudio', b, T.cancelledByStudioClient(b)),
    refunded: (b: Booking) => toClient('refunded', b, T.refundedClient(b)),

    /** Sends the photos link to a Telegram client and marks it sent (SPEC §4.5). */
    async photosReady(b: Booking): Promise<boolean> {
      if (!b.photosLink) return false
      const sent = await toClient('photosReady', b, T.photosClient(b, b.photosLink))
      if (sent) await markPhotosSent(db, b.id, { actor: 'system' })
      return sent
    },

    /** Sends due 24h reminders; returns how many were sent. */
    async sendReminders(now = new Date()): Promise<number> {
      if (!api) return 0
      let count = 0
      for (const { booking, chatId } of await listDueReminders(db, now)) {
        const ok = await safely('reminder', api => api.sendMessage(chatId, T.reminderClient(booking)))
        if (ok) {
          await markReminderSent(db, booking.id, now)
          count++
        }
      }
      return count
    },
  }
}

export type Notifier = ReturnType<typeof createNotifier>
