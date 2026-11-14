<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useI18n()
const route = useRoute()
const id = Number(route.params.id)

const { data: booking, error: loadError } = await useFetch(`/api/admin/bookings/${id}`, {
  key: `admin-booking-${id}`,
})
type Detail = NonNullable<typeof booking.value>
useHead({ title: () => `${booking.value?.number ?? ''} — ${t('admin.title')}` })

const ACTIVE = ['awaiting_payment', 'payment_claimed', 'confirmed']
const isActive = computed(() => !!booking.value && ACTIVE.includes(booking.value.status))
const canDecidePayment = computed(() => ['awaiting_payment', 'payment_claimed'].includes(booking.value?.status ?? ''))
const canHavePhotos = computed(() => ['confirmed', 'completed'].includes(booking.value?.status ?? ''))
const calculatedTotal = computed(() => (booking.value?.priceBreakdown as { total?: number } | undefined)?.total)

const { pending, error, run } = useAdminAction()
async function act(action: string, body?: Record<string, unknown>) {
  const updated = await run(() =>
    $fetch<Detail>(`/api/admin/bookings/${id}/${action}` as string, { method: 'POST', body }),
  )
  if (updated) booking.value = updated
  return updated
}

function cancel(refund: boolean) {
  if (!booking.value) return
  if (window.confirm(t('admin.booking.confirmCancel', { number: booking.value.number }))) act('cancel', { refund })
}

// Move
const moving = ref(false)
const moveDate = ref(booking.value?.date ?? studioToday())
const moveHour = ref<number | null>(null)
async function move() {
  if (moveHour.value == null) return
  if (await act('move', { date: moveDate.value, hour: moveHour.value })) moving.value = false
}

