<script setup lang="ts">
import { BACKGROUNDS, LIGHTINGS, type BookingSettings, type BookingSettingsKey } from '#shared/booking/settings'

definePageMeta({ layout: 'admin' })
const { t, tm, rt } = useI18n()
useHead({ title: () => `${t('admin.settings.title')} — ${t('admin.title')}` })

const { data, refresh } = await useFetch('/api/admin/settings')
const weekdays = computed(() => (tm('admin.weekday') as unknown[]).map(w => rt(w as never)))

// Editable copies, re-synced whenever the server data changes.
const s = reactive(structuredClone(toRaw(data.value!.settings)) as BookingSettings)
const weekly = ref(structuredClone(toRaw(data.value!.weekly)))
watch(data, d => {
  if (!d) return
  Object.assign(s, structuredClone(toRaw(d.settings)))
  weekly.value = structuredClone(toRaw(d.weekly))
})

const savedSection = ref<string | null>(null)
const { pending, error, run } = useAdminAction()
function flashSaved(section: string) {
  savedSection.value = section
  setTimeout(() => savedSection.value === section && (savedSection.value = null), 2000)
}

async function saveSetting<K extends BookingSettingsKey>(key: K) {
  const ok = await run(() => $fetch<unknown>(`/api/admin/settings/${key}` as string, { method: 'PUT', body: s[key] }))
  if (ok) {
    await refresh()
    flashSaved(key)
  }
}

async function saveWeekly() {
  const ok = await run(() => $fetch<unknown>('/api/admin/schedule/weekly', { method: 'PUT', body: weekly.value }))
  if (ok) {
    await refresh()
    flashSaved('weekly')
  }
}

// Kaspi QR upload, stored as a data URL in settings
const qrError = ref<string | null>(null)
const MAX_QR_BYTES = 300 * 1024
function onQrSelected(event: Event) {
  qrError.value = null
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > MAX_QR_BYTES) {
    qrError.value = t('admin.settings.payment.tooLarge')
    return
  }
  const reader = new FileReader()
  reader.onload = () => (s.payment.kaspiQrUrl = reader.result as string)
  reader.readAsDataURL(file)
}
function onKaspiLinkInput(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  s.payment.kaspiLink = value || null
}

