<script setup lang="ts">
defineProps<{
  booking: {
    id: number
    number: string
    status: string
    date: string
    hour: number
    sessionType: string
    peopleCount: number
    priceTotal: number
    source: string
    client: { name: string; phone: string }
  }
  showDate?: boolean
}>()
const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center">
    <NuxtLink :to="`/admin/bookings/${booking.id}`" class="flex flex-1 items-start gap-4" data-testid="booking-row">
      <div class="w-16 shrink-0 text-center">
        <p class="text-xl font-bold">{{ formatHour(booking.hour) }}</p>
        <p v-if="showDate" class="text-xs text-ink-700">{{ formatStudioDate(booking.date) }}</p>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">{{ booking.client.name }}</span>
          <AdminStatusBadge :status="booking.status" />
        </div>
        <p class="text-sm text-ink-700">
          {{ booking.number }} · {{ t(`options.session.${booking.sessionType}`) }} ·
          {{ t('admin.bookings.people', { n: booking.peopleCount }) }} · {{ formatKzt(booking.priceTotal) }} ·
          {{ t(`admin.source.${booking.source}`) }}
        </p>
        <p class="text-sm text-ink-700">{{ formatPhone(booking.client.phone) }}</p>
      </div>
    </NuxtLink>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2 sm:justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>
