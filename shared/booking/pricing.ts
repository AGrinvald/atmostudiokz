import type { PricingSettings, SessionType } from './settings'

export interface PriceBreakdown {
  sessionType: SessionType
  basePrice: number
  peopleCount: number
  includedPeople: number
  extraPeople: number
  extraPersonPrice: number
  extraTotal: number
  total: number
}

export function isValidPeopleCount(pricing: PricingSettings, peopleCount: number): boolean {
  return Number.isInteger(peopleCount) && peopleCount >= 1 && peopleCount <= pricing.maxPeople
}

/**
 * price = base + max(0, people − included) × extra (SPEC §3.3).
 * Shared by the booking form (live total) and the server (authoritative snapshot).
 */
export function calculatePrice(
  pricing: PricingSettings,
  sessionType: SessionType,
  peopleCount: number,
): PriceBreakdown {
  if (!isValidPeopleCount(pricing, peopleCount)) {
    throw new RangeError(`peopleCount must be an integer between 1 and ${pricing.maxPeople}`)
  }
  const basePrice = pricing.basePrice[sessionType]
  const extraPeople = Math.max(0, peopleCount - pricing.includedPeople)
  const extraTotal = extraPeople * pricing.extraPersonPrice
  return {
    sessionType,
    basePrice,
    peopleCount,
    includedPeople: pricing.includedPeople,
    extraPeople,
    extraPersonPrice: pricing.extraPersonPrice,
    extraTotal,
    total: basePrice + extraTotal,
  }
}
