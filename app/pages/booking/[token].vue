<script setup lang="ts">
import type { FetchError } from 'ofetch'

const { t, te } = useI18n()
const route = useRoute()
const token = route.params.token as string

const STUDIO_PHONE = '+7 777 609 03 17'
const STUDIO_ADDRESS = 'Алматы, ул. Алатау 36, блок 1'
const CHECK_INTERVAL_MS = 15_000

const { data: booking, error, refresh } = await useFetch(`/api/bookings/${encodeURIComponent(token)}`, {
  key: `booking-${token}`,
})
const { data: config } = await useFetch('/api/booking-config')

useHead({ title: () => (booking.value ? `${t('booking.title', { number: booking.value.number })} — ATMO studio` : 'ATMO studio') })

const isActive = computed(() =>
  ['awaiting_payment', 'payment_claimed', 'confirmed'].includes(booking.value?.status ?? ''),
)

// Countdown to the payment deadline; refreshes the booking when it runs out.
const now = ref(Date.now())
const secondsLeft = computed(() => {
  const deadline = booking.value?.paymentDeadline
  return deadline ? Math.max(0, Math.floor((Date.parse(deadline) - now.value) / 1000)) : 0
})
const timeLeft = computed(() => {
  const m = Math.floor(secondsLeft.value / 60)
  const s = secondsLeft.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

let tick: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
    if (booking.value?.status === 'awaiting_payment' && secondsLeft.value === 0) refresh()
  }, 1000)
  // While the admin checks the payment, pick up their decision without a reload.
  poll = setInterval(() => {
    if (booking.value?.status === 'payment_claimed') refresh()
  }, CHECK_INTERVAL_MS)
})
onBeforeUnmount(() => {
  clearInterval(tick)
  clearInterval(poll)
})

const busy = ref(false)
const actionError = ref<string | null>(null)

async function act(action: 'claim-payment' | 'cancel') {
  busy.value = true
  actionError.value = null
  try {
    const url: string = `/api/bookings/${encodeURIComponent(token)}/${action}`
    booking.value = await $fetch<NonNullable<typeof booking.value>>(url, { method: 'POST' })
  } catch (e) {
    const code = (e as FetchError).data?.data?.code as string | undefined
    actionError.value = t(code && te(`booking.errors.${code}`) ? `booking.errors.${code}` : 'booking.errors.generic')
    await refresh()
  } finally {
    busy.value = false
  }
}

function cancel() {
  if (!booking.value) return
  if (window.confirm(t('booking.cancel.confirm', { number: booking.value.number }))) act('cancel')
}

const statusTone: Record<string, string> = {
  awaiting_payment: 'bg-sun',
  payment_claimed: 'bg-sun-light',
  confirmed: 'bg-green-200',
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <div v-if="error || !booking" class="flex flex-col items-start gap-4">
      <h1 class="text-3xl font-bold">{{ t('booking.notFound') }}</h1>
      <NuxtLink to="/book" class="btn btn-primary">{{ t('nav.book') }}</NuxtLink>
    </div>

    <div v-else class="flex flex-col gap-8">
      <header class="flex flex-col gap-3">
        <h1 class="text-3xl font-bold md:text-4xl">{{ t('booking.title', { number: booking.number }) }}</h1>
        <p
          class="self-start rounded-full px-4 py-1 text-sm font-semibold"
          :class="statusTone[booking.status] ?? 'bg-paper'"
          data-testid="status"
        >
          {{ t(`booking.status.${booking.status}`) }}
        </p>
        <p class="text-ink-700">
          {{ t(`booking.statusText.${booking.status}`, { address: STUDIO_ADDRESS, phone: STUDIO_PHONE }) }}
        </p>
      </header>

      <!-- Payment -->
      <section v-if="booking.canClaimPayment && booking.payment" class="flex flex-col gap-4 rounded-2xl bg-paper p-6">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="text-xl font-bold">{{ t('booking.pay.title') }}</h2>
          <p class="text-sm font-semibold" data-testid="time-left">{{ t('booking.pay.timeLeft', { time: timeLeft }) }}</p>
        </div>
        <p>
          {{ t('booking.pay.amount') }}: <strong class="text-2xl">{{ formatKzt(booking.priceTotal) }}</strong>
        </p>
        <ol class="list-decimal space-y-1 pl-5">
          <li>{{ t('booking.pay.step1') }}</li>
          <li>{{ t('booking.pay.step2', { amount: formatKzt(booking.priceTotal) }) }}</li>
          <li>
            <i18n-t keypath="booking.pay.step3" scope="global">
              <template #number><strong>{{ booking.number }}</strong></template>
            </i18n-t>
          </li>
          <li>{{ t('booking.pay.step4') }}</li>
        </ol>
        <img
          v-if="booking.payment.kaspiQrUrl"
          :src="booking.payment.kaspiQrUrl"
          :alt="t('booking.pay.qrAlt')"
          class="size-48 self-center rounded-xl bg-white p-2"
        >
        <div class="flex flex-col gap-3 sm:flex-row">
          <a
            v-if="booking.payment.kaspiLink"
            :href="booking.payment.kaspiLink"
            target="_blank"
            rel="noopener"
            class="btn btn-secondary"
          >
            {{ t('booking.pay.link') }}
          </a>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="act('claim-payment')">
            {{ busy ? t('booking.pay.claiming') : t('booking.pay.claim') }}
          </button>
        </div>
        <p class="text-xs text-ink-700">
          {{ t('booking.pay.deadline', { time: formatStudioTime(booking.paymentDeadline!) }) }}
        </p>
      </section>

      <p v-if="actionError" role="alert" class="font-medium text-red-700">{{ actionError }}</p>

      <!-- Details -->
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-2xl border-2 border-ink-900/10 p-6">
        <dt class="text-ink-700">{{ t('booking.details.when') }}</dt>
        <dd class="font-semibold">{{ formatStudioDate(booking.date) }}, {{ formatHour(booking.hour) }}</dd>
        <dt class="text-ink-700">{{ t('booking.details.session') }}</dt>
        <dd>{{ t(`options.session.${booking.sessionType}`) }}</dd>
        <dt class="text-ink-700">{{ t('booking.details.options') }}</dt>
        <dd>
          {{ t(`options.lighting.${booking.lighting}`) }} · {{ t(`options.background.${booking.background}`) }}
        </dd>
        <dt class="text-ink-700">{{ t('booking.details.people') }}</dt>
        <dd>{{ booking.peopleCount }}</dd>
        <dt class="text-ink-700">{{ t('booking.details.total') }}</dt>
        <dd class="font-semibold">{{ formatKzt(booking.priceTotal) }}</dd>
      </dl>

      <!-- Cancel -->
      <div v-if="isActive" class="flex flex-col items-start gap-2">
        <button v-if="booking.canCancel" type="button" class="underline" :disabled="busy" @click="cancel">
          {{ t('booking.cancel.button') }}
        </button>
        <p v-else class="text-sm text-ink-700">
          {{ t('booking.cancel.cutoff', { hours: config?.rules.cancelCutoffHours ?? 72, phone: STUDIO_PHONE }) }}
        </p>
      </div>
      <NuxtLink v-else to="/book" class="btn btn-primary self-start">{{ t('booking.bookAgain') }}</NuxtLink>

      <p v-if="isActive" class="text-sm text-ink-700">{{ t('booking.bookmark') }}</p>
    </div>
  </div>
</template>
