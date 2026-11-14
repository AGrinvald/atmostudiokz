import type { Update, UserFromGetMe } from 'grammy/types'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createBot } from '../../server/bot/bot'
import { MENU } from '../../server/bot/texts'
import { claimPayment, confirmPayment, createBooking, findBookingById, setPhotosLink } from '../../server/booking/service'
import { getBookingSettings, setBookingSetting } from '../../server/booking/settings'
import { addDays, studioHourToUtc, toStudioParts } from '../../server/booking/time'
import { bookings, clients, scheduleWeekly } from '../../server/db/schema'
import { createTestDb } from './db'

const { db, close, reset } = createTestDb()

const CLIENT = 1001 // Telegram user id == private chat id
const STRANGER = 2002
const ADMIN_CHAT = -5005
const LINK_SECRET = 'link-secret-123'
const DATE = addDays(toStudioParts(new Date()).date, 5)

const BOT_INFO = { id: 1, is_bot: true, first_name: 'ATMO', username: 'atmo_test_bot' } as UserFromGetMe

type Call = { method: string; payload: any }

function harness() {
  const calls: Call[] = []
  const { bot, notifier } = createBot({ token: 'test-token', db, siteUrl: 'https://atmo.kz', adminLinkSecret: LINK_SECRET, botInfo: BOT_INFO })
  let id = 0
  bot.api.config.use(async (_prev, method, payload: any) => {
    calls.push({ method, payload })
    const result = method.startsWith('send')
      ? { message_id: ++id, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text }
      : true
    return { ok: true, result } as any
  })

  const user = (userId: number) => ({ id: userId, is_bot: false, first_name: 'Анна' })
  const chat = (chatId: number) => (chatId < 0 ? { id: chatId, type: 'group', title: 'Admins' } : { id: chatId, type: 'private', first_name: 'Анна' })
  const handle = (u: Omit<Update, 'update_id'>) => bot.handleUpdate({ update_id: ++id, ...u } as Update)

  return {
    calls,
    notifier,
    text: (text: string, chatId = CLIENT, fromId = chatId > 0 ? chatId : CLIENT) =>
      handle({
        message: {
          message_id: ++id,
          date: 0,
          chat: chat(chatId),
          from: user(fromId),
          text,
          ...(text.startsWith('/') && { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] }),
        } as any,
      }),
    contact: (phone: string, ownerId = CLIENT) =>
      handle({
        message: {
          message_id: ++id,
          date: 0,
          chat: chat(CLIENT),
          from: user(CLIENT),
          contact: { phone_number: phone, first_name: 'Анна', last_name: 'К', user_id: ownerId },
        } as any,
      }),
    press: (data: string, chatId = CLIENT, fromId = chatId > 0 ? chatId : CLIENT) =>
      handle({
        callback_query: {
          id: String(++id),
          from: user(fromId),
          chat_instance: 'x',
          data,
          message: { message_id: 1, date: 0, chat: chat(chatId), text: 'Предыдущее сообщение' },
        } as any,
      }),
    /** Last call (optionally of a method / to a chat). */
    last(method?: string, chatId?: number) {
      const found = calls.filter(c => (!method || c.method === method) && (chatId == null || c.payload.chat_id === chatId))
      return found.at(-1)
    },
    sentTo: (chatId: number) => calls.filter(c => c.method === 'sendMessage' && c.payload.chat_id === chatId),
  }
}

const buttons = (call?: Call) => (call?.payload.reply_markup?.inline_keyboard ?? []).flat() as { text: string; callback_data?: string; url?: string }[]
const callbackData = (call?: Call) => buttons(call).map(b => b.callback_data).filter(Boolean)

beforeEach(async () => {
  await reset()
  await db.insert(scheduleWeekly).values(
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: true, firstSlotHour: 10, lastSlotHour: 21 })),
  )
  await setBookingSetting(db, 'payment', { kaspiLink: 'https://kaspi.kz/pay/test', kaspiQrUrl: null })
})

afterAll(() => close())

