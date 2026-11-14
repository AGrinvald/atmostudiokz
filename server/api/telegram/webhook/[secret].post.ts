import type { Update } from 'grammy/types'

/**
 * Telegram webhook (SPEC §2, §11): protected by a secret path segment and the
 * X-Telegram-Bot-Api-Secret-Token header. Register it with `npm run bot:webhook`.
 */
export default defineEventHandler(async event => {
  const { telegramWebhookSecret: secret } = useRuntimeConfig()
  const telegram = useTelegram()
  if (!telegram || !secret || getRouterParam(event, 'secret') !== secret) throw createError({ statusCode: 404 })
  if (getHeader(event, 'x-telegram-bot-api-secret-token') !== secret) throw createError({ statusCode: 401 })

  const update = await readBody<Update>(event)
  if (!telegram.bot.isInited()) await telegram.bot.init()
  try {
    await telegram.bot.handleUpdate(update)
  } catch (e) {
    // Acknowledge anyway so Telegram doesn't retry a failing update forever.
    console.error('[bot] webhook update failed:', e)
  }
  return { ok: true }
})
