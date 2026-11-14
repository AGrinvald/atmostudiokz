<script setup lang="ts">
// Date + hour picker for admin bookings. Admins may use any hour; occupied ones are disabled.
const props = defineProps<{ excludeBookingId?: number }>()
const date = defineModel<string>('date', { required: true })
const hour = defineModel<number | null>('hour', { required: true })
const { t } = useI18n()

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8) // 08:00–23:00
const ACTIVE = ['awaiting_payment', 'payment_claimed', 'confirmed']

const { data: dayBookings } = await useFetch('/api/admin/bookings', {
  query: { from: date, days: 1 },
  key: computed(() => `slot-picker-${date.value}`),
})
const busy = computed(
  () =>
    new Set(
      (dayBookings.value ?? [])
        .filter(b => ACTIVE.includes(b.status) && b.id !== props.excludeBookingId)
        .map(b => b.hour),
    ),
)
watch(busy, set => {
  if (hour.value != null && set.has(hour.value)) hour.value = null
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-sm">{{ t('admin.newBooking.date') }}</span>
      <input v-model="date" type="date" required class="field">
    </label>
    <fieldset>
      <legend class="mb-1 text-sm">{{ t('admin.newBooking.hour') }}</legend>
      <div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
        <ChoiceCard
          v-for="h in HOURS"
          :key="h"
          v-model="hour"
          name="admin-hour"
          :value="h"
          :disabled="busy.has(h)"
        >
          <span class="text-sm font-semibold">{{ formatHour(h) }}</span>
          <span v-if="busy.has(h)" class="text-[10px]">{{ t('admin.newBooking.busy') }}</span>
        </ChoiceCard>
      </div>
    </fieldset>
  </div>
</template>
