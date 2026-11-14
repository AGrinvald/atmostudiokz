import { and, asc, eq, gte, inArray, or } from 'drizzle-orm'
import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { formatHour, formatKzt, formatPhone, studioDateParts } from '../../shared/format'
import { normalizePhone } from '../../shared/booking/phone'
import { calculatePrice, isValidPeopleCount } from '../../shared/booking/pricing'
import {
  BACKGROUNDS,
  LIGHTINGS,
  SESSION_TYPES,
  type Background,
  type BookingSettings,
  type Lighting,
  type SessionType,
} from '../../shared/booking/settings'
import type { Booking, Db } from '../db'
import { ACTIVE_BOOKING_STATUSES, bookings, clients } from '../db/schema'
import { BookingError } from '../booking/errors'
import { cancelByClient, claimPayment, confirmPayment, createBooking, getAvailability, rejectPayment } from '../booking/service'
import { getBookingSettings, setBookingSetting } from '../booking/settings'
import { hoursBetween, studioHourToUtc, toStudioParts } from '../booking/time'
import { createNotifier } from './notifier'
import { clearDraft, getDraft, saveDraft, type Draft } from './session'
import { LABELS, MENU, STUDIO, T, bookingSummary, esc } from './texts'

export interface BotOptions {
  token: string
  db: Db
  /** Public site URL, used for links to the rules and privacy pages. */
  siteUrl: string
  /** `/start <secret>` links the chat that receives admin alerts. */
  adminLinkSecret?: string
  /** Skips the getMe call on startup (used by tests). */
  botInfo?: UserFromGetMe
}

const DATES_PER_PAGE = 9
const DATE = '(\\d{4}-\\d{2}-\\d{2})'
const ACTIVE: readonly string[] = ACTIVE_BOOKING_STATUSES

/**
 * The client-facing Telegram bot (SPEC §7) plus the admin-chat payment buttons.
 *
 * Booking steps carry their choices in callback data (`h:<date>:<hour>`, `s:…:<session>`, …),
 * so they need no server state; the draft is stored only from the contact step on.
 */
