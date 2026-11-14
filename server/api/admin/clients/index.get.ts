import { z } from 'zod'
import { listClients } from '../../../admin/queries'

const querySchema = z.object({ q: z.string().max(100).optional() })

export default defineEventHandler(async event => {
  const { q } = await getValidatedQuery(event, querySchema.parse)
  return listClients(useDb(), { q })
})
