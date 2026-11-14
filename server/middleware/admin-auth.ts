// Every /api/admin/* route requires the admin session, except logging in.
export default defineEventHandler(async event => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/admin/') || path === '/api/admin/login') return
  await requireUserSession(event)
})
