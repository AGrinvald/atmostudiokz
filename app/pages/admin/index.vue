<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useI18n()
useHead({ title: () => `${t('admin.bookings.title')} — ${t('admin.title')}` })

const route = useRoute()
const date = computed(() => (typeof route.query.date === 'string' ? route.query.date : studioToday()))
const setDate = (d: string) => navigateTo({ query: { ...route.query, date: d } })

const showInactive = ref(false)
const INACTIVE = ['expired', 'rejected', 'cancelled', 'refunded']

const { data: bookings, refresh: refreshDay } = await useFetch('/api/admin/bookings', {
  query: { from: date, days: 1 },
})
const { data: attention, refresh: refreshAttention } = await useFetch('/api/admin/bookings/attention')

const visible = computed(() =>
  (bookings.value ?? []).filter(b => showInactive.value || !INACTIVE.includes(b.status)),
)
const hiddenCount = computed(() => (bookings.value?.length ?? 0) - visible.value.length)

const { pending, error, run } = useAdminAction()
async function act(id: number, action: 'confirm' | 'reject' | 'refunded') {
  await run(() => $fetch<unknown>(`/api/admin/bookings/${id}/${action}` as string, { method: 'POST' }))
  await Promise.all([refreshDay(), refreshAttention()])
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- Needs attention -->
    <section v-if="attention?.length" class="flex flex-col gap-3" data-testid="attention">
      <h2 class="text-lg font-bold">{{ t('admin.bookings.attention') }} · {{ attention.length }}</h2>
      <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>
      <AdminBookingRow v-for="b in attention" :key="b.id" :booking="b" show-date>
        <template #actions>
          <template v-if="b.status === 'payment_claimed'">
            <button type="button" class="btn btn-primary px-4 py-2 text-sm" :disabled="pending" @click="act(b.id, 'confirm')">
              {{ t('admin.bookings.confirm') }}
            </button>
            <button type="button" class="btn btn-secondary px-4 py-2 text-sm" :disabled="pending" @click="act(b.id, 'reject')">
              {{ t('admin.bookings.reject') }}
            </button>
          </template>
          <button
            v-else-if="b.status === 'cancelled_refund_pending'"
            type="button"
            class="btn btn-secondary px-4 py-2 text-sm"
            :disabled="pending"
            @click="act(b.id, 'refunded')"
          >
            {{ t('admin.bookings.refunded') }}
          </button>
        </template>
      </AdminBookingRow>
    </section>

    <!-- Day view -->
    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-2xl font-bold">{{ formatStudioDate(date) }}</h1>
        <button type="button" class="btn btn-secondary size-10 p-0" :aria-label="t('admin.bookings.prevDay')" @click="setDate(shiftDate(date, -1))">
          ‹
        </button>
        <button type="button" class="rounded-full bg-white px-4 py-2 text-sm font-semibold" @click="setDate(studioToday())">
          {{ t('admin.bookings.today') }}
        </button>
        <input
          type="date"
          :value="date"
          class="rounded-full bg-white px-3 py-2 text-sm"
          @change="e => (e.target as HTMLInputElement).value && setDate((e.target as HTMLInputElement).value)"
        >
        <button type="button" class="btn btn-secondary size-10 p-0" :aria-label="t('admin.bookings.nextDay')" @click="setDate(shiftDate(date, 1))">
          ›
        </button>
        <NuxtLink :to="`/admin/bookings/new?date=${date}`" class="btn btn-primary px-4 py-2 text-sm">
          + {{ t('admin.bookings.new') }}
        </NuxtLink>
      </div>

      <p v-if="!visible.length" class="rounded-2xl bg-white p-6 text-ink-700">{{ t('admin.bookings.empty') }}</p>
      <AdminBookingRow v-for="b in visible" :key="b.id" :booking="b" />

      <label v-if="hiddenCount > 0 || showInactive" class="flex items-center gap-2 text-sm text-ink-700">
        <input v-model="showInactive" type="checkbox" class="accent-ink-900">
        {{ t('admin.bookings.showInactive') }}<template v-if="!showInactive"> ({{ hiddenCount }})</template>
      </label>
    </section>
  </div>
</template>
