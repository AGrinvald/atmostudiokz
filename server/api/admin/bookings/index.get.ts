import { z } from 'zod'
import { listBookings } from '../../../admin/queries'
import { isIsoDate, toStudioParts } from '../../../booking/time'
import { bookingStatus } from '../../../db/schema'

const querySchema = z.object({
  from: z.string().refine(isIsoDate).optional(),
  days: z.coerce.number().int().min(1).max(62).default(1),
  status: z
    .union([z.enum(bookingStatus.enumValues), z.array(z.enum(bookingStatus.enumValues))])
    .optional()
    .transform(s => (s === undefined ? undefined : Array.isArray(s) ? s : [s])),
})

export default defineEventHandler(async event => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listBookings(useDb(), {
    fromDate: query.from ?? toStudioParts(new Date()).date,
    days: query.days,
    statuses: query.status,
  })
})
