import { getBookingSettings } from '../booking/settings'

/** Everything the booking form needs to render options and compute the live total. */
export default defineEventHandler(async () => {
  const { pricing, options, rules, payment } = await getBookingSettings(useDb())
  return {
    pricing,
    options,
    rules: {
      horizonDays: rules.horizonDays,
      cancelCutoffHours: rules.cancelCutoffHours,
      paymentWindowMinutes: rules.paymentWindowMinutes,
    },
    paymentAvailable: !!payment.kaspiLink,
  }
})