export function createBot(opts: BotOptions) {
  const { db, siteUrl } = opts
  const bot = new Bot(opts.token, opts.botInfo ? { botInfo: opts.botInfo } : undefined)
  const notifier = createNotifier(bot.api, db)

  const menu = new Keyboard().text(MENU.book).text(MENU.my).row().text(MENU.about).resized().persistent()
  const contactKeyboard = new Keyboard().requestContact(T.shareContact).resized().oneTime()

  // --- helpers --------------------------------------------------------------

  const html = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } }

  async function show(ctx: Context, text: string, keyboard: InlineKeyboard, edit: boolean) {
    if (edit && ctx.callbackQuery?.message) await ctx.editMessageText(text, { ...html, reply_markup: keyboard })
    else await ctx.reply(text, { ...html, reply_markup: keyboard })
  }

  async function telegramClient(userId: number) {
    const [client] = await db.select().from(clients).where(eq(clients.telegramUserId, userId))
    return client ?? null
  }

  async function ownedBooking(id: number, userId: number): Promise<Booking | null> {
    const [row] = await db
      .select({ booking: bookings })
      .from(bookings)
      .innerJoin(clients, eq(clients.id, bookings.clientId))
      .where(and(eq(bookings.id, id), eq(clients.telegramUserId, userId)))
    return row?.booking ?? null
  }

  async function freeHours(date: string, settings: BookingSettings) {
    const [day] = await getAvailability(db, { fromDate: date, days: 1, settings })
    return (day?.slots ?? []).filter(s => s.status === 'free').map(s => s.hour)
  }

  /** Validates a selection against current settings and availability. */
  async function isStillValid(sel: { date: string; hour: number; sessionType?: string; lighting?: string; background?: string; peopleCount?: number }, settings: BookingSettings) {
    if (!(await freeHours(sel.date, settings)).includes(sel.hour)) return false
    if (sel.lighting && !settings.options.lightings[sel.lighting as Lighting]) return false
    if (sel.background && !settings.options.backgrounds[sel.background as Background]) return false
    if (sel.peopleCount != null && !isValidPeopleCount(settings.pricing, sel.peopleCount)) return false
    return true
  }

  function errorText(e: unknown): string {
    if (e instanceof BookingError) {
      if (e.code === 'slot_taken' || e.code === 'slot_unavailable') return T.slotGone
      if (e.code === 'payment_unavailable') return T.paymentUnavailable
      if (e.code === 'payment_window_expired') return T.paymentWindowExpired
      if (e.code === 'invalid_transition') return T.changed
      if (e.code === 'not_found') return T.notFound
    }
    console.error('[bot]', e)
    return T.error
  }

  // --- booking flow ---------------------------------------------------------

  async function showDates(ctx: Context, page: number, edit: boolean) {
    const settings = await getBookingSettings(db)
    if (!settings.payment.kaspiLink) return void (await ctx.reply(T.paymentUnavailable, { reply_markup: menu }))

    const today = toStudioParts(new Date()).date
    const days = await getAvailability(db, { fromDate: today, days: settings.rules.horizonDays + 1, settings })
    const dates = days.filter(d => d.slots.some(s => s.status === 'free')).map(d => d.date)
    if (!dates.length) return void (await ctx.reply(T.noDates, { reply_markup: menu }))

    const pages = Math.ceil(dates.length / DATES_PER_PAGE)
    const current = Math.min(Math.max(page, 0), pages - 1)
    const kb = new InlineKeyboard()
    dates.slice(current * DATES_PER_PAGE, (current + 1) * DATES_PER_PAGE).forEach((date, i) => {
      const p = studioDateParts(date)
      kb.text(`${p.weekday} ${date.slice(8)}.${date.slice(5, 7)}`, `d:${date}`)
      if (i % 3 === 2) kb.row()
    })
    kb.row()
    if (current > 0) kb.text('‹', `dp:${current - 1}`)
    if (current < pages - 1) kb.text('›', `dp:${current + 1}`)
    await show(ctx, T.pickDate, kb, edit)
  }

  async function startBooking(ctx: Context) {
    if (ctx.chat) await clearDraft(db, ctx.chat.id)
    await showDates(ctx, 0, false)
  }

  bot.hears(MENU.book, startBooking)
  bot.command('book', startBooking)
  bot.callbackQuery('bk', async ctx => {
    await ctx.answerCallbackQuery()
    await showDates(ctx, 0, true)
  })
  bot.callbackQuery(/^dp:(\d+)$/, async ctx => {
    await ctx.answerCallbackQuery()
    await showDates(ctx, Number(ctx.match[1]), true)
  })

  // Date → hours
  bot.callbackQuery(new RegExp(`^d:${DATE}$`), async ctx => {
    const date = ctx.match[1]!
    const hours = await freeHours(date, await getBookingSettings(db))
    if (!hours.length) {
      await ctx.answerCallbackQuery({ text: T.slotGone, show_alert: true })
      return showDates(ctx, 0, true)
    }
    await ctx.answerCallbackQuery()
    const kb = new InlineKeyboard()
    hours.forEach((h, i) => {
      kb.text(formatHour(h), `h:${date}:${h}`)
      if (i % 4 === 3) kb.row()
    })
    kb.row().text(T.back, 'bk')
    await show(ctx, T.pickHour(date), kb, true)
  })

  // Hour → session type
  bot.callbackQuery(new RegExp(`^h:${DATE}:(\\d{1,2})$`), async ctx => {
    const [, date, hourStr] = ctx.match as RegExpMatchArray
    const hour = Number(hourStr)
    const settings = await getBookingSettings(db)
    if (!(await isStillValid({ date: date!, hour }, settings))) {
      await ctx.answerCallbackQuery({ text: T.slotGone, show_alert: true })
      return showDates(ctx, 0, true)
    }
    await ctx.answerCallbackQuery()
    const kb = new InlineKeyboard()
    for (const type of SESSION_TYPES) {
      kb.text(`${LABELS.session[type]} · ${formatKzt(settings.pricing.basePrice[type])}`, `s:${date}:${hour}:${type}`).row()
    }
    kb.text(T.back, `d:${date}`)
    await show(ctx, T.pickSession(date!, hour), kb, true)
  })

  // Session type → lighting
  bot.callbackQuery(new RegExp(`^s:${DATE}:(\\d{1,2}):(30|55)$`), async ctx => {
    const [, date, hour, session] = ctx.match as RegExpMatchArray
    await ctx.answerCallbackQuery()
    const { options } = await getBookingSettings(db)
    const kb = new InlineKeyboard()
    for (const l of LIGHTINGS) {
      if (options.lightings[l]) kb.text(LABELS.lighting[l]!, `l:${date}:${hour}:${session}:${l}`)
    }
    kb.row().text(T.back, `h:${date}:${hour}`)
    await show(ctx, T.pickLighting, kb, true)
  })

  // Lighting → background
  bot.callbackQuery(new RegExp(`^l:${DATE}:(\\d{1,2}):(30|55):(dark|bright)$`), async ctx => {
    const [, date, hour, session, light] = ctx.match as RegExpMatchArray
    await ctx.answerCallbackQuery()
    const { options } = await getBookingSettings(db)
    const kb = new InlineKeyboard()
    for (const b of BACKGROUNDS) {
      if (options.backgrounds[b]) kb.text(LABELS.background[b]!, `g:${date}:${hour}:${session}:${light}:${b}`)
      else kb.text(`${LABELS.background[b]} · скоро`, 'soon')
    }
    kb.row().text(T.back, `s:${date}:${hour}:${session}`)
    await show(ctx, T.pickBackground, kb, true)
  })
  bot.callbackQuery('soon', ctx => ctx.answerCallbackQuery({ text: 'Скоро будет доступно ✨' }))

  // Background → people
  bot.callbackQuery(new RegExp(`^g:${DATE}:(\\d{1,2}):(30|55):(dark|bright):(white|black|red)$`), async ctx => {
    const [, date, hour, session, light, bg] = ctx.match as RegExpMatchArray
    await ctx.answerCallbackQuery()
    const { pricing } = await getBookingSettings(db)
    const kb = new InlineKeyboard()
    for (let n = 1; n <= pricing.maxPeople; n++) {
      kb.text(String(n), `p:${date}:${hour}:${session}:${light}:${bg}:${n}`)
      if (n % 4 === 0) kb.row()
    }
    kb.row().text(T.back, `l:${date}:${hour}:${session}:${light}`)
    await show(ctx, T.pickPeople(pricing.includedPeople, pricing.extraPersonPrice, pricing.maxPeople), kb, true)
  })

  // People → contact / confirm
  bot.callbackQuery(new RegExp(`^p:${DATE}:(\\d{1,2}):(30|55):(dark|bright):(white|black|red):(\\d)$`), async ctx => {
    const [, date, hour, session, light, bg, people] = ctx.match as RegExpMatchArray
    const sel = {
      date: date!,
      hour: Number(hour),
      sessionType: session as SessionType,
      lighting: light as Lighting,
      background: bg as Background,
      peopleCount: Number(people),
    }
    if (!(await isStillValid(sel, await getBookingSettings(db)))) {
      await ctx.answerCallbackQuery({ text: T.slotGone, show_alert: true })
      return showDates(ctx, 0, true)
    }
    await ctx.answerCallbackQuery()

    const client = await telegramClient(ctx.from.id)
    if (client) {
      const draft: Draft = { ...sel, step: 'confirm', phone: client.phone, name: client.name }
      await saveDraft(db, ctx.chat!.id, draft)
      return showSummary(ctx, draft, true)
    }
    await saveDraft(db, ctx.chat!.id, { ...sel, step: 'contact' })
    await ctx.editMessageReplyMarkup()
    await ctx.reply(T.askContact, { reply_markup: contactKeyboard })
  })

  async function showSummary(ctx: Context, draft: Draft, edit: boolean) {
    const { pricing } = await getBookingSettings(db)
    const price = calculatePrice(pricing, draft.sessionType, draft.peopleCount)
    const text =
      `${T.confirmTitle}\n\n` +
      bookingSummary({ ...draft, slotStart: studioHourToUtc(draft.date, draft.hour), priceTotal: price.total }) +
      `\n👤 ${esc(draft.name ?? '')}, ${formatPhone(draft.phone ?? '')}` +
      T.confirmFooter(siteUrl)
    const kb = new InlineKeyboard().text(T.confirm, 'ok').row().text(T.restart, 'bk')
    await show(ctx, text, kb, edit)
  }

  bot.on('message:contact', async ctx => {
    const draft = await getDraft(db, ctx.chat.id)
    if (draft?.step !== 'contact') return void (await ctx.reply(T.help, { reply_markup: menu }))
    const contact = ctx.message.contact
    if (contact.user_id !== ctx.from.id) return void (await ctx.reply(T.notYourContact, { reply_markup: contactKeyboard }))
    const phone = normalizePhone(contact.phone_number)
    if (!phone) return void (await ctx.reply(T.badPhone, { reply_markup: menu }))

    const suggestedName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim().slice(0, 100) || undefined
    await saveDraft(db, ctx.chat.id, { ...draft, step: 'name', phone, suggestedName })
    await ctx.reply(T.askName(suggestedName), {
      reply_markup: suggestedName ? new Keyboard().text(suggestedName).resized().oneTime() : { remove_keyboard: true },
    })
  })

  bot.callbackQuery('ok', async ctx => {
    const draft = await getDraft(db, ctx.chat!.id)
    if (draft?.step !== 'confirm' || !draft.phone || !draft.name) {
      await ctx.answerCallbackQuery({ text: T.draftExpired, show_alert: true })
      return
    }
    await ctx.answerCallbackQuery()
    try {
      const booking = await createBooking(
        db,
        { ...draft, name: draft.name, phone: draft.phone },
        { source: 'bot', telegram: { userId: ctx.from.id, chatId: ctx.chat!.id } },
      )
      await clearDraft(db, ctx.chat!.id)
      await notifier.bookingCreated(booking)
      await sendPayment(ctx, booking, true)
    } catch (e) {
      await ctx.reply(errorText(e), { reply_markup: menu })
      if (e instanceof BookingError && (e.code === 'slot_taken' || e.code === 'slot_unavailable')) await showDates(ctx, 0, false)
    }
  })

  async function sendPayment(ctx: Context, booking: Booking, edit: boolean) {
    const { payment } = await getBookingSettings(db)
    const kb = new InlineKeyboard()
    if (payment.kaspiLink) kb.url(T.payKaspi, payment.kaspiLink).row()
    kb.text(T.claimPayment, `pay:${booking.id}`)
    await show(ctx, T.payment(booking, booking.paymentDeadline!), kb, edit)

    const qr = payment.kaspiQrUrl
    if (qr?.startsWith('data:')) {
      const base64 = qr.slice(qr.indexOf(',') + 1)
      await ctx.replyWithPhoto(new InputFile(Buffer.from(base64, 'base64'), 'kaspi-qr.png'))
    } else if (qr) {
      await ctx.replyWithPhoto(qr)
    }
  }

  bot.callbackQuery(/^pay:(\d+)$/, async ctx => {
    const booking = await ownedBooking(Number(ctx.match[1]), ctx.from.id)
    if (!booking) return void (await ctx.answerCallbackQuery({ text: T.notFound, show_alert: true }))
    await ctx.answerCallbackQuery()
    try {
      const wasAwaiting = booking.status === 'awaiting_payment'
      const claimed = await claimPayment(db, booking.publicToken)
      if (wasAwaiting) await notifier.paymentClaimed(claimed)
      await ctx.editMessageReplyMarkup()
      await ctx.reply(T.paymentClaimed(claimed), { reply_markup: menu })
    } catch (e) {
      await ctx.reply(errorText(e), { reply_markup: menu })
    }
  })

  // --- my bookings ----------------------------------------------------------

  async function myBookings(ctx: Context) {
    const client = ctx.from && (await telegramClient(ctx.from.id))
    const now = new Date()
    const rows = client
      ? await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, client.id),
              or(inArray(bookings.status, ACTIVE_BOOKING_STATUSES), gte(bookings.slotStart, now)),
            ),
          )
          .orderBy(asc(bookings.slotStart))
          .limit(5)
      : []
    if (!rows.length) return void (await ctx.reply(T.myEmpty, { reply_markup: menu }))

    const { rules, payment } = await getBookingSettings(db)
    await ctx.reply(T.myTitle, { reply_markup: menu })
    for (const b of rows) {
      const kb = new InlineKeyboard()
      if (b.status === 'awaiting_payment' && b.paymentDeadline && b.paymentDeadline > now) {
        if (payment.kaspiLink) kb.url(T.payKaspi, payment.kaspiLink)
        kb.text(T.claimPayment, `pay:${b.id}`).row()
      }
      if (ACTIVE.includes(b.status) && hoursBetween(now, b.slotStart) >= rules.cancelCutoffHours) {
        kb.text(T.cancel(b.number), `cx:${b.id}`)
      }
      await ctx.reply(T.myItem(b), { ...html, reply_markup: kb })
    }
  }

  bot.hears(MENU.my, myBookings)
  bot.command('my', myBookings)

  bot.callbackQuery(/^cx:(\d+)$/, async ctx => {
    const booking = await ownedBooking(Number(ctx.match[1]), ctx.from.id)
    if (!booking) return void (await ctx.answerCallbackQuery({ text: T.notFound, show_alert: true }))
    await ctx.answerCallbackQuery()
    const kb = new InlineKeyboard().text(T.cancelYes, `cxy:${booking.id}`).text(T.cancelNo, 'cxn')
    await ctx.reply(T.cancelConfirm(booking), { reply_markup: kb })
  })

  bot.callbackQuery(/^cxy:(\d+)$/, async ctx => {
    const booking = await ownedBooking(Number(ctx.match[1]), ctx.from.id)
    if (!booking) return void (await ctx.answerCallbackQuery({ text: T.notFound, show_alert: true }))
    await ctx.answerCallbackQuery()
    try {
      const cancelled = await cancelByClient(db, booking.publicToken)
      await notifier.clientCancelled(cancelled)
      await ctx.editMessageText(T.cancelled(cancelled))
    } catch (e) {
      const { rules } = await getBookingSettings(db)
      const text = e instanceof BookingError && e.code === 'cancel_cutoff' ? T.cancelCutoff(rules.cancelCutoffHours) : errorText(e)
      await ctx.editMessageText(text)
    }
  })

  bot.callbackQuery('cxn', async ctx => {
    await ctx.answerCallbackQuery()
    await ctx.deleteMessage()
  })

  // --- about & start --------------------------------------------------------

  async function about(ctx: Context) {
    const kb = new InlineKeyboard().url(T.aboutMap, STUDIO.map).row().url(T.aboutInstagram, STUDIO.instagram)
    if (siteUrl.startsWith('https://')) kb.url(T.aboutSite, siteUrl)
    await ctx.reply(T.about, { ...html, reply_markup: kb })
  }
  bot.hears(MENU.about, about)
  bot.command('about', about)

  bot.command('start', async ctx => {
    if (opts.adminLinkSecret && ctx.match === opts.adminLinkSecret) {
      await setBookingSetting(db, 'telegram', { adminChatId: ctx.chat.id })
      return void (await ctx.reply(T.adminLinked))
    }
    await ctx.reply(T.welcome, { reply_markup: menu })
  })

  // --- admin chat: payment decisions ---------------------------------------

  bot.callbackQuery(/^a:(ok|no):(\d+)$/, async ctx => {
    const { telegram } = await getBookingSettings(db)
    if (!telegram.adminChatId || ctx.chat?.id !== telegram.adminChatId) {
      return void (await ctx.answerCallbackQuery({ text: T.notFound, show_alert: true }))
    }
    const ok = ctx.match[1] === 'ok'
    const id = Number(ctx.match[2])
    try {
      const booking = ok ? await confirmPayment(db, id) : await rejectPayment(db, id)
      await ctx.answerCallbackQuery()
      const original = ctx.callbackQuery.message?.text ?? ''
      await ctx.editMessageText(original + T.adminDecided(ok))
      if (ok) await notifier.paymentConfirmed(booking)
      else await notifier.paymentRejected(booking)
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e instanceof BookingError ? T.adminDecisionFailed : T.error, show_alert: true })
    }
  })

  // --- free text: name step, otherwise help --------------------------------

  bot.on('message:text', async ctx => {
    const draft = await getDraft(db, ctx.chat.id)
    if (draft?.step === 'name') {
      const name = ctx.message.text.trim()
      if (!name || name.length > 100 || name.startsWith('/')) return void (await ctx.reply(T.badName))
      const next: Draft = { ...draft, step: 'confirm', name }
      await saveDraft(db, ctx.chat.id, next)
      await ctx.reply(`👍 ${name}`, { reply_markup: menu })
      return showSummary(ctx, next, false)
    }
    await ctx.reply(T.help, { reply_markup: menu })
  })

  bot.catch(err => console.error('[bot] update failed:', err.error))

  return { bot, notifier }
}

export type TelegramBot = ReturnType<typeof createBot>
