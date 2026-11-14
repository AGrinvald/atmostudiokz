<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useI18n()
useHead({ title: () => `${t('admin.clients.title')} — ${t('admin.title')}` })

const q = ref('')
const debouncedQ = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, value => {
  clearTimeout(timer)
  timer = setTimeout(() => (debouncedQ.value = value), 250)
})

const { data: clients } = await useFetch('/api/admin/clients', { query: { q: debouncedQ } })
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold">{{ t('admin.clients.title') }}</h1>
    <input v-model="q" type="search" :placeholder="t('admin.clients.search')" :aria-label="t('admin.clients.search')" class="field">

    <p v-if="!clients?.length" class="rounded-2xl bg-white p-6 text-ink-700">{{ t('admin.clients.empty') }}</p>

    <div v-else class="overflow-x-auto rounded-2xl bg-white">
      <table class="w-full text-left text-sm">
        <thead class="text-ink-700">
          <tr>
            <th class="p-3 font-medium">{{ t('admin.clients.name') }}</th>
            <th class="p-3 font-medium">{{ t('admin.clients.phone') }}</th>
            <th class="p-3 text-center font-medium">{{ t('admin.clients.visits') }}</th>
            <th class="p-3 font-medium">{{ t('admin.clients.lastVisit') }}</th>
            <th class="p-3 font-medium">{{ t('admin.clients.nextVisit') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id" class="border-t border-ink-900/5 hover:bg-paper" data-testid="client-row">
            <td class="p-3">
              <NuxtLink :to="`/admin/clients/${c.id}`" class="font-semibold underline-offset-2 hover:underline">{{ c.name }}</NuxtLink>
              <span v-if="c.hasTelegram" class="ml-2 rounded bg-sky-100 px-1.5 text-xs text-sky-900">TG</span>
            </td>
            <td class="p-3 whitespace-nowrap">{{ formatPhone(c.phone) }}</td>
            <td class="p-3 text-center">{{ c.bookingsCount }}</td>
            <td class="p-3 whitespace-nowrap">{{ c.lastVisit ? formatStudioDateTime(c.lastVisit) : '—' }}</td>
            <td class="p-3 whitespace-nowrap">{{ c.nextVisit ? formatStudioDateTime(c.nextVisit) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
