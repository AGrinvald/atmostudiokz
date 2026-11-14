// Registers the production webhook with Telegram (SPEC §2).
//
//   npm run bot:webhook
//
// Uses NUXT_PUBLIC_SITE_URL (must be https), NUXT_TELEGRAM_BOT_TOKEN and NUXT_TELEGRAM_WEBHOOK_SECRET.

import { Api } from 'grammy'

const token = process.env.NUXT_TELEGRAM_BOT_TOKEN
const secret = process.env.NUXT_TELEGRAM_WEBHOOK_SECRET
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL
if (!token || !secret || !siteUrl?.startsWith('https://')) {
  throw new Error('Set NUXT_TELEGRAM_BOT_TOKEN, NUXT_TELEGRAM_WEBHOOK_SECRET and an https NUXT_PUBLIC_SITE_URL')
}
if (!/^[\w-]{16,256}$/.test(secret)) {
  throw new Error('NUXT_TELEGRAM_WEBHOOK_SECRET must be 16–256 characters of A–Z, a–z, 0–9, _ or -')
}

const api = new Api(token)
const url = `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook/${secret}`
await api.setWebhook(url, { secret_token: secret, allowed_updates: ['message', 'callback_query'] })
await api.setMyCommands([
  { command: 'book', description: 'Записаться' },
  { command: 'my', description: 'Мои записи' },
  { command: 'about', description: 'О студии' },
])
const info = await api.getWebhookInfo()
console.log(`Webhook set: ${(info.url ?? '').replace(secret, '***')}`)
