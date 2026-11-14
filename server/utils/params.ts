import type { H3Event } from 'h3'

export function requireIdParam(event: H3Event, name = 'id'): number {
  const id = Number(getRouterParam(event, name))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 404, data: { code: 'not_found' } })
  return id
}
