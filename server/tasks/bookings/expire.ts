import { expireOverdueBookings } from '../../booking/service'

export default defineTask({
  meta: { name: 'bookings:expire', description: 'Expire unpaid holds past their payment deadline' },
  async run() {
    const expired = await expireOverdueBookings(useDb())
    const notifier = useNotifier()
    for (const booking of expired) await notifier.bookingExpired(booking)
    return { result: { expired: expired.length } }
  },
})
