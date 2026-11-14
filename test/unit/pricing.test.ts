import { describe, expect, it } from 'vitest'
import { calculatePrice } from '../../shared/booking/pricing'
import { DEFAULT_BOOKING_SETTINGS } from '../../shared/booking/settings'

const pricing = DEFAULT_BOOKING_SETTINGS.pricing

describe('calculatePrice', () => {
  it.each([
    ['30', 1, 12000],
    ['30', 5, 12000],
    ['30', 6, 13000],
    ['30', 8, 15000],
    ['55', 1, 20000],
    ['55', 5, 20000],
    ['55', 7, 22000],
    ['55', 8, 23000],
  ] as const)('%s min for %i people costs %i ₸', (sessionType, people, total) => {
    expect(calculatePrice(pricing, sessionType, people).total).toBe(total)
  })

  it('breaks down extra people', () => {
    expect(calculatePrice(pricing, '55', 7)).toEqual({
      sessionType: '55',
      basePrice: 20000,
      peopleCount: 7,
      includedPeople: 5,
      extraPeople: 2,
      extraPersonPrice: 1000,
      extraTotal: 2000,
      total: 22000,
    })
  })

  it.each([0, 9, 2.5, -1])('rejects %d people', people => {
    expect(() => calculatePrice(pricing, '30', people)).toThrow(RangeError)
  })

  it('uses admin-edited settings', () => {
    const custom = { ...pricing, basePrice: { '30': 10000, '55': 18000 }, extraPersonPrice: 1500 }
    expect(calculatePrice(custom, '30', 6).total).toBe(11500)
  })
})
