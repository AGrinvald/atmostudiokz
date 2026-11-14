import type { FetchError } from 'ofetch'

/**
 * Wraps an admin API call: tracks pending state and turns API error codes into
 * a readable Russian message.
 */
export function useAdminAction() {
  const { t, te } = useI18n()
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    pending.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      const data = (e as FetchError).data as { data?: { code?: string } } | undefined
      const code = data?.data?.code
      error.value = t(code && te(`admin.errors.${code}`) ? `admin.errors.${code}` : 'admin.errors.generic')
      if ((e as FetchError).statusCode === 401) await navigateTo('/admin/login')
      return undefined
    } finally {
      pending.value = false
    }
  }

  return { pending, error, run }
}
