import { z } from 'zod'

export const SESSION_TYPES = ['30', '55'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const LIGHTINGS = ['dark', 'bright'] as const
export type Lighting = (typeof LIGHTINGS)[number]

export const BACKGROUNDS = ['white', 'black', 'red'] as const
export type Background = (typeof BACKGROUNDS)[number]

const money = z.number().int().nonnegative()

// SPEC §3.3
export const pricingSettingsSchema = z
  .object({
    basePrice: z.object({ '30': money, '55': money }),
    includedPeople: z.number().int().min(1),
    extraPersonPrice: money,
    maxPeople: z.number().int().min(1),
  })
  .refine(s => s.maxPeople >= s.includedPeople, { message: 'maxPeople must be >= includedPeople' })

// SPEC §3.4 — which options can currently be chosen
export const optionsSettingsSchema = z.object({
  lightings: z.object({ dark: z.boolean(), bright: z.boolean() }),
  backgrounds: z.object({ white: z.boolean(), black: z.boolean(), red: z.boolean() }),
})

// SPEC §3.2, §4.2, §4.3, §5
export const rulesSettingsSchema = z.object({
  minLeadHours: z.number().int().min(0),
  horizonDays: z.number().int().min(1),
  paymentWindowMinutes: z.number().int().min(1),
  cancelCutoffHours: z.number().int().min(0),
  reminderHours: z.number().int().min(1),
})

// SPEC §4.2 — booking is blocked until a Kaspi link is configured
export const paymentSettingsSchema = z.object({
  kaspiLink: z.url().nullable(),
  // An image URL or a data: URL uploaded from the admin panel (~300 KB max)
  kaspiQrUrl: z.string().max(400_000).nullable(),
})

// SPEC §6.1 — «Правила студии» and «Политика конфиденциальности», plain text
export const legalSettingsSchema = z.object({
  rules: z.string().max(50_000),
  privacy: z.string().max(50_000),
})

// SPEC §5 — the chat that receives admin alerts, linked with `/start <secret>`
export const telegramSettingsSchema = z.object({
  adminChatId: z.number().int().nullable(),
})

export const bookingSettingsSchema = z.object({
  pricing: pricingSettingsSchema,
  options: optionsSettingsSchema,
  rules: rulesSettingsSchema,
  payment: paymentSettingsSchema,
  legal: legalSettingsSchema,
  telegram: telegramSettingsSchema,
})

export type PricingSettings = z.infer<typeof pricingSettingsSchema>
export type OptionsSettings = z.infer<typeof optionsSettingsSchema>
export type RulesSettings = z.infer<typeof rulesSettingsSchema>
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>
export type LegalSettings = z.infer<typeof legalSettingsSchema>
export type BookingSettings = z.infer<typeof bookingSettingsSchema>
export type BookingSettingsKey = keyof BookingSettings

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  pricing: {
    basePrice: { '30': 12000, '55': 20000 },
    includedPeople: 5,
    extraPersonPrice: 1000,
    maxPeople: 8,
  },
  options: {
    lightings: { dark: true, bright: true },
    backgrounds: { white: true, black: false, red: false },
  },
  rules: {
    minLeadHours: 2,
    horizonDays: 30,
    paymentWindowMinutes: 30,
    cancelCutoffHours: 72,
    reminderHours: 24,
  },
  payment: {
    kaspiLink: null,
    kaspiQrUrl: null,
  },
  legal: {
    rules: '',
    privacy: '',
  },
  telegram: {
    adminChatId: null,
  },
}
