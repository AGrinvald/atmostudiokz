<script setup lang="ts">
import type { FetchError } from 'ofetch'

definePageMeta({ layout: false })
const { t } = useI18n()
useHead({ title: () => t('admin.login.title') })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function submit() {
  pending.value = true
  error.value = null
  try {
    await $fetch('/api/admin/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin'
    await navigateTo(redirect)
  } catch (e) {
    error.value = (e as FetchError).statusCode === 429 ? t('admin.login.rateLimited') : t('admin.login.invalid')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-ink-900 px-4">
    <form class="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-8" @submit.prevent="submit">
      <img src="/logo-dark.svg" alt="ATMO studio" class="h-8 w-auto self-start">
      <h1 class="text-xl font-bold">{{ t('admin.login.title') }}</h1>
      <label class="flex flex-col gap-1">
        <span class="text-sm">{{ t('admin.login.email') }}</span>
        <input v-model="email" type="email" name="email" autocomplete="username" required class="field">
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm">{{ t('admin.login.password') }}</span>
        <input v-model="password" type="password" name="password" autocomplete="current-password" required class="field">
      </label>
      <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>
      <button type="submit" class="btn btn-primary" :disabled="pending">{{ t('admin.login.submit') }}</button>
    </form>
  </div>
</template>
