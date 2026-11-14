import { completePastBookings } from '../../booking/service'

export default defineTask({
  meta: { name: 'bookings:complete', description: 'Mark confirmed bookings whose hour has ended as completed' },
  async run() {
    const completed = await completePastBookings(useDb())
    return { result: { completed: completed.length } }
  },
})
