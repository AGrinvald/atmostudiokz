<script setup lang="ts">
import type { FetchError } from 'ofetch'
import { normalizePhone } from '#shared/booking/phone'
import { calculatePrice } from '#shared/booking/pricing'
import { BACKGROUNDS, LIGHTINGS, SESSION_TYPES, type Background, type Lighting, type SessionType } from '#shared/booking/settings'

const { t, te } = useI18n()
useHead({ title: () => `${t('book.title')} — ATMO studio` })

const STUDIO_PHONE = '+7 777 609 03 17'

const { data: config, error: configError } = await useFetch('/api/booking-config')
const {
  data: availability,
  error: availabilityError,
  refresh: refreshAvailability,
} = await useFetch('/api/availability', { query: { days: 31 } })

const form = reactive({
  date: null as string | null,
  hour: null as number | null,
  sessionType: null as SessionType | null,
  lighting: null as Lighting | null,
  background: 'white' as Background | null,
  peopleCount: 1,
  name: '',
  phone: '',
  comment: '',
  consentRules: false,
  consentPrivacy: false,
  website: '', // honeypot
})

// Days that have working hours; a day with no free hour is shown but disabled.
const days = computed(() =>
  (availability.value?.days ?? [])
    .filter(day => day.slots.length > 0)
    .map(day => ({ ...day, hasFree: day.slots.some(s => s.available) })),
)
const selectedDay = computed(() => days.value.find(d => d.date === form.date) ?? null)

// Preselect the first day with a free hour.
watch(
  days,
  list => {
    if (!form.date || !list.some(d => d.date === form.date && d.hasFree)) {
      form.date = list.find(d => d.hasFree)?.date ?? null
    }
  },
  { immediate: true },
)
watch(
  () => form.date,
  () => {
    if (!selectedDay.value?.slots.some(s => s.hour === form.hour && s.available)) form.hour = null
  },
)

const maxPeople = computed(() => config.value?.pricing.maxPeople ?? 1)
const price = computed(() =>
  config.value && form.sessionType
    ? calculatePrice(config.value.pricing, form.sessionType, form.peopleCount)
    : null,
)

function onPhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  form.phone = formatPhoneInput(input.value)
  input.value = form.phone
}

const submitting = ref(false)
const submitError = ref<string | null>(null)

function validate(): string | null {
  if (!form.date || form.hour == null) return t('book.validation.slot')
  if (!form.sessionType || !form.lighting || !form.background) return t('book.validation.slot')
  if (!form.name.trim()) return t('book.validation.name')
  if (!normalizePhone(form.phone)) return t('book.validation.phone')
  if (!form.consentRules || !form.consentPrivacy) return t('book.validation.consents')
  return null
}

