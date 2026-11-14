/**
 * Normalizes a +7 phone number to E.164 (`+7XXXXXXXXXX`), the client identity key (SPEC §3.6).
 * Accepts `+7 777 609 03 17`, `8 (777) 609-03-17`, `77776090317`, `7776090317`.
 * Returns null when the input is not a valid +7 number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length !== 11 || !digits.startsWith('7')) return null
  return `+${digits}`
}
