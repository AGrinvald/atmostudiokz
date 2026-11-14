import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { authenticateAdmin, setAdminCredentials } from '../../server/admin/account'
import { hashPassword, verifyPassword } from '../../server/admin/password'
import {
  getBookingDetail,
  getClientDetail,
  listBookings,
  listBookingsNeedingAttention,
  listClients,
  updateClient,
} from '../../server/admin/queries'
import { BookingError } from '../../server/booking/errors'
import {
  addScheduleException,
  deleteScheduleException,
  getWeeklySchedule,
  listScheduleExceptions,
  setWeeklySchedule,
} from '../../server/booking/schedule'
import {
  cancelByClient,
  claimPayment,
  confirmPayment,
  createBooking,
  getAvailability,
  markPhotosSent,
  setPhotosLink,
  type CreateBookingInput,
} from '../../server/booking/service'
import { setBookingSetting } from '../../server/booking/settings'
import { studioHourToUtc } from '../../server/booking/time'
import { adminUsers } from '../../server/db/schema'
import { createTestDb } from './db'

const { db, close, reset } = createTestDb()
const NOW = studioHourToUtc('2026-11-14', 11)
const site = { source: 'site' as const, now: NOW }

const input = (overrides: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  date: '2026-11-20',
  hour: 14,
  sessionType: '30',
  lighting: 'dark',
  background: 'white',
  peopleCount: 2,
  name: 'Анна',
  phone: '+77776090317',
  ...overrides,
})

const openWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: true, firstSlotHour: 10, lastSlotHour: 21 }))

beforeEach(async () => {
  await reset()
  await db.delete(adminUsers)
  await setWeeklySchedule(db, openWeek)
  await setBookingSetting(db, 'payment', { kaspiLink: 'https://kaspi.kz/pay/test', kaspiQrUrl: null })
})

afterAll(() => close())

describe('admin account', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(hash).toMatch(/^scrypt\$/)
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(hash, 'wrong password!')).toBe(false)
    expect(await hashPassword('correct horse battery')).not.toBe(hash) // salted
  })

  it('authenticates the admin case-insensitively by email', async () => {
    await setAdminCredentials(db, 'Owner@Atmo.kz', 'super-secret-pass')
    expect(await authenticateAdmin(db, 'owner@atmo.kz', 'super-secret-pass')).toMatchObject({ email: 'owner@atmo.kz' })
    expect(await authenticateAdmin(db, 'owner@atmo.kz', 'nope-nope-nope')).toBeNull()
    expect(await authenticateAdmin(db, 'someone@else.kz', 'super-secret-pass')).toBeNull()
  })

  it('keeps a single admin: setting credentials again replaces them', async () => {
    const first = await setAdminCredentials(db, 'owner@atmo.kz', 'first-password-1')
    const second = await setAdminCredentials(db, 'new@atmo.kz', 'second-password-2')
    expect(second.id).toBe(first.id)
    expect(await db.select().from(adminUsers)).toHaveLength(1)
    expect(await authenticateAdmin(db, 'owner@atmo.kz', 'first-password-1')).toBeNull()
    expect(await authenticateAdmin(db, 'new@atmo.kz', 'second-password-2')).not.toBeNull()
  })

  it('rejects short passwords', async () => {
    await expect(setAdminCredentials(db, 'owner@atmo.kz', 'short')).rejects.toThrow(/at least/)
  })
})

