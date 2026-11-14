import { createBot, type TelegramBot } from '../bot/bot'
import { createNotifier, type Notifier } from '../bot/notifier'

let telegram: TelegramBot | null | undefined
let silentNotifier: Notifier | undefined

/** The Telegram bot, or null when no bot token is configured. */
export function useTelegram(): TelegramBot | null {
  if (telegram === undefined) {
    const config = useRuntimeConfig()
    telegram = config.telegramBotToken
      ? createBot({
          token: config.telegramBotToken,
          db: useDb(),
          siteUrl: config.public.siteUrl,
          adminLinkSecret: config.adminChatLinkSecret || undefined,
        })
      : null
  }
  return telegram
}

/** Telegram notifications; a no-op when the bot isn't configured. */
export function useNotifier(): Notifier {
  return useTelegram()?.notifier ?? (silentNotifier ??= createNotifier(null, useDb()))
}
