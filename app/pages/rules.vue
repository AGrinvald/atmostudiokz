<script setup lang="ts">
// TODO: render admin-editable text from settings (SPEC §6.1)
const { t } = useI18n()
useHead({ title: () => `${t('legal.rulesTitle')} — ATMO studio` })
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-12">
    <h1 class="mb-6 text-3xl font-bold">{{ t('legal.rulesTitle') }}</h1>
    <p>{{ t('legal.placeholder', { phone: '+7 777 609 03 17' }) }}</p>
  </div>
</template>
