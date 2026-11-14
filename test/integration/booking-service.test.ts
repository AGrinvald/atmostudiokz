import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BOOKING_SETTINGS } from '../../shared/booking/settings'
import { bookingEvents, clients, scheduleExceptions, scheduleWeekly } from '../../server/db/schema'
import { BookingError, type BookingErrorCode } from '../../server/booking/errors'
import {
  cancelByAdmin,
  cancelByClient,
  claimPayment,
  completePastBookings,
  confirmPayment,
  createBooking,
  expireOverdueBookings,
  getAvailability,
  markRefunded,
  moveBooking,
  rejectPayment,
  type CreateBookingInput,
} from '../../server/booking/service'
import { setBookingSetting } from '../../server/booking/settings'
import { studioHourToUtc } from '../../server/booking/time'
import { createTestDb } from './db'

const { db, close, reset } = createTestDb()

// Saturday 2026-11-14, 11:00 studio time
const NOW = studioHourToUtc('2026-11-14', 11)
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000)

const input = (overrides: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  date: '2026-11-20',
  hour: 14,
  sessionType: '30',
  lighting: 'dark',
  background: 'white',
  peopleCount: 2,
  name: 'Анна',
  phone: '8 (777) 609-03-17',
  ...overrides,
})

const site = { source: 'site' as const, now: NOW }

async function expectBookingError(promise: Promise<unknown>, code: BookingErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(BookingError)
  expect((error as BookingError).code).toBe(code)
}

async function hourAvailable(date: string, hour: number, now = NOW) {
  const [day] = await getAvailability(db, { fromDate: date, days: 1, now })
  return day!.slots.find(s => s.hour === hour)?.status === 'free'
}

beforeEach(async () => {
  await reset()
  await db.insert(scheduleWeekly).values(
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: true, firstSlotHour: 10, lastSlotHour: 21 })),
  )
  await setBookingSetting(db, 'payment', { kaspiLink: 'https://kaspi.kz/pay/test', kaspiQrUrl: null })
})

afterAll(() => close())

