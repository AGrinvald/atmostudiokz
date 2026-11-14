import { z } from 'zod'
import { getAvailability } from '../booking/service'
import { isIsoDate, toStudioParts } from '../booking/time'

const querySchema = z.object({
  from: z.string().refine(isIsoDate).optional(),
  days: z.coerce.number().int().min(1).max(31).default(14),
})

/** Hourly slots per day; clients only learn whether a slot is available, not why not. */
export default defineEventHandler(async event => {
  const query = await getValidatedQuery(event, querySchema.parse)
  const fromDate = query.from ?? toStudioParts(new Date()).date
  const days = await getAvailability(useDb(), { fromDate, days: query.days })
  return {
    days: days.map(day => ({
      date: day.date,
      slots: day.slots.map(s => ({ hour: s.hour, available: s.status === 'free' })),
    })),
  }
})
