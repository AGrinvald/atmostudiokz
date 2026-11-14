import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/i18n', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'ATMO studio — студия автопортрета в Алматы',
      meta: [
        { name: 'description', content: 'Студия автопортрета. Ты, свет и камера. Алматы, ул. Алатау 36.' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/logo-dark.svg' }],
    },
  },

  i18n: {
    defaultLocale: 'ru',
    strategy: 'no_prefix',
    locales: [{ code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json' }],
  },

  nitro: {
    experimental: { tasks: true },
    // Expiry also runs lazily before each booking, so a missed tick never blocks a slot.
    scheduledTasks: {
      '* * * * *': ['bookings:expire'],
      '*/10 * * * *': ['bookings:complete', 'bookings:remind'],
    },
  },

  // DATABASE_URL is read directly from process.env (shared with drizzle-kit).
  runtimeConfig: {
    telegramBotToken: '',
    telegramWebhookSecret: '',
    adminChatLinkSecret: '',
    public: {
      siteUrl: 'http://localhost:3000',
      timezone: 'Asia/Almaty',
    },
  },
})