describe('createBooking', () => {
  it('creates an awaiting-payment hold with number, price snapshot and deadline', async () => {
    const booking = await createBooking(db, input(), site)

    expect(booking).toMatchObject({
      number: 'A-1001',
      status: 'awaiting_payment',
      source: 'site',
      sessionType: '30',
      priceTotal: 12000,
      slotStart: studioHourToUtc('2026-11-20', 14),
      paymentDeadline: minutesLater(30),
    })
    expect(booking.publicToken).toMatch(/^[\w-]{32}$/)
    const [client] = await db.select().from(clients)
    expect(client).toMatchObject({ phone: '+77776090317', name: 'Анна' })

    const second = await createBooking(db, input({ hour: 15 }), site)
    expect(second.number).toBe('A-1002')
  })

  it('a 30-min booking blocks the whole hour but not its neighbours', async () => {
    await createBooking(db, input({ sessionType: '30', hour: 14 }), site)
    expect(await hourAvailable('2026-11-20', 13)).toBe(true)
    expect(await hourAvailable('2026-11-20', 14)).toBe(false)
    expect(await hourAvailable('2026-11-20', 15)).toBe(true)
  })

  it('rejects a second booking for the same hour', async () => {
    await createBooking(db, input({ sessionType: '30' }), site)
    await expectBookingError(
      createBooking(db, input({ sessionType: '55', phone: '+77011234567' }), { source: 'bot', now: NOW }),
      'slot_taken',
    )
  })

  it('lets exactly one of two concurrent requests win the slot', async () => {
    const results = await Promise.allSettled([
      createBooking(db, input(), site),
      createBooking(db, input({ phone: '+77011234567' }), site),
      createBooking(db, input({ phone: '+77021234567' }), site),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of results.filter(r => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(BookingError)
      expect(((r as PromiseRejectedResult).reason as BookingError).code).toMatch(/^slot_(taken|unavailable)$/)
    }
  })

  it('prices extra people', async () => {
    const booking = await createBooking(db, input({ sessionType: '55', peopleCount: 7 }), site)
    expect(booking.priceTotal).toBe(22000)
    expect(booking.priceBreakdown).toMatchObject({ extraPeople: 2, extraTotal: 2000 })
  })

  it('snapshots the price so later setting changes do not affect it', async () => {
    const booking = await createBooking(db, input(), site)
    await setBookingSetting(db, 'pricing', {
      ...DEFAULT_BOOKING_SETTINGS.pricing,
      basePrice: { '30': 99000, '55': 99000 },
    })
    const confirmed = await confirmPayment(db, booking.id, NOW)
    expect(confirmed.priceTotal).toBe(12000)
  })

  it.each([
    [{ peopleCount: 9 }, 'invalid_people_count'],
    [{ peopleCount: 0 }, 'invalid_people_count'],
    [{ background: 'black' as const }, 'option_unavailable'],
    [{ phone: '12345' }, 'invalid_phone'],
    [{ name: '   ' }, 'invalid_input'],
    [{ date: '2026-02-30' }, 'invalid_input'],
  ])('rejects %o with %s', async (overrides, code) => {
    await expectBookingError(createBooking(db, input(overrides), site), code as BookingErrorCode)
  })

  it('allows a background once the admin enables it', async () => {
    await setBookingSetting(db, 'options', {
      ...DEFAULT_BOOKING_SETTINGS.options,
      backgrounds: { white: true, black: true, red: false },
    })
    const booking = await createBooking(db, input({ background: 'black' }), site)
    expect(booking.background).toBe('black')
  })

  it.each([
    ['too soon', '2026-11-14', 12],
    ['outside working hours', '2026-11-20', 22],
    ['past the horizon', '2026-12-15', 14],
  ])('rejects a slot that is %s', async (_, date, hour) => {
    await expectBookingError(createBooking(db, input({ date, hour }), site), 'slot_unavailable')
  })

  it('rejects a blocked hour and a closed day', async () => {
    await db.insert(scheduleExceptions).values([
      { date: '2026-11-20', allDay: false, blockedHours: [14] },
      { date: '2026-11-21', allDay: true },
    ])
    await expectBookingError(createBooking(db, input(), site), 'slot_unavailable')
    await expectBookingError(createBooking(db, input({ date: '2026-11-21' }), site), 'slot_unavailable')
  })

  it('is unavailable until a Kaspi link is configured', async () => {
    await setBookingSetting(db, 'payment', { kaspiLink: null, kaspiQrUrl: null })
    await expectBookingError(createBooking(db, input(), site), 'payment_unavailable')
  })

  it('treats the same phone from site and bot as one client and links Telegram', async () => {
    await createBooking(db, input({ phone: '+7 777 609 03 17' }), site)
    await createBooking(db, input({ hour: 16, phone: '87776090317', name: 'Анна К.' }), {
      source: 'bot',
      telegram: { userId: 111, chatId: 222 },
      now: NOW,
    })
    const rows = await db.select().from(clients)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Анна К.', telegramUserId: 111, telegramChatId: 222 })
  })

  it('admin bookings are confirmed immediately and bypass schedule rules but not occupancy', async () => {
    const walkIn = await createBooking(db, input({ date: '2026-11-14', hour: 12 }), {
      source: 'admin',
      paymentMethod: 'cash',
      now: NOW,
    })
    expect(walkIn).toMatchObject({ status: 'confirmed', paymentMethod: 'cash', paymentDeadline: null })

    await createBooking(db, input(), site)
    await expectBookingError(createBooking(db, input(), { source: 'admin', now: NOW }), 'slot_taken')
  })

  it('admin bookings work without a Kaspi link and accept a price override', async () => {
    await setBookingSetting(db, 'payment', { kaspiLink: null, kaspiQrUrl: null })
    const booking = await createBooking(db, input(), { source: 'admin', priceOverride: 10000, now: NOW })
    expect(booking.priceTotal).toBe(10000)
    expect(booking.priceBreakdown).toMatchObject({ total: 12000, override: 10000 })
  })
})

describe('payment hold', () => {
  it('releases the slot when the payment window passes without «Я оплатил»', async () => {
    const hold = await createBooking(db, input(), site)
    const later = minutesLater(31)

    expect(await hourAvailable('2026-11-20', 14, later)).toBe(true)
    await expectBookingError(claimPayment(db, hold.publicToken, later), 'payment_window_expired')

    const expired = await expireOverdueBookings(db, later)
    expect(expired).toHaveLength(0) // claimPayment already expired it
    const next = await createBooking(db, input({ phone: '+77011234567' }), { source: 'site', now: later })
    expect(next.status).toBe('awaiting_payment')
  })

  it('a new booking can take a slot whose hold expired even before the expiry job ran', async () => {
    await createBooking(db, input(), site)
    const next = await createBooking(db, input({ phone: '+77011234567' }), { source: 'site', now: minutesLater(45) })
    expect(next.number).toBe('A-1002')
  })

  it('«Я оплатил» keeps holding the slot past the deadline until the admin decides', async () => {
    const hold = await createBooking(db, input(), site)
    const claimed = await claimPayment(db, hold.publicToken, minutesLater(10))
    expect(claimed.status).toBe('payment_claimed')
    expect(await claimPayment(db, hold.publicToken, minutesLater(11))).toMatchObject({ status: 'payment_claimed' })

    const muchLater = minutesLater(180)
    expect(await expireOverdueBookings(db, muchLater)).toHaveLength(0)
    expect(await hourAvailable('2026-11-20', 14, muchLater)).toBe(false)

    const confirmed = await confirmPayment(db, hold.id, muchLater)
    expect(confirmed).toMatchObject({ status: 'confirmed', confirmedAt: muchLater })
  })

  it('rejecting the payment frees the slot', async () => {
    const hold = await createBooking(db, input(), site)
    await claimPayment(db, hold.publicToken, NOW)
    expect((await rejectPayment(db, hold.id, NOW)).status).toBe('rejected')
    expect(await hourAvailable('2026-11-20', 14)).toBe(true)
  })

  it('cannot confirm a rejected booking', async () => {
    const hold = await createBooking(db, input(), site)
    await rejectPayment(db, hold.id, NOW)
    await expectBookingError(confirmPayment(db, hold.id, NOW), 'invalid_transition')
  })
})

describe('cancellation', () => {
  it('a paid booking cancelled ≥72h ahead becomes refund-pending, then refunded', async () => {
    const booking = await createBooking(db, input(), site) // 2026-11-20 14:00, ~147h ahead
    await claimPayment(db, booking.publicToken, NOW)
    await confirmPayment(db, booking.id, NOW)

    const cancelled = await cancelByClient(db, booking.publicToken, NOW)
    expect(cancelled.status).toBe('cancelled_refund_pending')
    expect(await hourAvailable('2026-11-20', 14)).toBe(true)

    expect((await markRefunded(db, booking.id, NOW)).status).toBe('refunded')
  })

  it('an unpaid hold cancelled by the client needs no refund', async () => {
    const booking = await createBooking(db, input(), site)
    expect((await cancelByClient(db, booking.publicToken, NOW)).status).toBe('cancelled')
  })

  it('clients cannot cancel less than 72h before the session', async () => {
    const booking = await createBooking(db, input({ date: '2026-11-17', hour: 10 }), site) // 71h ahead
    await expectBookingError(cancelByClient(db, booking.publicToken, NOW), 'cancel_cutoff')
  })

  it('the 72h cutoff is inclusive', async () => {
    const booking = await createBooking(db, input({ date: '2026-11-17', hour: 11 }), site) // exactly 72h
    expect((await cancelByClient(db, booking.publicToken, NOW)).status).toBe('cancelled')
  })

  it('the admin can cancel at any time and choose whether a refund is owed', async () => {
    const booking = await createBooking(db, input({ date: '2026-11-14', hour: 14 }), site)
    await confirmPayment(db, booking.id, NOW)
    expect((await cancelByAdmin(db, booking.id, { refund: true }, NOW)).status).toBe('cancelled_refund_pending')
  })
})

describe('admin operations', () => {
  it('moves a booking to a free hour, not onto an occupied one', async () => {
    const a = await createBooking(db, input({ hour: 14 }), site)
    await createBooking(db, input({ hour: 15, phone: '+77011234567' }), site)

    await expectBookingError(moveBooking(db, a.id, { date: '2026-11-20', hour: 15 }, NOW), 'slot_taken')
    const moved = await moveBooking(db, a.id, { date: '2026-11-21', hour: 18 }, NOW)
    expect(moved).toMatchObject({ status: 'awaiting_payment', slotStart: studioHourToUtc('2026-11-21', 18) })
    expect(await hourAvailable('2026-11-20', 14)).toBe(true)
  })

  it('completes confirmed bookings once their hour has ended', async () => {
    const booking = await createBooking(db, input({ date: '2026-11-14', hour: 14 }), site)
    await confirmPayment(db, booking.id, NOW)

    expect(await completePastBookings(db, studioHourToUtc('2026-11-14', 14))).toHaveLength(0)
    const done = await completePastBookings(db, studioHourToUtc('2026-11-14', 15))
    expect(done.map(b => b.status)).toEqual(['completed'])
  })

  it('records an audit event for every transition', async () => {
    const booking = await createBooking(db, input(), site)
    await claimPayment(db, booking.publicToken, NOW)
    await confirmPayment(db, booking.id, NOW)
    const events = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, booking.id))
    expect(events.map(e => [e.type, e.actor])).toEqual([
      ['created', 'client'],
      ['payment_claimed', 'client'],
      ['payment_confirmed', 'admin'],
    ])
  })
})