describe('photos link', () => {
  it('can be attached to a confirmed booking and marked sent', async () => {
    const booking = await createBooking(db, input(), site)
    await expect(setPhotosLink(db, booking.id, 'https://disk.yandex.kz/d/abc', NOW)).rejects.toMatchObject({
      code: 'invalid_transition',
    })
    await confirmPayment(db, booking.id, NOW)

    const withLink = await setPhotosLink(db, booking.id, ' https://disk.yandex.kz/d/abc ', NOW)
    expect(withLink).toMatchObject({ photosLink: 'https://disk.yandex.kz/d/abc', photosSentAt: null, status: 'confirmed' })
    expect((await markPhotosSent(db, booking.id, { actor: 'admin' }, NOW)).photosSentAt).toEqual(NOW)
  })

  it.each(['not a url', 'javascript:alert(1)', 'ftp://example.com/x'])('rejects %s', async link => {
    const booking = await createBooking(db, input(), { source: 'admin', now: NOW })
    await expect(setPhotosLink(db, booking.id, link, NOW)).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('cannot be marked sent before a link is attached', async () => {
    const booking = await createBooking(db, input(), { source: 'admin', now: NOW })
    await expect(markPhotosSent(db, booking.id, { actor: 'admin' }, NOW)).rejects.toBeInstanceOf(BookingError)
  })
})

describe('schedule', () => {
  it('returns all seven weekdays and validates updates', async () => {
    await setWeeklySchedule(db, openWeek.map(d => (d.weekday === 0 ? { ...d, isOpen: false } : d)))
    const week = await getWeeklySchedule(db)
    expect(week).toHaveLength(7)
    expect(week[0]).toMatchObject({ weekday: 0, isOpen: false })

    await expect(setWeeklySchedule(db, openWeek.slice(0, 6))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      setWeeklySchedule(db, openWeek.map(d => ({ ...d, firstSlotHour: 20, lastSlotHour: 10 }))),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('a closed weekday has no slots', async () => {
    await setWeeklySchedule(db, openWeek.map(d => (d.weekday === 4 ? { ...d, isOpen: false } : d))) // Friday
    const [day] = await getAvailability(db, { fromDate: '2026-11-20', days: 1, now: NOW })
    expect(day!.slots).toEqual([])
  })

  it('adds, lists and deletes exceptions; blocked hours affect availability', async () => {
    const ex = await addScheduleException(db, { date: '2026-11-20', allDay: false, blockedHours: [15, 14, 14], note: 'Ремонт' })
    expect(ex.blockedHours).toEqual([14, 15])
    expect(await listScheduleExceptions(db, '2026-11-14')).toHaveLength(1)

    const [day] = await getAvailability(db, { fromDate: '2026-11-20', days: 1, now: NOW })
    expect(day!.slots.find(s => s.hour === 14)?.status).toBe('blocked')

    await deleteScheduleException(db, ex.id)
    expect(await listScheduleExceptions(db, '2026-11-14')).toHaveLength(0)
    await expect(deleteScheduleException(db, ex.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('requires either the whole day or some hours', async () => {
    await expect(addScheduleException(db, { date: '2026-11-20', allDay: false, blockedHours: [] })).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })
})

describe('admin queries', () => {
  it('lists a day of bookings with client info and studio-local time', async () => {
    await createBooking(db, input({ hour: 16 }), site)
    await createBooking(db, input({ hour: 12, phone: '+77011234567', name: 'Борис' }), {
      source: 'bot',
      telegram: { userId: 1, chatId: 1 },
      now: NOW,
    })
    await createBooking(db, input({ date: '2026-11-21' }), site)

    const day = await listBookings(db, { fromDate: '2026-11-20', days: 1 })
    expect(day.map(b => [b.hour, b.client.name, b.client.hasTelegram])).toEqual([
      [12, 'Борис', true],
      [16, 'Анна', false],
    ])
    expect(await listBookings(db, { fromDate: '2026-11-20', days: 2 })).toHaveLength(3)
    expect(await listBookings(db, { fromDate: '2026-11-20', days: 2, statuses: ['confirmed'] })).toHaveLength(0)
  })

  it('surfaces bookings that need an admin decision', async () => {
    const claimed = await createBooking(db, input(), site)
    await claimPayment(db, claimed.publicToken, NOW)
    const refund = await createBooking(db, input({ hour: 15 }), site)
    await confirmPayment(db, refund.id, NOW)
    await cancelByClient(db, refund.publicToken, NOW)
    await createBooking(db, input({ hour: 16 }), site) // plain hold — not needing attention

    const attention = await listBookingsNeedingAttention(db)
    expect(attention.map(b => b.status).sort()).toEqual(['cancelled_refund_pending', 'payment_claimed'])
  })

  it('shows booking detail with its event log', async () => {
    const booking = await createBooking(db, input(), site)
    await confirmPayment(db, booking.id, NOW)
    const detail = await getBookingDetail(db, booking.id)
    expect(detail).toMatchObject({ number: 'A-1001', date: '2026-11-20', hour: 14, client: { name: 'Анна' } })
    expect(detail.events.map(e => e.type)).toEqual(['created', 'payment_confirmed'])
    await expect(getBookingDetail(db, 999)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('lists clients with visit counts and searches by name or phone', async () => {
    const a = await createBooking(db, input(), site)
    await confirmPayment(db, a.id, NOW)
    await createBooking(db, input({ hour: 15 }), site) // unpaid — not counted
    await createBooking(db, input({ hour: 16, phone: '+77011234567', name: 'Борис' }), site)

    const all = await listClients(db)
    expect(all).toHaveLength(2)
    expect(all.find(c => c.name === 'Анна')).toMatchObject({ bookingsCount: 1 })
    expect(all.find(c => c.name === 'Борис')).toMatchObject({ bookingsCount: 0, lastVisit: null })

    expect((await listClients(db, { q: 'бор' })).map(c => c.name)).toEqual(['Борис'])
    expect((await listClients(db, { q: '609 03' })).map(c => c.name)).toEqual(['Анна'])
  })

  it('shows client detail and saves admin notes', async () => {
    const booking = await createBooking(db, input(), site)
    await updateClient(db, booking.clientId, { notes: '  Любит тёмный свет  ' })
    const client = await getClientDetail(db, booking.clientId)
    expect(client).toMatchObject({ name: 'Анна', notes: 'Любит тёмный свет' })
    expect(client.bookings.map(b => b.number)).toEqual(['A-1001'])

    await expect(updateClient(db, booking.clientId, { name: '' })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(updateClient(db, 999, { notes: 'x' })).rejects.toMatchObject({ code: 'not_found' })
  })
})
