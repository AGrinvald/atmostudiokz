<script setup lang="ts">
const { t, tm, rt } = useI18n()

// TODO: load prices from settings API once it exists (SPEC §3.3)
const prices = [
  { label: 'prices.session30', amount: 12000 },
  { label: 'prices.session55', amount: 20000 },
]

const formatKzt = (n: number) => `${n.toLocaleString('ru-RU')} ₸`
</script>

<template>
  <div>
    <section class="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 md:py-32">
      <p class="text-sm uppercase tracking-widest text-ink-700">{{ t('hero.title') }}</p>
      <h1 class="text-5xl font-bold leading-tight md:text-7xl">{{ t('hero.tagline') }}</h1>
      <NuxtLink to="/book" class="btn btn-primary">{{ t('hero.cta') }}</NuxtLink>
    </section>

    <section id="how" class="bg-paper">
      <div class="mx-auto max-w-6xl px-4 py-16">
        <h2 class="mb-8 text-3xl font-bold">{{ t('how.title') }}</h2>
        <ol class="grid gap-6 md:grid-cols-4">
          <li v-for="(step, i) in tm('how.steps')" :key="i" class="rounded-2xl bg-white p-6">
            <span class="mb-3 flex size-8 items-center justify-center rounded-full bg-sun font-bold">{{ i + 1 }}</span>
            {{ rt(step) }}
          </li>
        </ol>
      </div>
    </section>

    <section id="light" class="mx-auto max-w-6xl px-4 py-16">
      <h2 class="mb-8 text-3xl font-bold">{{ t('light.title') }}</h2>
      <div class="grid gap-6 md:grid-cols-2">
        <!-- Placeholders until real photos are added -->
        <figure class="flex aspect-[4/5] items-end rounded-2xl bg-ink-800 p-6 text-white">
          {{ t('light.dark') }}
        </figure>
        <figure class="flex aspect-[4/5] items-end rounded-2xl bg-paper p-6">
          {{ t('light.bright') }}
        </figure>
      </div>
    </section>

    <section id="prices" class="bg-paper">
      <div class="mx-auto max-w-6xl px-4 py-16">
        <h2 class="mb-8 text-3xl font-bold">{{ t('prices.title') }}</h2>
        <div class="grid gap-6 md:grid-cols-2">
          <div v-for="p in prices" :key="p.label" class="rounded-2xl bg-white p-8">
            <p class="text-lg">{{ t(p.label) }}</p>
            <p class="mt-2 text-4xl font-bold">{{ formatKzt(p.amount) }}</p>
          </div>
        </div>
        <p class="mt-6 text-ink-700">{{ t('prices.people') }}</p>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-4 py-16">
      <h2 class="mb-4 text-3xl font-bold">{{ t('result.title') }}</h2>
      <p class="max-w-2xl text-lg">{{ t('result.text') }}</p>
    </section>

    <section id="contacts" class="bg-paper">
      <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-16">
        <h2 class="mb-4 text-3xl font-bold">{{ t('contacts.title') }}</h2>
        <p>{{ t('contacts.address') }}</p>
        <a :href="`tel:${t('contacts.phone').replaceAll(' ', '')}`" class="font-semibold">{{ t('contacts.phone') }}</a>
        <a href="https://www.instagram.com/atmo_studio_26/" target="_blank" rel="noopener" class="underline">
          {{ t('contacts.instagram') }}
        </a>
        <NuxtLink to="/book" class="btn btn-secondary mt-4 self-start">{{ t('nav.book') }}</NuxtLink>
      </div>
    </section>
  </div>
</template>