// Exceptions
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const newException = reactive({ date: studioToday(), allDay: true, blockedHours: [] as number[], note: '' })
async function addException() {
  const ok = await run(() =>
    $fetch<unknown>('/api/admin/schedule/exceptions', {
      method: 'POST',
      body: { ...newException, blockedHours: newException.allDay ? null : newException.blockedHours },
    }),
  )
  if (ok) {
    Object.assign(newException, { allDay: true, blockedHours: [], note: '' })
    await refresh()
  }
}
async function deleteException(id: number) {
  if (await run(() => $fetch<unknown>(`/api/admin/schedule/exceptions/${id}` as string, { method: 'DELETE' }))) await refresh()
}
function toggleHour(h: number) {
  const i = newException.blockedHours.indexOf(h)
  if (i >= 0) newException.blockedHours.splice(i, 1)
  else newException.blockedHours.push(h)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-bold">{{ t('admin.settings.title') }}</h1>
    <p v-if="error" role="alert" class="sticky top-16 z-10 rounded-xl bg-red-50 p-3 font-medium text-red-700">{{ error }}</p>

    <!-- Pricing -->
    <form class="settings-card" data-testid="pricing" @submit.prevent="saveSetting('pricing')">
      <h2>{{ t('admin.settings.pricing.title') }}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <label><span>{{ t('admin.settings.pricing.base30') }}</span><input v-model.number="s.pricing.basePrice['30']" name="base30" type="number" min="0" step="500" class="field"></label>
        <label><span>{{ t('admin.settings.pricing.base55') }}</span><input v-model.number="s.pricing.basePrice['55']" name="base55" type="number" min="0" step="500" class="field"></label>
        <label><span>{{ t('admin.settings.pricing.extraPersonPrice') }}</span><input v-model.number="s.pricing.extraPersonPrice" type="number" min="0" step="100" class="field"></label>
        <label><span>{{ t('admin.settings.pricing.includedPeople') }}</span><input v-model.number="s.pricing.includedPeople" type="number" min="1" class="field"></label>
        <label><span>{{ t('admin.settings.pricing.maxPeople') }}</span><input v-model.number="s.pricing.maxPeople" type="number" min="1" class="field"></label>
      </div>
      <SettingsSave :pending="pending" :saved="savedSection === 'pricing'" />
    </form>

    <!-- Options -->
    <form class="settings-card" data-testid="options" @submit.prevent="saveSetting('options')">
      <h2>{{ t('admin.settings.options.title') }}</h2>
      <p class="text-sm text-ink-700">{{ t('admin.settings.options.hint') }}</p>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <label v-for="l in LIGHTINGS" :key="l" class="!flex-row items-center gap-2">
          <input v-model="s.options.lightings[l]" type="checkbox" class="size-5 accent-ink-900">
          <span>{{ t('book.lighting') }}: {{ t(`options.lighting.${l}`) }}</span>
        </label>
        <label v-for="b in BACKGROUNDS" :key="b" class="!flex-row items-center gap-2">
          <input v-model="s.options.backgrounds[b]" type="checkbox" :name="`background-${b}`" class="size-5 accent-ink-900">
          <span>{{ t('book.background') }}: {{ t(`options.background.${b}`) }}</span>
        </label>
      </div>
      <SettingsSave :pending="pending" :saved="savedSection === 'options'" />
    </form>

    <!-- Kaspi -->
    <form class="settings-card" data-testid="payment" @submit.prevent="saveSetting('payment')">
      <h2>{{ t('admin.settings.payment.title') }}</h2>
      <p v-if="!data?.settings.payment.kaspiLink" class="text-sm font-medium text-red-700">{{ t('admin.settings.payment.unavailable') }}</p>
      <label>
        <span>{{ t('admin.settings.payment.link') }}</span>
        <input :value="s.payment.kaspiLink ?? ''" name="kaspiLink" type="url" placeholder="https://pay.kaspi.kz/…" class="field" @input="onKaspiLinkInput">
      </label>
      <div class="flex flex-col gap-2">
        <span class="text-sm">{{ t('admin.settings.payment.qr') }}</span>
        <img v-if="s.payment.kaspiQrUrl" :src="s.payment.kaspiQrUrl" alt="QR" class="size-40 rounded-xl border border-ink-900/10 bg-white object-contain p-2">
        <div class="flex flex-wrap gap-2">
          <label class="!flex-row cursor-pointer rounded-full bg-paper px-4 py-2 text-sm font-semibold">
            {{ t('admin.settings.payment.upload') }}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" @change="onQrSelected">
          </label>
          <button v-if="s.payment.kaspiQrUrl" type="button" class="rounded-full px-4 py-2 text-sm font-semibold text-red-700" @click="s.payment.kaspiQrUrl = null">
            {{ t('admin.settings.payment.remove') }}
          </button>
        </div>
        <p v-if="qrError" class="text-sm text-red-700">{{ qrError }}</p>
      </div>
      <SettingsSave :pending="pending" :saved="savedSection === 'payment'" />
    </form>

    <!-- Weekly hours -->
    <form class="settings-card" data-testid="weekly" @submit.prevent="saveWeekly">
      <h2>{{ t('admin.settings.weekly.title') }}</h2>
      <div class="grid grid-cols-[3rem_auto_1fr_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <span />
        <span class="text-ink-700">{{ t('admin.settings.weekly.open') }}</span>
        <span class="text-ink-700">{{ t('admin.settings.weekly.from') }}</span>
        <span class="text-ink-700">{{ t('admin.settings.weekly.to') }}</span>
        <template v-for="day in weekly" :key="day.weekday">
          <span class="font-semibold">{{ weekdays[day.weekday] }}</span>
          <input v-model="day.isOpen" type="checkbox" class="size-5 accent-ink-900">
          <select v-model.number="day.firstSlotHour" :disabled="!day.isOpen" class="field py-2">
            <option v-for="h in HOURS" :key="h" :value="h">{{ formatHour(h) }}</option>
          </select>
          <select v-model.number="day.lastSlotHour" :disabled="!day.isOpen" class="field py-2">
            <option v-for="h in HOURS" :key="h" :value="h">{{ formatHour(h) }}</option>
          </select>
        </template>
      </div>
      <SettingsSave :pending="pending" :saved="savedSection === 'weekly'" />
    </form>

    <!-- Exceptions -->
    <section class="settings-card" data-testid="exceptions">
      <h2>{{ t('admin.settings.exceptions.title') }}</h2>
      <p v-if="!data?.exceptions.length" class="text-sm text-ink-700">{{ t('admin.settings.exceptions.empty') }}</p>
      <ul v-else class="flex flex-col gap-2 text-sm">
        <li v-for="ex in data.exceptions" :key="ex.id" class="flex items-center gap-3 rounded-xl bg-paper px-3 py-2">
          <span class="font-semibold">{{ formatStudioDate(ex.date) }}</span>
          <span>{{ ex.allDay ? t('admin.settings.exceptions.closed') : (ex.blockedHours ?? []).map(formatHour).join(', ') }}</span>
          <span v-if="ex.note" class="text-ink-700">· {{ ex.note }}</span>
          <button type="button" class="ml-auto text-red-700" @click="deleteException(ex.id)">{{ t('admin.settings.exceptions.delete') }}</button>
        </li>
      </ul>
      <form class="flex flex-col gap-3 border-t border-ink-900/10 pt-4" @submit.prevent="addException">
        <div class="grid gap-3 sm:grid-cols-3">
          <label><span>{{ t('admin.settings.exceptions.date') }}</span><input v-model="newException.date" name="exceptionDate" type="date" required class="field"></label>
          <label class="!flex-row items-center gap-2 sm:pt-6">
            <input v-model="newException.allDay" name="exceptionAllDay" type="checkbox" class="size-5 accent-ink-900">
            <span>{{ t('admin.settings.exceptions.allDay') }}</span>
          </label>
          <label><span>{{ t('admin.settings.exceptions.note') }}</span><input v-model="newException.note" maxlength="500" class="field"></label>
        </div>
        <div v-if="!newException.allDay" class="flex flex-wrap gap-1">
          <button
            v-for="h in HOURS.slice(8)"
            :key="h"
            type="button"
            class="rounded-lg px-2 py-1 text-sm"
            :class="newException.blockedHours.includes(h) ? 'bg-ink-900 text-white' : 'bg-paper'"
            :aria-pressed="newException.blockedHours.includes(h)"
            @click="toggleHour(h)"
          >
            {{ formatHour(h) }}
          </button>
        </div>
        <button type="submit" class="btn btn-secondary self-start px-4 py-2 text-sm" :disabled="pending">
          {{ t('admin.settings.exceptions.add') }}
        </button>
      </form>
    </section>

    <!-- Booking rules -->
    <form class="settings-card" data-testid="rules" @submit.prevent="saveSetting('rules')">
      <h2>{{ t('admin.settings.rules.title') }}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <label v-for="key in (['minLeadHours', 'horizonDays', 'paymentWindowMinutes', 'cancelCutoffHours', 'reminderHours'] as const)" :key="key">
          <span>{{ t(`admin.settings.rules.${key}`) }}</span>
          <input v-model.number="s.rules[key]" type="number" min="0" class="field">
        </label>
      </div>
      <SettingsSave :pending="pending" :saved="savedSection === 'rules'" />
    </form>

    <!-- Legal texts -->
    <form class="settings-card" data-testid="legal" @submit.prevent="saveSetting('legal')">
      <h2>{{ t('admin.settings.legal.title') }}</h2>
      <label><span>{{ t('admin.settings.legal.rules') }}</span><textarea v-model="s.legal.rules" rows="8" class="field" /></label>
      <label><span>{{ t('admin.settings.legal.privacy') }}</span><textarea v-model="s.legal.privacy" rows="8" class="field" /></label>
      <SettingsSave :pending="pending" :saved="savedSection === 'legal'" />
    </form>
  </div>
</template>

<style scoped>
@reference "~/assets/css/main.css";

.settings-card {
  @apply flex flex-col gap-4 rounded-2xl bg-white p-5;
}
.settings-card h2 {
  @apply text-lg font-bold;
}
.settings-card label {
  @apply flex flex-col gap-1;
}
.settings-card label > span {
  @apply text-sm;
}
</style>