async function linkAdminChat(h: ReturnType<typeof harness>) {
  await h.text(`/start ${LINK_SECRET}`, ADMIN_CHAT, 1)
}

/** Walks the inline steps up to and including the people count. */
async function pickSlot(h: ReturnType<typeof harness>, hour = 14) {
  await h.text(MENU.book)
  await h.press(`d:${DATE}`)
  await h.press(`h:${DATE}:${hour}`)
  await h.press(`s:${DATE}:${hour}:55`)
  await h.press(`l:${DATE}:${hour}:55:dark`)
  await h.press(`g:${DATE}:${hour}:55:dark:white`)
  await h.press(`p:${DATE}:${hour}:55:dark:white:3`)
}

describe('telegram bot', () => {
  it('greets on /start with the main menu', async () => {
    const h = harness()
    await h.text('/start')
    const msg = h.last('sendMessage')!
    expect(msg.payload.text).toContain('студия автопортрета')
    expect(msg.payload.reply_markup.keyboard.flat().map((b: any) => b.text)).toEqual([MENU.book, MENU.my, MENU.about])
  })

  it('links the admin chat with /start <secret>, and ignores a wrong secret', async () => {
    const h = harness()
    await h.text('/start wrong', ADMIN_CHAT, 1)
    expect((await getBookingSettings(db)).telegram.adminChatId).toBeNull()
    await linkAdminChat(h)
    expect((await getBookingSettings(db)).telegram.adminChatId).toBe(ADMIN_CHAT)
    expect(h.last('sendMessage', ADMIN_CHAT)!.payload.text).toContain('подключён')
  })

  it('books a session end to end: steps, contact, name, confirm, pay, admin confirms', async () => {
    const h = harness()
    await linkAdminChat(h)

    await h.text(MENU.book)
    expect(callbackData(h.last('sendMessage'))).toContain(`d:${DATE}`)

    await h.press(`d:${DATE}`)
    expect(callbackData(h.last('editMessageText'))).toContain(`h:${DATE}:14`)
    await h.press(`h:${DATE}:14`)
    expect(buttons(h.last('editMessageText')).map(b => b.text)).toEqual(['30 минут · 12 000 ₸', '55 минут · 20 000 ₸', '← Назад'])
    await h.press(`s:${DATE}:14:55`)
    await h.press(`l:${DATE}:14:55:dark`)
    const backgrounds = buttons(h.last('editMessageText'))
    expect(backgrounds.find(b => b.text === 'Белый')?.callback_data).toBe(`g:${DATE}:14:55:dark:white`)
    expect(backgrounds.find(b => b.text.startsWith('Чёрный'))?.callback_data).toBe('soon')
    await h.press(`g:${DATE}:14:55:dark:white`)
    expect(callbackData(h.last('editMessageText'))).toContain(`p:${DATE}:14:55:dark:white:8`)
    await h.press(`p:${DATE}:14:55:dark:white:7`)

    // New client: asked to share their contact
    expect(h.last('sendMessage')!.payload.reply_markup.keyboard[0][0]).toMatchObject({ request_contact: true })
    await h.contact('77016667788')
    expect(h.last('sendMessage')!.payload.reply_markup.keyboard[0][0].text).toBe('Анна К')
    await h.text('Анна')

    const summary = h.last('sendMessage')!
    expect(summary.payload.text).toContain('22 000 ₸')
    expect(summary.payload.text).toContain('+7 701 666 77 88')
    expect(summary.payload.text).toContain('https://atmo.kz/rules')
    await h.press('ok')

    const [booking] = await db.select().from(bookings)
    expect(booking).toMatchObject({ number: 'A-1001', source: 'bot', status: 'awaiting_payment', peopleCount: 7, priceTotal: 22000 })
    const [client] = await db.select().from(clients)
    expect(client).toMatchObject({ phone: '+77016667788', name: 'Анна', telegramUserId: CLIENT, telegramChatId: CLIENT })

    const payment = h.last('editMessageText')!
    expect(payment.payload.text).toContain('A-1001')
    expect(buttons(payment)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://kaspi.kz/pay/test' }),
        expect.objectContaining({ callback_data: `pay:${booking!.id}` }),
      ]),
    )
    expect(h.sentTo(ADMIN_CHAT).at(-1)!.payload.text).toContain('Новая бронь <b>A-1001</b> (Telegram)')

    await h.press(`pay:${booking!.id}`)
    expect((await findBookingById(db, booking!.id))!.status).toBe('payment_claimed')
    const alert = h.sentTo(ADMIN_CHAT).at(-1)!
    expect(alert.payload.text).toContain('«Я оплатил»')
    expect(callbackData(alert)).toEqual([`a:ok:${booking!.id}`, `a:no:${booking!.id}`])

    await h.press(`a:ok:${booking!.id}`, ADMIN_CHAT, 1)
    expect((await findBookingById(db, booking!.id))!.status).toBe('confirmed')
    expect(h.last('editMessageText', ADMIN_CHAT)!.payload.text).toContain('Оплата подтверждена')
    expect(h.sentTo(CLIENT).at(-1)!.payload.text).toContain('A-1001 подтверждена')
  })

  it('skips contact and name for a returning client', async () => {
    const h = harness()
    await createBooking(db, { date: DATE, hour: 10, sessionType: '30', lighting: 'dark', background: 'white', peopleCount: 1, name: 'Анна', phone: '+77016667788' }, { source: 'bot', telegram: { userId: CLIENT, chatId: CLIENT } })
    await pickSlot(h)
    const summary = h.last('editMessageText')!
    expect(summary.payload.text).toContain('Проверьте запись')
    expect(callbackData(summary)).toContain('ok')
  })

  it("rejects someone else's shared contact", async () => {
    const h = harness()
    await pickSlot(h)
    await h.contact('77001112233', STRANGER)
    expect(h.last('sendMessage')!.payload.text).toContain('своим номером')
    expect(await db.select().from(clients)).toHaveLength(0)
  })

  it('tells the client when the hour was taken between steps', async () => {
    const h = harness()
    await h.text(MENU.book)
    await h.press(`d:${DATE}`)
    await createBooking(db, { date: DATE, hour: 14, sessionType: '30', lighting: 'dark', background: 'white', peopleCount: 1, name: 'Б', phone: '+77001112233' }, { source: 'site' })
    await h.press(`h:${DATE}:14`)
    expect(h.last('answerCallbackQuery')!.payload).toMatchObject({ show_alert: true, text: expect.stringContaining('заняли') })
  })

  it('says online booking is unavailable without a Kaspi link', async () => {
    const h = harness()
    await setBookingSetting(db, 'payment', { kaspiLink: null, kaspiQrUrl: null })
    await h.text(MENU.book)
    expect(h.last('sendMessage')!.payload.text).toContain('Онлайн-оплата временно недоступна')
  })

  it('lists my bookings and cancels one; the admin is told to refund', async () => {
    const h = harness()
    await linkAdminChat(h)
    const booking = await createBooking(db, { date: DATE, hour: 14, sessionType: '55', lighting: 'dark', background: 'white', peopleCount: 2, name: 'Анна', phone: '+77016667788' }, { source: 'bot', telegram: { userId: CLIENT, chatId: CLIENT } })
    await confirmPayment(db, booking.id)

    await h.text(MENU.my)
    const item = h.last('sendMessage')!
    expect(item.payload.text).toContain('A-1001')
    expect(callbackData(item)).toEqual([`cx:${booking.id}`])

    await h.press(`cx:${booking.id}`)
    await h.press(`cxy:${booking.id}`)
    expect((await findBookingById(db, booking.id))!.status).toBe('cancelled_refund_pending')
    expect(h.last('editMessageText')!.payload.text).toContain('Деньги вернём')
    expect(h.sentTo(ADMIN_CHAT).at(-1)!.payload.text).toContain('Нужно вернуть')
  })

  it("doesn't let other users act on someone's booking", async () => {
    const h = harness()
    const booking = await createBooking(db, { date: DATE, hour: 14, sessionType: '55', lighting: 'dark', background: 'white', peopleCount: 2, name: 'Анна', phone: '+77016667788' }, { source: 'bot', telegram: { userId: CLIENT, chatId: CLIENT } })
    await h.press(`pay:${booking.id}`, STRANGER)
    await h.press(`cxy:${booking.id}`, STRANGER)
    expect((await findBookingById(db, booking.id))!.status).toBe('awaiting_payment')
  })

  it('accepts payment decisions only from the linked admin chat', async () => {
    const h = harness()
    await linkAdminChat(h)
    const booking = await createBooking(db, { date: DATE, hour: 14, sessionType: '55', lighting: 'dark', background: 'white', peopleCount: 2, name: 'Анна', phone: '+77016667788' }, { source: 'site' })
    await claimPayment(db, booking.publicToken)
    await h.press(`a:ok:${booking.id}`, CLIENT)
    expect((await findBookingById(db, booking.id))!.status).toBe('payment_claimed')
    await h.press(`a:no:${booking.id}`, ADMIN_CHAT, 1)
    expect((await findBookingById(db, booking.id))!.status).toBe('rejected')
  })
})

