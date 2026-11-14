import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Booking, BookingStatus, Client, Db } from '../db'
import { bookingEvents, bookings, clients } from '../db/schema'
import { BookingError } from '../booking/errors'
import { addDays, studioHourToUtc, toStudioParts } from '../booking/time'

const clientColumns = {
  id: clients.id,
  name: clients.name,
  phone: clients.phone,
  telegramUserId: clients.telegramUserId,
}
type ClientSummary = { id: number; name: string; phone: string; telegramUserId: number | null }

/** A booking with studio-local date/hour and its client, as shown in the admin panel. */
export function toAdminBooking(booking: Booking, client: ClientSummary) {
  const start = toStudioParts(booking.slotStart)
  return { ...booking, date: start.date, hour: start.hour, client: { ...client, hasTelegram: client.telegramUserId != null } }
}
export type AdminBooking = ReturnType<typeof toAdminBooking>

export async function listBookings(
  db: Db,
  params: { fromDate: string; days: number; statuses?: BookingStatus[] },
): Promise<AdminBooking[]> {
  const rows = await db
    .select({ booking: bookings, client: clientColumns })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(
      and(
        gte(bookings.slotStart, studioHourToUtc(params.fromDate, 0)),
        lt(bookings.slotStart, studioHourToUtc(addDays(params.fromDate, params.days), 0)),
        params.statuses?.length ? inArray(bookings.status, params.statuses) : undefined,
      ),
    )
    .orderBy(asc(bookings.slotStart), asc(bookings.id))
  return rows.map(r => toAdminBooking(r.booking, r.client))
}

/** Bookings waiting for an admin decision: payment to check, refund to make. */
export async function listBookingsNeedingAttention(db: Db): Promise<AdminBooking[]> {
  const rows = await db
    .select({ booking: bookings, client: clientColumns })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(inArray(bookings.status, ['payment_claimed', 'cancelled_refund_pending']))
    .orderBy(asc(bookings.slotStart))
  return rows.map(r => toAdminBooking(r.booking, r.client))
}

export async function getBookingDetail(db: Db, id: number) {
  const [row] = await db
    .select({ booking: bookings, client: clientColumns })
    .from(bookings)
    .innerJoin(clients, eq(clients.id, bookings.clientId))
    .where(eq(bookings.id, id))
  if (!row) throw new BookingError('not_found')
  const events = await db
    .select()
    .from(bookingEvents)
    .where(eq(bookingEvents.bookingId, id))
    .orderBy(asc(bookingEvents.createdAt), asc(bookingEvents.id))
  return { ...toAdminBooking(row.booking, row.client), events }
}

/** Bookings that count as a visit (or an upcoming one) in client stats. */
const VISIT_STATUSES: BookingStatus[] = ['confirmed', 'completed']

export async function listClients(db: Db, params: { q?: string; limit?: number } = {}) {
  const q = params.q?.trim()
  const digits = q?.replace(/\D/g, '')
  const search = q
    ? or(ilike(clients.name, `%${q}%`), digits && digits.length >= 3 ? ilike(clients.phone, `%${digits}%`) : undefined)
    : undefined

  const visits = db
    .select({
      clientId: bookings.clientId,
      bookingsCount: sql<number>`count(*)::int`.as('bookings_count'),
      lastVisit: sql<Date | null>`max(${bookings.slotStart}) filter (where ${bookings.slotStart} <= now())`.as('last_visit'),
      nextVisit: sql<Date | null>`min(${bookings.slotStart}) filter (where ${bookings.slotStart} > now())`.as('next_visit'),
    })
    .from(bookings)
    .where(inArray(bookings.status, VISIT_STATUSES))
    .groupBy(bookings.clientId)
    .as('visits')

  const rows = await db
    .select({
      client: clients,
      bookingsCount: visits.bookingsCount,
      lastVisit: visits.lastVisit,
      nextVisit: visits.nextVisit,
    })
    .from(clients)
    .leftJoin(visits, eq(visits.clientId, clients.id))
    .where(search)
    .orderBy(desc(sql`coalesce(${visits.nextVisit}, ${visits.lastVisit}, ${clients.createdAt})`))
    .limit(params.limit ?? 200)

  return rows.map(r => ({
    ...r.client,
    hasTelegram: r.client.telegramUserId != null,
    bookingsCount: r.bookingsCount ?? 0,
    lastVisit: r.lastVisit ? new Date(r.lastVisit) : null,
    nextVisit: r.nextVisit ? new Date(r.nextVisit) : null,
  }))
}

export async function getClientDetail(db: Db, id: number) {
  const [client] = await db.select().from(clients).where(eq(clients.id, id))
  if (!client) throw new BookingError('not_found')
  const rows = await db.select().from(bookings).where(eq(bookings.clientId, id)).orderBy(desc(bookings.slotStart))
  return {
    ...client,
    hasTelegram: client.telegramUserId != null,
    bookings: rows.map(b => toAdminBooking(b, client)),
  }
}

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  notes: z.string().max(5000).nullish(),
})

export async function updateClient(db: Db, id: number, input: unknown): Promise<Client> {
  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) throw new BookingError('invalid_input', z.prettifyError(parsed.error))
  const { name, notes } = parsed.data
  if (name === undefined && notes === undefined) {
    const [current] = await db.select().from(clients).where(eq(clients.id, id))
    if (!current) throw new BookingError('not_found')
    return current
  }
  const [row] = await db
    .update(clients)
    .set({ ...(name !== undefined && { name }), ...(notes !== undefined && { notes: notes?.trim() || null }) })
    .where(eq(clients.id, id))
    .returning()
  if (!row) throw new BookingError('not_found')
  return row
}