// Photos
const photosLink = ref(booking.value?.photosLink ?? '')
const copied = ref(false)
async function copyLink() {
  await navigator.clipboard.writeText(booking.value?.photosLink ?? '')
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
const whatsappUrl = computed(() => {
  const b = booking.value
  if (!b?.photosLink) return null
  const text = t('admin.booking.photosWhatsAppText', { name: b.client.name, link: b.photosLink })
  return `https://wa.me/${b.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink :to="booking ? `/admin?date=${booking.date}` : '/admin'" class="text-sm text-ink-700">
      {{ t('admin.booking.back') }}
    </NuxtLink>

    <p v-if="loadError || !booking" class="rounded-2xl bg-white p-6">{{ t('admin.errors.not_found') }}</p>

    <template v-else>
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-bold">{{ booking.number }}</h1>
        <AdminStatusBadge :status="booking.status" data-testid="admin-status" />
      </header>

      <p v-if="error" role="alert" class="font-medium text-red-700">{{ error }}</p>

      <!-- Actions -->
      <section v-if="canDecidePayment || isActive || booking.status === 'cancelled_refund_pending'" class="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 class="font-bold">{{ t('admin.booking.actions') }}</h2>
        <div class="flex flex-wrap gap-2">
          <template v-if="canDecidePayment">
            <button type="button" class="btn btn-primary px-4 py-2 text-sm" :disabled="pending" @click="act('confirm')">
              {{ t('admin.bookings.confirm') }}
            </button>
            <button type="button" class="btn btn-secondary px-4 py-2 text-sm" :disabled="pending" @click="act('reject')">
              {{ t('admin.bookings.reject') }}
            </button>
          </template>
          <template v-if="booking.status === 'cancelled_refund_pending'">
            <p class="w-full text-sm text-ink-700">{{ t('admin.booking.refundHint', { amount: formatKzt(booking.priceTotal) }) }}</p>
            <button type="button" class="btn btn-primary px-4 py-2 text-sm" :disabled="pending" @click="act('refunded')">
              {{ t('admin.bookings.refunded') }}
            </button>
          </template>
          <template v-if="isActive">
            <button type="button" class="rounded-full border-2 border-ink-900 px-4 py-2 text-sm font-semibold" @click="moving = !moving">
              {{ t('admin.booking.move') }}
            </button>
            <button type="button" class="rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" :disabled="pending" @click="cancel(true)">
              {{ t('admin.booking.cancelWithRefund') }}
            </button>
            <button type="button" class="rounded-full px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" :disabled="pending" @click="cancel(false)">
              {{ t('admin.booking.cancelNoRefund') }}
            </button>
          </template>
        </div>

        <form v-if="moving && isActive" class="flex flex-col gap-3 border-t border-ink-900/10 pt-4" @submit.prevent="move">
          <h3 class="font-semibold">{{ t('admin.booking.moveTo') }}</h3>
          <AdminSlotPicker v-model:date="moveDate" v-model:hour="moveHour" :exclude-booking-id="booking.id" />
          <button type="submit" class="btn btn-primary self-start px-4 py-2 text-sm" :disabled="pending || moveHour == null">
            {{ t('admin.booking.moveSubmit') }}
          </button>
        </form>
      </section>

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Details -->
        <section class="rounded-2xl bg-white p-5">
          <h2 class="mb-3 font-bold">{{ t('admin.booking.details') }}</h2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-ink-700">{{ t('admin.booking.when') }}</dt>
            <dd class="font-semibold">{{ formatStudioDate(booking.date) }}, {{ formatHour(booking.hour) }}</dd>
            <dt class="text-ink-700">{{ t('admin.booking.session') }}</dt>
            <dd>{{ t(`options.session.${booking.sessionType}`) }}</dd>
            <dt class="text-ink-700">{{ t('admin.booking.options') }}</dt>
            <dd>{{ t(`options.lighting.${booking.lighting}`) }} · {{ t(`options.background.${booking.background}`) }}</dd>
            <dt class="text-ink-700">{{ t('admin.booking.people') }}</dt>
            <dd>{{ booking.peopleCount }}</dd>
            <dt class="text-ink-700">{{ t('admin.booking.price') }}</dt>
            <dd>
              <span class="font-semibold">{{ formatKzt(booking.priceTotal) }}</span>
              <span v-if="calculatedTotal != null && calculatedTotal !== booking.priceTotal" class="text-ink-700">
                ({{ t('admin.booking.priceOverride', { amount: formatKzt(calculatedTotal) }) }})
              </span>
            </dd>
            <dt class="text-ink-700">{{ t('admin.booking.paymentMethod') }}</dt>
            <dd>{{ t(`admin.paymentMethod.${booking.paymentMethod}`) }}</dd>
            <dt class="text-ink-700">{{ t('admin.booking.source') }}</dt>
            <dd>{{ t(`admin.source.${booking.source}`) }}</dd>
            <template v-if="booking.status === 'awaiting_payment' && booking.paymentDeadline">
              <dt class="text-ink-700">{{ t('admin.booking.paymentDeadline') }}</dt>
              <dd>{{ formatStudioDateTime(booking.paymentDeadline) }}</dd>
            </template>
            <template v-if="booking.comment">
              <dt class="text-ink-700">{{ t('admin.booking.comment') }}</dt>
              <dd class="whitespace-pre-line">{{ booking.comment }}</dd>
            </template>
            <dt class="text-ink-700">{{ t('admin.booking.created') }}</dt>
            <dd>{{ formatStudioDateTime(booking.createdAt) }}</dd>
          </dl>
        </section>

        <!-- Client -->
        <section class="flex flex-col gap-2 rounded-2xl bg-white p-5 text-sm">
          <h2 class="mb-1 font-bold">{{ t('admin.booking.client') }}</h2>
          <p class="text-base font-semibold">{{ booking.client.name }}</p>
          <a :href="`tel:${booking.client.phone}`" class="underline">{{ formatPhone(booking.client.phone) }}</a>
          <p class="text-ink-700">
            {{ t('admin.booking.telegram') }}: {{ booking.client.hasTelegram ? t('admin.booking.yes') : t('admin.booking.no') }}
          </p>
          <NuxtLink :to="`/admin/clients/${booking.client.id}`" class="mt-2 underline">{{ t('admin.booking.openClient') }}</NuxtLink>
        </section>
      </div>

      <!-- Photos -->
      <section v-if="canHavePhotos" class="flex flex-col gap-3 rounded-2xl bg-white p-5">
        <h2 class="font-bold">{{ t('admin.booking.photos') }}</h2>
        <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="act('photos', { link: photosLink })">
          <input
            v-model="photosLink"
            type="url"
            name="photosLink"
            :placeholder="t('admin.booking.photosLink')"
            :aria-label="t('admin.booking.photosLink')"
            class="field flex-1"
          >
          <button type="submit" class="btn btn-secondary px-4 py-2 text-sm" :disabled="pending || !photosLink.trim()">
            {{ t('admin.booking.photosSave') }}
          </button>
        </form>
        <div v-if="booking.photosLink" class="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" class="rounded-full bg-paper px-4 py-2 font-semibold" @click="copyLink">
            {{ copied ? t('admin.booking.photosCopied') : t('admin.booking.photosCopy') }}
          </button>
          <a v-if="whatsappUrl" :href="whatsappUrl" target="_blank" rel="noopener" class="rounded-full bg-paper px-4 py-2 font-semibold">
            {{ t('admin.booking.photosWhatsApp') }}
          </a>
          <span v-if="booking.photosSentAt" class="text-ink-700">
            {{ t('admin.booking.photosSent', { time: formatStudioDateTime(booking.photosSentAt) }) }}
          </span>
          <button v-else type="button" class="rounded-full bg-sun px-4 py-2 font-semibold" :disabled="pending" @click="act('photos-sent')">
            {{ t('admin.booking.photosMarkSent') }}
          </button>
        </div>
        <p v-if="booking.client.hasTelegram" class="text-xs text-ink-700">{{ t('admin.booking.photosBotNote') }}</p>
      </section>

      <!-- History -->
      <section class="rounded-2xl bg-white p-5">
        <h2 class="mb-3 font-bold">{{ t('admin.booking.history') }}</h2>
        <ol class="flex flex-col gap-1 text-sm" data-testid="history">
          <li v-for="event in booking.events" :key="event.id" class="flex gap-3">
            <span class="w-28 shrink-0 text-ink-700">{{ formatStudioDateTime(event.createdAt) }}</span>
            <span>{{ t(`admin.event.${event.type}`) }} <span class="text-ink-700">· {{ t(`admin.actor.${event.actor}`) }}</span></span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