describe('telegram notifier', () => {
  const botBooking = () =>
    createBooking(db, { date: DATE, hour: 14, sessionType: '55', lighting: 'dark', background: 'white', peopleCount: 2, name: 'Анна', phone: '+77016667788' }, { source: 'bot', telegram: { userId: CLIENT, chatId: CLIENT } })

  it('sends the photos link to a Telegram client and marks it sent', async () => {
    const h = harness()
    const booking = await botBooking()
    await confirmPayment(db, booking.id)
    const withLink = await setPhotosLink(db, booking.id, 'https://disk.yandex.kz/d/x')
    expect(await h.notifier.photosReady(withLink)).toBe(true)
    expect(h.sentTo(CLIENT).at(-1)!.payload.text).toContain('https://disk.yandex.kz/d/x')
    expect((await findBookingById(db, booking.id))!.photosSentAt).not.toBeNull()
  })

  it('does not message site clients (the admin sends their link manually)', async () => {
    const h = harness()
    const booking = await createBooking(db, { date: DATE, hour: 14, sessionType: '55', lighting: 'dark', background: 'white', peopleCount: 2, name: 'Анна', phone: '+77016667788' }, { source: 'site' })
    await confirmPayment(db, booking.id)
    const withLink = await setPhotosLink(db, booking.id, 'https://disk.yandex.kz/d/x')
    expect(await h.notifier.photosReady(withLink)).toBe(false)
    expect(h.calls).toHaveLength(0)
    expect((await findBookingById(db, booking.id))!.photosSentAt).toBeNull()
  })

  it('sends a reminder once, within 24h of a confirmed session', async () => {
    const h = harness()
    const booking = await botBooking()
    await confirmPayment(db, booking.id)
    const start = studioHourToUtc(DATE, 14)

    expect(await h.notifier.sendReminders(new Date(start.getTime() - 30 * 3_600_000))).toBe(0) // too early
    expect(await h.notifier.sendReminders(new Date(start.getTime() - 20 * 3_600_000))).toBe(1)
    expect(await h.notifier.sendReminders(new Date(start.getTime() - 10 * 3_600_000))).toBe(0) // already sent
    expect(h.sentTo(CLIENT).at(-1)!.payload.text).toContain('Напоминаем')
  })

  it('never throws when Telegram fails', async () => {
    const booking = await botBooking()
    await setBookingSetting(db, 'telegram', { adminChatId: ADMIN_CHAT })
    const { notifier, bot } = createBot({ token: 't', db, siteUrl: 'https://atmo.kz', botInfo: BOT_INFO })
    bot.api.config.use(async () => {
      throw new Error('network down')
    })
    await expect(notifier.paymentConfirmed(booking)).resolves.toBe(false)
    await expect(notifier.bookingCreated(booking)).resolves.toBe(false)
  })
})
