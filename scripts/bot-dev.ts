// Runs the Telegram bot locally with long polling — no public URL needed.
// Removes any registered webhook first (re-register with `npm run bot:webhook` when deploying).
//
//   npm run bot:dev

import { createBot } from '../server/bot/bot'
import { createDb } from '../server/db'

const token = process.env.NUXT_TELEGRAM_BOT_TOKEN
const url = process.env.DATABASE_URL
if (!token) throw new Error('NUXT_TELEGRAM_BOT_TOKEN is not set (get one from @BotFather)')
if (!url) throw new Error('DATABASE_URL is not set')

const { db, close } = createDb(url)
const { bot } = createBot({
  token,
  db,
  siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  adminLinkSecret: process.env.NUXT_ADMIN_CHAT_LINK_SECRET || undefined,
})

await bot.api.deleteWebhook()
const stop = async () => {
  await bot.stop()
  await close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

await bot.start({
  onStart: me => {
    console.log(`Bot @${me.username} is polling. Open https://t.me/${me.username}`)
    if (process.env.NUXT_ADMIN_CHAT_LINK_SECRET) {
      console.log(`Admin alerts: send "/start ${process.env.NUXT_ADMIN_CHAT_LINK_SECRET}" to the bot from the admin chat.`)
    }
  },
})
