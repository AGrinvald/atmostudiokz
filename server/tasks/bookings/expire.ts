import { expireOverdueBookings } from '../../booking/service'

export default defineTask({
  meta: { name: 'bookings:expire', description: 'Expire unpaid holds past their payment deadline' },
  async run() {
    const expired = await expireOverdueBookings(useDb())
    return { result: { expired: expired.length } }
  },
})
