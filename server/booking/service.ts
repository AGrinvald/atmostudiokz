import { randomBytes } from 'node:crypto'
import { and, eq, gt, gte, inArray, lt, lte, not, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { normalizePhone } from '../../shared/booking/phone'
import { calculatePrice, isValidPeopleCount } from '../../shared/booking/pricing'
import { BACKGROUNDS, LIGHTINGS, SESSION_TYPES, type BookingSettings } from '../../shared/booking/settings'
import type { Booking, BookingStatus, Client, Db, DbOrTx, Tx } from '../db'
import {
  ACTIVE_BOOKING_STATUSES,
  bookingEvents,
  bookings,
  clients,
  scheduleExceptions,
  scheduleWeekly,
} from '../db/schema'
import { computeAvailability, type DayAvailability } from './availability'
import { BookingError } from './errors'
import { getBookingSettings } from './settings'
import { addDays, hoursBetween, isIsoDate, studioHourToUtc } from './time'

type Actor = 'client' | 'admin' | 'system'
type PaymentMethod = Booking['paymentMethod']

const ACTIVE: readonly BookingStatus[] = ACTIVE_BOOKING_STATUSES
const SLOT_HOUR_MS = 3_600_000

export const createBookingInputSchema = z.object({
  date: z.string().refine(isIsoDate, 'Invalid date'),
  hour: z.number().int().min(0).max(23),
  sessionType: z.enum(SESSION_TYPES),
  lighting: z.enum(LIGHTINGS),
  background: z.enum(BACKGROUNDS),
  peopleCount: z.number().int(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().max(32),
  comment: z.string().trim().max(1000).nullish(),
})
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>

export interface CreateBookingOptions {
  source: 'site' | 'bot' | 'admin'
  telegram?: { userId: number; chatId: number }
  /** Admin bookings only (SPEC §4.4). */
  paymentMethod?: PaymentMethod
  /** Admin bookings only: replaces the calculated total. */
  priceOverride?: number
  now?: Date
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function getAvailability(
  db: DbOrTx,
  params: { fromDate: string; days: number; now?: Date; settings?: BookingSettings },
): Promise<DayAvailability[]> {
  const now = params.now ?? new Date()
  const settings = params.settings ?? (await getBookingSettings(db))
  const dates = Array.from({ length: params.days }, (_, i) => addDays(params.fromDate, i))
  const toDate = dates[dates.length - 1] ?? params.fromDate
  const rangeStart = studioHourToUtc(params.fromDate, 0)
  const rangeEnd = studioHourToUtc(addDays(toDate, 1), 0)

  const [weekly, exceptions, occupied] = await Promise.all([
    db.select().from(scheduleWeekly),
    db
      .select()
      .from(scheduleExceptions)
      .where(and(gte(scheduleExceptions.date, params.fromDate), lte(scheduleExceptions.date, toDate))),
    db
      .select({ slotStart: bookings.slotStart })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ACTIVE),
          // Holds past their payment deadline no longer occupy the slot, even before the expiry job runs.
          not(and(eq(bookings.status, 'awaiting_payment'), lte(bookings.paymentDeadline, now))!),
          gte(bookings.slotStart, rangeStart),
          lt(bookings.slotStart, rangeEnd),
        ),
      ),
  ])

  return computeAvailability({
    dates,
    weekly,
    exceptions,
    occupied: occupied.map(o => o.slotStart),
    now,
    rules: settings.rules,
  })
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a booking (SPEC §4.2, §4.4).
 * Site/bot bookings start as `awaiting_payment` with a payment deadline;
 * admin bookings are `confirmed` immediately and may bypass schedule rules
 * (but never an occupied slot).
 */
export async function createBooking(
  db: Db,
  rawInput: unknown,
  opts: CreateBookingOptions,
): Promise<Booking> {
  const parsed = createBookingInputSchema.safeParse(rawInput)
  if (!parsed.success) throw new BookingError('invalid_input', z.prettifyError(parsed.error))
  const input = parsed.data
  const now = opts.now ?? new Date()
  const isAdmin = opts.source === 'admin'
  const settings = await getBookingSettings(db)

  const phone = normalizePhone(input.phone)
  if (!phone) throw new BookingError('invalid_phone')
  if (!settings.options.lightings[input.lighting] || !settings.options.backgrounds[input.background]) {
    throw new BookingError('option_unavailable')
  }
  if (!isValidPeopleCount(settings.pricing, input.peopleCount)) {
    throw new BookingError('invalid_people_count')
  }
  if (!isAdmin && !settings.payment.kaspiLink) throw new BookingError('payment_unavailable')

  // Free the slot from overdue holds so the unique index doesn't reject a legitimate booking.
  await expireOverdueBookings(db, now)

  if (!isAdmin) {
    const [day] = await getAvailability(db, { fromDate: input.date, days: 1, now, settings })
    const slot = day?.slots.find(s => s.hour === input.hour)
    if (slot?.status === 'booked') throw new BookingError('slot_taken')
    if (slot?.status !== 'free') throw new BookingError('slot_unavailable')
  }

  const price = calculatePrice(settings.pricing, input.sessionType, input.peopleCount)
  const override = isAdmin && opts.priceOverride != null ? opts.priceOverride : null

  try {
    return await db.transaction(async tx => {
      const client = await upsertClient(tx, { phone, name: input.name, telegram: opts.telegram })
      const [booking] = await tx
        .insert(bookings)
        .values({
          number: sql`'A-' || nextval('booking_number_seq')`,
          publicToken: randomBytes(24).toString('base64url'),
          clientId: client.id,
          slotStart: studioHourToUtc(input.date, input.hour),
          sessionType: input.sessionType,
          lighting: input.lighting,
          background: input.background,
          peopleCount: input.peopleCount,
          priceTotal: override ?? price.total,
          priceBreakdown: override == null ? price : { ...price, override },
          status: isAdmin ? 'confirmed' : 'awaiting_payment',
          source: opts.source,
          paymentMethod: isAdmin ? (opts.paymentMethod ?? 'kaspi') : 'kaspi',
          paymentDeadline: isAdmin
            ? null
            : new Date(now.getTime() + settings.rules.paymentWindowMinutes * 60_000),
          confirmedAt: isAdmin ? now : null,
          comment: input.comment || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      await logEvent(tx, booking!.id, 'created', isAdmin ? 'admin' : 'client', { source: opts.source }, now)
      return booking!
    })
  } catch (e) {
    if (isActiveSlotConflict(e)) throw new BookingError('slot_taken')
    throw e
  }
}

async function upsertClient(
  tx: Tx,
  data: { phone: string; name: string; telegram?: { userId: number; chatId: number } },
): Promise<Client> {
  const telegram = data.telegram
    ? { telegramUserId: data.telegram.userId, telegramChatId: data.telegram.chatId }
    : {}
  const [client] = await tx
    .insert(clients)
    .values({ phone: data.phone, name: data.name, ...telegram })
    .onConflictDoUpdate({ target: clients.phone, set: { name: data.name, ...telegram } })
    .returning()
  return client!
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function findBookingByToken(db: DbOrTx, token: string): Promise<Booking | null> {
  const [row] = await db.select().from(bookings).where(eq(bookings.publicToken, token))
  return row ?? null
}

export async function findBookingById(db: DbOrTx, id: number): Promise<Booking | null> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id))
  return row ?? null
}

// ---------------------------------------------------------------------------
// Status transitions (SPEC §4.1)
// ---------------------------------------------------------------------------

/** Client pressed «Я оплатил». Idempotent. */
export async function claimPayment(db: Db, token: string, now = new Date()): Promise<Booking> {
  const booking = await requireBooking(findBookingByToken(db, token))
  if (booking.status === 'payment_claimed') return booking
  if (booking.status === 'awaiting_payment' && booking.paymentDeadline && booking.paymentDeadline <= now) {
    await expireOverdueBookings(db, now)
    throw new BookingError('payment_window_expired')
  }
  return transitionOrThrow(db, booking, {
    from: ['awaiting_payment'],
    set: { status: 'payment_claimed', paymentClaimedAt: now },
    where: gt(bookings.paymentDeadline, now),
    event: { type: 'payment_claimed', actor: 'client' },
    now,
  })
}

/** Admin: ✅ Оплата получена. Allowed before the client presses «Я оплатил» too. */
export function confirmPayment(db: Db, bookingId: number, now = new Date()): Promise<Booking> {
  return transitionById(db, bookingId, {
    from: ['awaiting_payment', 'payment_claimed'],
    set: { status: 'confirmed', confirmedAt: now },
    event: { type: 'payment_confirmed', actor: 'admin' },
    now,
  })
}

/** Admin: ❌ Оплаты нет. Frees the slot. */
export function rejectPayment(db: Db, bookingId: number, now = new Date()): Promise<Booking> {
  return transitionById(db, bookingId, {
    from: ['awaiting_payment', 'payment_claimed'],
    set: { status: 'rejected', cancelledAt: now },
    event: { type: 'payment_rejected', actor: 'admin' },
    now,
  })
}

/** Client self-cancel, allowed only ≥ cancelCutoffHours before the slot (SPEC §4.3). */
export async function cancelByClient(db: Db, token: string, now = new Date()): Promise<Booking> {
  const booking = await requireBooking(findBookingByToken(db, token))
  if (!ACTIVE.includes(booking.status)) throw new BookingError('invalid_transition')
  const { rules } = await getBookingSettings(db)
  if (hoursBetween(now, booking.slotStart) < rules.cancelCutoffHours) {
    throw new BookingError('cancel_cutoff')
  }
  const status: BookingStatus =
    booking.status === 'awaiting_payment' ? 'cancelled' : 'cancelled_refund_pending'
  return transitionOrThrow(db, booking, {
    from: [booking.status],
    set: { status, cancelledAt: now },
    event: { type: 'cancelled', actor: 'client', payload: { refundOwed: status === 'cancelled_refund_pending' } },
    now,
  })
}

/** Admin cancel at any time; the admin decides whether a refund is owed. */
export function cancelByAdmin(
  db: Db,
  bookingId: number,
  opts: { refund: boolean },
  now = new Date(),
): Promise<Booking> {
  return transitionById(db, bookingId, {
    from: ACTIVE,
    set: { status: opts.refund ? 'cancelled_refund_pending' : 'cancelled', cancelledAt: now },
    event: { type: 'cancelled', actor: 'admin', payload: { refundOwed: opts.refund } },
    now,
  })
}

/** Admin pressed «Возврат выполнен» after refunding in Kaspi. */
export function markRefunded(db: Db, bookingId: number, now = new Date()): Promise<Booking> {
  return transitionById(db, bookingId, {
    from: ['cancelled_refund_pending'],
    set: { status: 'refunded', refundedAt: now },
    event: { type: 'refunded', actor: 'admin' },
    now,
  })
}

/** Admin moves an active booking to another hour; the slot must not be occupied. */
export async function moveBooking(
  db: Db,
  bookingId: number,
  to: { date: string; hour: number },
  now = new Date(),
): Promise<Booking> {
  if (!isIsoDate(to.date) || !Number.isInteger(to.hour) || to.hour < 0 || to.hour > 23) {
    throw new BookingError('invalid_input')
  }
  const booking = await requireBooking(findBookingById(db, bookingId))
  const slotStart = studioHourToUtc(to.date, to.hour)
  await expireOverdueBookings(db, now)
  try {
    return await transitionOrThrow(db, booking, {
      from: ACTIVE,
      set: { status: booking.status, slotStart, reminderSentAt: null },
      event: {
        type: 'moved',
        actor: 'admin',
        payload: { from: booking.slotStart.toISOString(), to: slotStart.toISOString() },
      },
      now,
    })
  } catch (e) {
    if (isActiveSlotConflict(e)) throw new BookingError('slot_taken')
    throw e
  }
}

/** Admin attaches the cloud link with the photos (SPEC §4.5). Re-attaching replaces the link. */
export async function setPhotosLink(db: Db, bookingId: number, link: string, now = new Date()): Promise<Booking> {
  const parsed = z.url({ protocol: /^https?$/ }).max(2000).safeParse(link.trim())
  if (!parsed.success) throw new BookingError('invalid_input', 'Invalid photos link')
  const booking = await requireBooking(findBookingById(db, bookingId))
  return transitionOrThrow(db, booking, {
    from: ['confirmed', 'completed'],
    set: { status: booking.status, photosLink: parsed.data, photosSentAt: null },
    event: { type: 'photos_link_set', actor: 'admin', payload: { link: parsed.data } },
    now,
  })
}

/** Records that the photos link reached the client (sent by the bot, or manually by the admin). */
export async function markPhotosSent(
  db: Db,
  bookingId: number,
  opts: { actor: Actor } = { actor: 'admin' },
  now = new Date(),
): Promise<Booking> {
  const booking = await requireBooking(findBookingById(db, bookingId))
  if (!booking.photosLink) throw new BookingError('invalid_transition', 'No photos link to send')
  return transitionOrThrow(db, booking, {
    from: ['confirmed', 'completed'],
    set: { status: booking.status, photosSentAt: now },
    event: { type: 'photos_sent', actor: opts.actor },
    now,
  })
}

/** Expires holds whose payment deadline passed without «Я оплатил». Returns expired bookings. */
export async function expireOverdueBookings(db: Db, now = new Date()): Promise<Booking[]> {
  return db.transaction(async tx => {
    const rows = await tx
      .update(bookings)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(bookings.status, 'awaiting_payment'), lte(bookings.paymentDeadline, now)))
      .returning()
    for (const row of rows) await logEvent(tx, row.id, 'expired', 'system', null, now)
    return rows
  })
}

