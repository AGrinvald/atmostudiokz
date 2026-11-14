import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// SPEC §4.1
export const bookingStatus = pgEnum('booking_status', [
  'awaiting_payment',
  'payment_claimed',
  'confirmed',
  'expired',
  'rejected',
  'cancelled_refund_pending',
  'refunded',
  'cancelled',
  'completed',
])

// Statuses that occupy the slot (SPEC §3.1)
export const ACTIVE_BOOKING_STATUSES = ['awaiting_payment', 'payment_claimed', 'confirmed'] as const

export const sessionType = pgEnum('session_type', ['30', '55'])
export const lighting = pgEnum('lighting', ['dark', 'bright'])
export const background = pgEnum('background', ['white', 'black', 'red'])
export const bookingSource = pgEnum('booking_source', ['site', 'bot', 'admin'])
export const paymentMethod = pgEnum('payment_method', ['kaspi', 'cash', 'on_site'])
export const eventActor = pgEnum('event_actor', ['client', 'admin', 'system'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
})

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  // E.164, e.g. +77776090317 (SPEC §3.6)
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }).unique(),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
  notes: text('notes'),
  ...timestamps,
})

// Source of the human-readable booking number: A-1001, A-1002, …
export const bookingNumberSeq = pgSequence('booking_number_seq', { startWith: 1001 })

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    // Human-readable number shown to the client, e.g. A-1042
    number: text('number').notNull().unique(),
    // Unguessable token for /booking/<token> (SPEC §11)
    publicToken: text('public_token').notNull().unique(),
    clientId: integer('client_id').notNull().references(() => clients.id),

    slotStart: timestamp('slot_start', { withTimezone: true }).notNull(),
    sessionType: sessionType('session_type').notNull(),
    lighting: lighting('lighting').notNull(),
    background: background('background').notNull(),
    peopleCount: smallint('people_count').notNull(),

    // Price snapshot at booking time (SPEC §3.3)
    priceTotal: integer('price_total').notNull(),
    priceBreakdown: jsonb('price_breakdown').notNull(),

    status: bookingStatus('status').notNull(),
    source: bookingSource('source').notNull(),
    paymentMethod: paymentMethod('payment_method').notNull().default('kaspi'),

    paymentDeadline: timestamp('payment_deadline', { withTimezone: true }),
    paymentClaimedAt: timestamp('payment_claimed_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),

    comment: text('comment'),
    photosLink: text('photos_link'),
    photosSentAt: timestamp('photos_sent_at', { withTimezone: true }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),

    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    // One active booking per hourly slot — the double-booking guard (SPEC §3.1)
    uniqueIndex('bookings_active_slot_uidx')
      .on(t.slotStart)
      .where(sql`${t.status} in ('awaiting_payment', 'payment_claimed', 'confirmed')`),
  ],
)

export const scheduleWeekly = pgTable('schedule_weekly', {
  // 0 = Monday … 6 = Sunday
  weekday: smallint('weekday').primaryKey(),
  isOpen: boolean('is_open').notNull().default(true),
  firstSlotHour: smallint('first_slot_hour').notNull(),
  lastSlotHour: smallint('last_slot_hour').notNull(),
})

export const scheduleExceptions = pgTable('schedule_exceptions', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  allDay: boolean('all_day').notNull().default(true),
  blockedHours: smallint('blocked_hours').array(),
  note: text('note'),
  ...timestamps,
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bookingEvents = pgTable('booking_events', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id),
  type: text('type').notNull(),
  actor: eventActor('actor').notNull(),
  payload: jsonb('payload'),
  ...timestamps,
})
