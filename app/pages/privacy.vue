<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => `${t('legal.privacyTitle')} — ATMO studio` })
const { data: legal } = await useFetch('/api/legal')
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12">
    <h1 class="mb-6 text-3xl font-bold">{{ t('legal.privacyTitle') }}</h1>
    <p v-if="legal?.privacy" class="whitespace-pre-line">{{ legal.privacy }}</p>
    <p v-else>{{ t('legal.placeholder', { phone: '+7 777 609 03 17' }) }}</p>
  </div>
</template>