/** Marks confirmed bookings whose hour has ended as completed. */
export async function completePastBookings(db: Db, now = new Date()): Promise<Booking[]> {
  return db.transaction(async tx => {
    const rows = await tx
      .update(bookings)
      .set({ status: 'completed', updatedAt: now })
      .where(
        and(
          eq(bookings.status, 'confirmed'),
          lte(bookings.slotStart, new Date(now.getTime() - SLOT_HOUR_MS)),
        ),
      )
      .returning()
    for (const row of rows) await logEvent(tx, row.id, 'completed', 'system', null, now)
    return rows
  })
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface TransitionSpec {
  from: readonly BookingStatus[]
  set: Partial<typeof bookings.$inferInsert> & { status: BookingStatus }
  where?: SQL
  event: { type: string; actor: Actor; payload?: unknown }
  now: Date
}

async function transitionById(db: Db, bookingId: number, spec: TransitionSpec): Promise<Booking> {
  const booking = await requireBooking(findBookingById(db, bookingId))
  return transitionOrThrow(db, booking, spec)
}

/**
 * Applies a status change with a conditional UPDATE (status must still be in `from`),
 * so concurrent actions can't both succeed. Logs a booking event in the same transaction.
 */
async function transitionOrThrow(db: Db, booking: Booking, spec: TransitionSpec): Promise<Booking> {
  const updated = await db.transaction(async tx => {
    const [row] = await tx
      .update(bookings)
      .set({ ...spec.set, updatedAt: spec.now })
      .where(and(eq(bookings.id, booking.id), inArray(bookings.status, spec.from), spec.where))
      .returning()
    if (row) await logEvent(tx, row.id, spec.event.type, spec.event.actor, spec.event.payload, spec.now)
    return row
  })
  if (!updated) throw new BookingError('invalid_transition', `Cannot ${spec.event.type} a ${booking.status} booking`)
  return updated
}

async function requireBooking(promise: Promise<Booking | null>): Promise<Booking> {
  const booking = await promise
  if (!booking) throw new BookingError('not_found')
  return booking
}

async function logEvent(
  tx: DbOrTx,
  bookingId: number,
  type: string,
  actor: Actor,
  payload: unknown,
  now: Date,
): Promise<void> {
  await tx.insert(bookingEvents).values({ bookingId, type, actor, payload: payload ?? null, createdAt: now })
}

function isActiveSlotConflict(error: unknown): boolean {
  for (let e: any = error; e; e = e.cause) {
    if (e.code === '23505' && e.constraint_name === 'bookings_active_slot_uidx') return true
  }
  return false
}
