<script setup lang="ts">
import { calculatePrice } from '#shared/booking/pricing'
import { BACKGROUNDS, LIGHTINGS, SESSION_TYPES, type Background, type Lighting, type SessionType } from '#shared/booking/settings'

definePageMeta({ layout: 'admin' })
const { t } = useI18n()
useHead({ title: () => `${t('admin.newBooking.title')} — ${t('admin.title')}` })

const route = useRoute()
const { data: config } = await useFetch('/api/booking-config')

const PAYMENT_METHODS = ['cash', 'kaspi', 'on_site'] as const
const form = reactive({
  date: typeof route.query.date === 'string' ? route.query.date : studioToday(),
  hour: null as number | null,
  sessionType: '55' as SessionType,
  lighting: 'dark' as Lighting,
  background: 'white' as Background,
  peopleCount: 1,
  name: '',
  phone: '',
  comment: '',
  paymentMethod: 'cash' as (typeof PAYMENT_METHODS)[number],
  priceOverride: '' as string | number,
})

const price = computed(() =>
  config.value ? calculatePrice(config.value.pricing, form.sessionType, form.peopleCount) : null,
)

function onPhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  form.phone = formatPhoneInput(input.value)
  input.value = form.phone
}

const { pending, error, run } = useAdminAction()
async function submit() {
  if (form.hour == null) return
  const created = await run(() =>
    $fetch<{ id: number }>('/api/admin/bookings', {
      method: 'POST',
      body: {
        date: form.date,
        hour: form.hour!,
        sessionType: form.sessionType,
        lighting: form.lighting,
        background: form.background,
        peopleCount: form.peopleCount,
        name: form.name.trim(),
        phone: form.phone,
        comment: form.comment.trim() || null,
        paymentMethod: form.paymentMethod,
        priceOverride: form.priceOverride === '' ? null : Number(form.priceOverride),
      },
    }),
  )
  if (created) await navigateTo(`/admin/bookings/${created.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink :to="`/admin?date=${form.date}`" class="text-sm text-ink-700">{{ t('admin.booking.back') }}</NuxtLink>
    <header>
      <h1 class="text-2xl font-bold">{{ t('admin.newBooking.title') }}</h1>
      <p class="text-sm text-ink-700">{{ t('admin.newBooking.hint') }}</p>
    </header>

    <form v-if="config" class="flex flex-col gap-6 rounded-2xl bg-white p-5" @submit.prevent="submit">
      <AdminSlotPicker v-model:date="form.date" v-model:hour="form.hour" />

      <fieldset>
        <legend class="mb-1 text-sm">{{ t('book.session') }}</legend>
        <div class="grid grid-cols-2 gap-2">
          <ChoiceCard v-for="type in SESSION_TYPES" :key="type" v-model="form.sessionType" name="sessionType" :value="type">
            {{ t(`options.session.${type}`) }}
          </ChoiceCard>
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend class="mb-1 text-sm">{{ t('book.lighting') }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <ChoiceCard
              v-for="l in LIGHTINGS"
              :key="l"
              v-model="form.lighting"
              name="lighting"
              :value="l"
              :disabled="!config.options.lightings[l]"
            >
              {{ t(`options.lighting.${l}`) }}
            </ChoiceCard>
          </div>
        </fieldset>
        <fieldset>
          <legend class="mb-1 text-sm">{{ t('book.background') }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <ChoiceCard
              v-for="b in BACKGROUNDS"
              :key="b"
              v-model="form.background"
              name="background"
              :value="b"
              :disabled="!config.options.backgrounds[b]"
            >
              {{ t(`options.background.${b}`) }}
            </ChoiceCard>
          </div>
        </fieldset>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.people') }}</span>
          <input v-model.number="form.peopleCount" type="number" min="1" :max="config.pricing.maxPeople" required class="field">
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.name') }}</span>
          <input v-model="form.name" name="name" required maxlength="100" class="field">
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.phone') }}</span>
          <input :value="form.phone" name="phone" type="tel" required placeholder="+7 (___) ___-__-__" class="field" @input="onPhoneInput">
        </label>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-sm">{{ t('book.comment') }}</span>
        <textarea v-model="form.comment" rows="2" maxlength="1000" class="field" />
      </label>

      <div class="grid gap-4 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('admin.newBooking.paymentMethod') }}</span>
          <select v-model="form.paymentMethod" name="paymentMethod" class="field">
            <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">{{ t(`admin.paymentMethod.${m}`) }}</option>
          </select>
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-sm">{{ t('admin.newBooking.price') }}</span>
          <p class="py-3 text-xl font-bold">{{ price ? formatKzt(price.total) : '—' }}</p>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('admin.newBooking.priceOverride') }}</span>
          <input v-model="form.priceOverride" type="number" min="0" step="500" class="field">
        </label>
      </div>

      <p v-if="error" role="alert" class="font-medium text-red-700">{{ error }}</p>
      <button type="submit" class="btn btn-primary self-start" :disabled="pending || form.hour == null">
        {{ t('admin.newBooking.submit') }}
      </button>
    </form>
  </div>
</template>
