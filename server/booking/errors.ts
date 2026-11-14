export type BookingErrorCode =
  | 'invalid_input'
  | 'invalid_phone'
  | 'option_unavailable'
  | 'invalid_people_count'
  | 'slot_unavailable'
  | 'slot_taken'
  | 'payment_unavailable'
  | 'payment_window_expired'
  | 'cancel_cutoff'
  | 'invalid_transition'
  | 'not_found'

const HTTP_STATUS: Record<BookingErrorCode, number> = {
  invalid_input: 422,
  invalid_phone: 422,
  option_unavailable: 422,
  invalid_people_count: 422,
  slot_unavailable: 409,
  slot_taken: 409,
  payment_unavailable: 503,
  payment_window_expired: 409,
  cancel_cutoff: 409,
  invalid_transition: 409,
  not_found: 404,
}

export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    message: string = code,
  ) {
    super(message)
    this.name = 'BookingError'
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code]
  }
}
