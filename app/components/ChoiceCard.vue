<script setup lang="ts" generic="T extends string | number">
// A radio input styled as a selectable card. Group cards by giving them the same `name`.
const model = defineModel<T | null>()
defineProps<{ value: T; name: string; disabled?: boolean }>()
</script>

<template>
  <!-- `relative` keeps the visually-hidden input inside the card, so scrolling rows don't widen the page -->
  <label class="relative block" :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'">
    <input v-model="model" type="radio" :name="name" :value="value" :disabled="disabled" class="peer sr-only">
    <span
      class="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-ink-900/10 bg-white px-3 py-3 text-center transition-colors hover:border-ink-900/40 peer-checked:border-ink-900 peer-checked:bg-sun peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink-900 peer-disabled:border-transparent peer-disabled:bg-paper peer-disabled:text-ink-900/35"
    >
      <slot />
    </span>
  </label>
</template>
