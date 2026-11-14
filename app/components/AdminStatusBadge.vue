<script setup lang="ts">
defineProps<{ status: string }>()
const { t } = useI18n()

const TONE: Record<string, string> = {
  awaiting_payment: 'bg-sun-light text-ink-900',
  payment_claimed: 'bg-sun text-ink-900 ring-2 ring-ink-900',
  confirmed: 'bg-green-200 text-green-950',
  completed: 'bg-green-50 text-green-900',
  cancelled_refund_pending: 'bg-red-200 text-red-950 ring-2 ring-red-900',
  refunded: 'bg-ink-900/10 text-ink-700',
  expired: 'bg-ink-900/10 text-ink-700',
  rejected: 'bg-ink-900/10 text-ink-700',
  cancelled: 'bg-ink-900/10 text-ink-700',
}
</script>

<template>
  <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap" :class="TONE[status]">
    {{ t(`admin.status.${status}`) }}
  </span>
</template>
