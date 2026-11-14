<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useI18n()
const route = useRoute()
const id = Number(route.params.id)

const { data: client, error: loadError } = await useFetch(`/api/admin/clients/${id}`, {
  key: `admin-client-${id}`,
})
type Detail = NonNullable<typeof client.value>
useHead({ title: () => `${client.value?.name ?? ''} — ${t('admin.title')}` })

const name = ref(client.value?.name ?? '')
const notes = ref(client.value?.notes ?? '')
const saved = ref(false)

const { pending, error, run } = useAdminAction()
async function save() {
  const updated = await run(() =>
    $fetch<Detail>(`/api/admin/clients/${id}` as string, { method: 'PATCH', body: { name: name.value, notes: notes.value } }),
  )
  if (updated) {
    client.value = updated
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink to="/admin/clients" class="text-sm text-ink-700">{{ t('admin.clients.back') }}</NuxtLink>
    <p v-if="loadError || !client" class="rounded-2xl bg-white p-6">{{ t('admin.errors.not_found') }}</p>

    <template v-else>
      <header class="flex flex-wrap items-baseline gap-3">
        <h1 class="text-2xl font-bold">{{ client.name }}</h1>
        <a :href="`tel:${client.phone}`" class="underline">{{ formatPhone(client.phone) }}</a>
        <span class="text-sm text-ink-700">
          {{ t('admin.booking.telegram') }}: {{ client.hasTelegram ? t('admin.booking.yes') : t('admin.booking.no') }}
        </span>
      </header>

      <form class="flex flex-col gap-3 rounded-2xl bg-white p-5" @submit.prevent="save">
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('admin.clients.name') }}</span>
          <input v-model="name" required maxlength="100" class="field">
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('admin.clients.notes') }}</span>
          <textarea v-model="notes" rows="4" maxlength="5000" :placeholder="t('admin.clients.notesPlaceholder')" class="field" />
        </label>
        <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>
        <div class="flex items-center gap-3">
          <button type="submit" class="btn btn-secondary px-4 py-2 text-sm" :disabled="pending">{{ t('admin.clients.save') }}</button>
          <span v-if="saved" class="text-sm text-green-800">{{ t('admin.clients.saved') }}</span>
        </div>
      </form>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-bold">{{ t('admin.clients.bookings') }}</h2>
        <p v-if="!client.bookings.length" class="rounded-2xl bg-white p-6 text-ink-700">{{ t('admin.clients.noBookings') }}</p>
        <AdminBookingRow v-for="b in client.bookings" :key="b.id" :booking="b" show-date />
      </section>
    </template>
  </div>
</template>
