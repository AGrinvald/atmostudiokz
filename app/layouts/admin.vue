<script setup lang="ts">
const { t } = useI18n()
const { clear } = useUserSession()

const links = [
  { to: '/admin', label: 'admin.nav.bookings', exact: true },
  { to: '/admin/clients', label: 'admin.nav.clients' },
  { to: '/admin/settings', label: 'admin.nav.settings' },
]

async function logout() {
  await $fetch('/api/admin/logout', { method: 'POST' })
  await clear()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="min-h-dvh bg-paper">
    <header class="sticky top-0 z-10 bg-ink-900 text-white">
      <div class="mx-auto flex max-w-5xl items-center gap-4 overflow-x-auto px-4 py-3">
        <NuxtLink to="/admin" class="shrink-0">
          <img src="/logo-white.svg" alt="ATMO studio" class="h-6 w-auto">
        </NuxtLink>
        <nav class="flex flex-1 gap-1 text-sm">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-full px-3 py-1.5 whitespace-nowrap hover:bg-ink-700"
            :exact-active-class="link.exact ? 'bg-sun text-ink-900 hover:bg-sun' : undefined"
            :active-class="link.exact ? undefined : 'bg-sun text-ink-900 hover:bg-sun'"
          >
            {{ t(link.label) }}
          </NuxtLink>
        </nav>
        <NuxtLink to="/" class="shrink-0 text-sm text-white/70 hover:text-white">{{ t('admin.nav.site') }}</NuxtLink>
        <button type="button" class="shrink-0 text-sm text-white/70 hover:text-white" @click="logout">
          {{ t('admin.nav.logout') }}
        </button>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
