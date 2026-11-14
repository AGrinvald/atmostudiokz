import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../../shared/booking/phone'

describe('normalizePhone', () => {
  it.each([
    '+7 777 609 03 17',
    '8 (777) 609-03-17',
    '77776090317',
    '7776090317',
    '+7(777)6090317',
  ])('normalizes %s', input => {
    expect(normalizePhone(input)).toBe('+77776090317')
  })

  it.each(['', '12345', '+1 202 555 0100', '+7 777 609 0','+7 777 609 03 177'])('rejects %s', input => {
    expect(normalizePhone(input)).toBeNull()
  })
})
