import { z } from 'zod'
import { authenticateAdmin } from '../../admin/account'

const bodySchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(200),
})

export default defineEventHandler(async event => {
  rateLimit(event, { key: 'admin-login', limit: 5, windowMs: 15 * 60_000 })
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  const admin = await authenticateAdmin(useDb(), email, password)
  if (!admin) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials', data: { code: 'invalid_credentials' } })
  }
  resetRateLimit(event, 'admin-login')
  await setUserSession(event, { user: admin, loggedInAt: new Date().toISOString() })
  return { ok: true }
})
