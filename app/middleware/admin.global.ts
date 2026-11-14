// Every /admin page requires the admin session; the login page redirects away when already logged in.
export default defineNuxtRouteMiddleware(to => {
  if (!to.path.startsWith('/admin')) return
  const { loggedIn } = useUserSession()
  if (to.path === '/admin/login') {
    if (loggedIn.value) return navigateTo('/admin')
    return
  }
  if (!loggedIn.value) return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
})