async function submit() {
  submitError.value = validate()
  if (submitError.value) return
  submitting.value = true
  try {
    const booking = await $fetch('/api/bookings', {
      method: 'POST',
      body: {
        date: form.date!,
        hour: form.hour!,
        sessionType: form.sessionType!,
        lighting: form.lighting!,
        background: form.background!,
        peopleCount: form.peopleCount,
        name: form.name.trim(),
        phone: form.phone,
        comment: form.comment.trim() || null,
        consentRules: true as const,
        consentPrivacy: true as const,
        website: form.website,
      },
    })
    await navigateTo(`/booking/${booking.token}`)
  } catch (e) {
    const code = (e as FetchError).data?.data?.code as string | undefined
    submitError.value = t(code && te(`book.errors.${code}`) ? `book.errors.${code}` : 'book.errors.generic')
    if (code === 'slot_taken' || code === 'slot_unavailable') {
      form.hour = null
      await refreshAvailability()
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pb-40 pt-8">
    <h1 class="mb-8 text-3xl font-bold md:text-4xl">{{ t('book.title') }}</h1>

    <p v-if="configError || availabilityError" class="rounded-2xl bg-paper p-6">{{ t('book.loadError') }}</p>

    <p v-else-if="config && !config.paymentAvailable" class="rounded-2xl bg-paper p-6">
      {{ t('book.paymentUnavailable', { phone: STUDIO_PHONE }) }}
    </p>

    <form v-else-if="config" novalidate class="flex flex-col gap-10" @submit.prevent="submit">
      <!-- Date -->
      <fieldset>
        <legend class="mb-3 text-lg font-semibold">{{ t('book.date') }}</legend>
        <p v-if="days.length === 0" class="text-ink-700">{{ t('book.noDates') }}</p>
        <div v-else class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2" data-testid="dates">
          <ChoiceCard
            v-for="day in days"
            :key="day.date"
            v-model="form.date"
            name="date"
            :value="day.date"
            :disabled="!day.hasFree"
            class="w-16 shrink-0"
          >
            <span class="text-xs uppercase">{{ studioDateParts(day.date).weekday }}</span>
            <span class="text-xl font-bold leading-tight">{{ studioDateParts(day.date).day }}</span>
            <span class="text-xs">{{ studioDateParts(day.date).month }}</span>
          </ChoiceCard>
        </div>
      </fieldset>

      <!-- Time -->
      <fieldset>
        <legend class="mb-3 text-lg font-semibold">
          {{ t('book.time') }}
          <span v-if="form.date" class="font-normal text-ink-700">· {{ formatStudioDate(form.date) }}</span>
        </legend>
        <p v-if="!selectedDay" class="text-ink-700">{{ t('book.pickDateFirst') }}</p>
        <p v-else-if="!selectedDay.hasFree" class="text-ink-700">{{ t('book.noSlots') }}</p>
        <div v-else class="grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="hours">
          <ChoiceCard
            v-for="slot in selectedDay.slots"
            :key="slot.hour"
            v-model="form.hour"
            name="hour"
            :value="slot.hour"
            :disabled="!slot.available"
          >
            <span class="font-semibold">{{ formatHour(slot.hour) }}</span>
          </ChoiceCard>
        </div>
      </fieldset>

      <!-- Session -->
      <fieldset>
        <legend class="mb-1 text-lg font-semibold">{{ t('book.session') }}</legend>
        <p class="mb-3 text-sm text-ink-700">{{ t('book.sessionHint') }}</p>
        <div class="grid grid-cols-2 gap-3">
          <ChoiceCard v-for="type in SESSION_TYPES" :key="type" v-model="form.sessionType" name="sessionType" :value="type">
            <span class="text-lg font-semibold">{{ t(`options.session.${type}`) }}</span>
            <span class="text-sm">{{ formatKzt(config.pricing.basePrice[type]) }}</span>
          </ChoiceCard>
        </div>
      </fieldset>

      <!-- Lighting -->
      <fieldset>
        <legend class="mb-3 text-lg font-semibold">{{ t('book.lighting') }}</legend>
        <div class="grid grid-cols-2 gap-3">
          <ChoiceCard
            v-for="lighting in LIGHTINGS"
            :key="lighting"
            v-model="form.lighting"
            name="lighting"
            :value="lighting"
            :disabled="!config.options.lightings[lighting]"
          >
            <span class="font-semibold">{{ t(`options.lighting.${lighting}`) }}</span>
          </ChoiceCard>
        </div>
      </fieldset>

      <!-- Background -->
      <fieldset>
        <legend class="mb-3 text-lg font-semibold">{{ t('book.background') }}</legend>
        <div class="grid grid-cols-3 gap-3">
          <ChoiceCard
            v-for="background in BACKGROUNDS"
            :key="background"
            v-model="form.background"
            name="background"
            :value="background"
            :disabled="!config.options.backgrounds[background]"
          >
            <span class="font-semibold">{{ t(`options.background.${background}`) }}</span>
            <span v-if="!config.options.backgrounds[background]" class="text-xs">{{ t('options.soon') }}</span>
          </ChoiceCard>
        </div>
      </fieldset>

      <!-- People -->
      <fieldset>
        <legend class="mb-1 text-lg font-semibold">{{ t('book.people') }}</legend>
        <p class="mb-3 text-sm text-ink-700">
          {{
            t('book.peopleHint', {
              included: config.pricing.includedPeople,
              extra: formatKzt(config.pricing.extraPersonPrice),
            })
          }}
        </p>
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="btn btn-secondary size-12 p-0 text-2xl"
            :aria-label="t('book.peopleDecrease')"
            :disabled="form.peopleCount <= 1"
            @click="form.peopleCount--"
          >
            −
          </button>
          <output class="w-8 text-center text-2xl font-bold" data-testid="people">{{ form.peopleCount }}</output>
          <button
            type="button"
            class="btn btn-secondary size-12 p-0 text-2xl"
            :aria-label="t('book.peopleIncrease')"
            :disabled="form.peopleCount >= maxPeople"
            @click="form.peopleCount++"
          >
            +
          </button>
        </div>
      </fieldset>

      <!-- Contacts -->
      <fieldset class="flex flex-col gap-4">
        <legend class="mb-3 text-lg font-semibold">{{ t('book.contacts') }}</legend>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.name') }}</span>
          <input v-model="form.name" name="name" autocomplete="given-name" maxlength="100" class="field">
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.phone') }}</span>
          <input
            :value="form.phone"
            name="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+7 (___) ___-__-__"
            class="field"
            @input="onPhoneInput"
          >
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm">{{ t('book.comment') }}</span>
          <textarea
            v-model="form.comment"
            name="comment"
            rows="3"
            maxlength="1000"
            :placeholder="t('book.commentPlaceholder')"
            class="field"
          />
        </label>
        <!-- Honeypot: hidden from people, filled by bots -->
        <input v-model="form.website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden">
      </fieldset>

      <!-- Consents -->
      <div class="flex flex-col gap-3">
        <label class="flex items-start gap-3">
          <input v-model="form.consentRules" type="checkbox" name="consentRules" class="mt-1 size-5 accent-ink-900">
          <i18n-t keypath="book.consentRules" tag="span" scope="global">
            <template #link>
              <NuxtLink to="/rules" target="_blank" class="underline">{{ t('book.consentRulesLink') }}</NuxtLink>
            </template>
          </i18n-t>
        </label>
        <label class="flex items-start gap-3">
          <input v-model="form.consentPrivacy" type="checkbox" name="consentPrivacy" class="mt-1 size-5 accent-ink-900">
          <i18n-t keypath="book.consentPrivacy" tag="span" scope="global">
            <template #link>
              <NuxtLink to="/privacy" target="_blank" class="underline">{{ t('book.consentPrivacyLink') }}</NuxtLink>
            </template>
          </i18n-t>
        </label>
      </div>

      <!-- Sticky summary -->
      <div class="fixed inset-x-0 bottom-0 z-10 border-t border-ink-900/10 bg-white/95 backdrop-blur">
        <div class="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-3">
          <p v-if="submitError" role="alert" class="text-sm font-medium text-red-700" data-testid="submit-error">
            {{ submitError }}
          </p>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-xs text-ink-700">{{ t('book.total') }}</p>
              <p class="text-2xl font-bold" data-testid="total">{{ price ? formatKzt(price.total) : '—' }}</p>
              <p v-if="form.date && form.hour != null" class="text-xs text-ink-700">
                {{ formatStudioDate(form.date) }}, {{ formatHour(form.hour) }}
              </p>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? t('book.submitting') : t('book.submit') }}
            </button>
          </div>
          <p class="text-xs text-ink-700">{{ t('book.paymentNote', { minutes: config.rules.paymentWindowMinutes }) }}</p>
        </div>
      </div>
    </form>

    <p v-else class="text-ink-700">{{ t('book.loading') }}</p>
  </div>
</template>
