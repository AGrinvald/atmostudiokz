import type { BookingSettings } from '../../shared/booking/settings'
import type { Booking } from '../db'
import { ACTIVE_BOOKING_STATUSES } from '../db/schema'
import { hoursBetween, toStudioParts } from './time'

/** What the client sees on /booking/<token> and in the bot. Never includes other clients' data. */
export function toPublicBooking(booking: Booking, settings: BookingSettings, now = new Date()) {
  const start = toStudioParts(booking.slotStart)
  const awaitingPayment =
    booking.status === 'awaiting_payment' && !!booking.paymentDeadline && booking.paymentDeadline > now
  const isActive = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status)

  return {
    number: booking.number,
    token: booking.publicToken,
    status: booking.status,
    date: start.date,
    hour: start.hour,
    slotStart: booking.slotStart.toISOString(),
    sessionType: booking.sessionType,
    lighting: booking.lighting,
    background: booking.background,
    peopleCount: booking.peopleCount,
    priceTotal: booking.priceTotal,
    paymentDeadline: booking.paymentDeadline?.toISOString() ?? null,
    canClaimPayment: awaitingPayment,
    canCancel: isActive && hoursBetween(now, booking.slotStart) >= settings.rules.cancelCutoffHours,
    payment: awaitingPayment ? settings.payment : null,
  }
}

export type PublicBooking = ReturnType<typeof toPublicBooking>
