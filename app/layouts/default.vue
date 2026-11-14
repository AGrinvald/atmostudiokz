<script setup lang="ts">
const { t } = useI18n()

const links = [
  { href: '#how', label: 'nav.how' },
  { href: '#light', label: 'nav.light' },
  { href: '#prices', label: 'nav.prices' },
  { href: '#contacts', label: 'nav.contacts' },
]
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="sticky top-0 z-10 border-b border-paper bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <NuxtLink to="/" aria-label="ATMO studio">
          <img src="/logo-dark.svg" alt="ATMO studio" class="h-8 w-auto">
        </NuxtLink>
        <nav class="hidden gap-6 text-sm md:flex">
          <a v-for="link in links" :key="link.href" :href="`/${link.href}`" class="hover:text-ink-700">
            {{ t(link.label) }}
          </a>
        </nav>
        <NuxtLink to="/book" class="btn btn-primary px-4 py-2 text-sm">
          {{ t('nav.book') }}
        </NuxtLink>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="bg-ink-900 text-paper">
      <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm md:flex-row md:justify-between">
        <img src="/logo-white.svg" alt="ATMO studio" class="h-6 w-auto self-start">
        <span>{{ t('contacts.address') }}</span>
        <a :href="`tel:${t('contacts.phone').replaceAll(' ', '')}`">{{ t('contacts.phone') }}</a>
      </div>
    </footer>
  </div>
</template>
