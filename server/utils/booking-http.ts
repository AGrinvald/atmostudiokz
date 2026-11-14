import type { H3Event } from 'h3'
import { BookingError } from '../booking/errors'

/** Runs a booking operation and maps BookingError to an HTTP error with `data.code`. */
export async function handleBooking<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof BookingError) {
      throw createError({ statusCode: e.httpStatus, statusMessage: e.message, data: { code: e.code } })
    }
    throw e
  }
}

export function requireToken(event: H3Event): string {
  const token = getRouterParam(event, 'token')
  if (!token || token.length > 64) throw createError({ statusCode: 404 })
  return token
}
