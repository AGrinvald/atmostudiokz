<script setup lang="ts">
defineProps<{ pending: boolean; saved: boolean }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-3">
    <button type="submit" class="btn btn-secondary px-4 py-2 text-sm" :disabled="pending">{{ t('admin.settings.save') }}</button>
    <span v-if="saved" class="text-sm text-green-800" role="status">{{ t('admin.settings.saved') }}</span>
  </div>
</template>
