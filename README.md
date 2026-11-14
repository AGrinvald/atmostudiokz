# ATMO studio

Website, online booking and Telegram bot for ATMO studio — a self-portrait studio in Almaty.
See [SPEC.md](SPEC.md) for the product spec.

## Stack

Nuxt 4 · Tailwind CSS 4 · PostgreSQL + Drizzle ORM · grammY (Telegram) · nuxt-auth-utils · @nuxtjs/i18n

## Local development

Requirements: Node 24 (see `.nvmrc`), Docker.

```bash
nvm use 24.22.3
npm install
cp .env.example .env
npm run db:up        # start Postgres in Docker
npm run db:migrate   # apply migrations
npm run db:seed -- --dev   # default working hours + placeholder Kaspi link
npm run dev          # http://localhost:3000
```

Health check: `GET /api/health`.

## Tests

```bash
npm test             # unit + integration (needs `npm run db:up`)
npm run test:unit    # pure logic only, no database
npm run test:e2e     # browser tests (Playwright, mobile + desktop)
```

Integration and e2e tests create and migrate a separate `atmo_test` database (override with `TEST_DATABASE_URL`), so your dev data is never touched. E2E tests start their own dev server on port 3100. First run only: `npx playwright install chromium`.

## Pages

| Page | Purpose |
|---|---|
| `/` | Landing page |
| `/book` | Booking form: date, hour, session, light, background, people (live total), contacts, consents |
| `/booking/:token` | Booking status: Kaspi payment steps with countdown, «Я оплатил», cancel (≥ 72h) |
| `/rules`, `/privacy` | Studio rules and privacy policy (texts edited in the admin panel) |
| `/admin` | Admin panel: bookings by day, «Требуют внимания», booking actions |
| `/admin/clients` | Clients with search, visit history and notes |
| `/admin/settings` | Prices, options, Kaspi link/QR, working hours, days off, booking rules, texts |

## Telegram bot

Clients can book, pay («Я оплатил»), see and cancel their bookings in the bot; the studio gets alerts with ✅/❌ payment buttons in one admin chat. Without `NUXT_TELEGRAM_BOT_TOKEN` the site works as usual and Telegram notifications are skipped.

1. Create a bot with [@BotFather](https://t.me/BotFather) and put the token in `.env` as `NUXT_TELEGRAM_BOT_TOKEN`.
2. Set `NUXT_ADMIN_CHAT_LINK_SECRET` to any random string.
3. Run the bot locally (long polling, no public URL needed):
   ```bash
   npm run bot:dev
   ```
4. From the chat that should receive alerts (your account or a staff group with the bot added), send `/start <NUXT_ADMIN_CHAT_LINK_SECRET>`.

In production the bot runs inside the Nuxt server via webhook. Set `NUXT_TELEGRAM_WEBHOOK_SECRET` (16+ chars of `A–Z a–z 0–9 _ -`) and an https `NUXT_PUBLIC_SITE_URL`, then register it once:

```bash
npm run bot:webhook
```

Messages sent automatically: new booking / «Я оплатил» / client cancellation → admin chat; payment confirmed or rejected, hold expired, booking moved or cancelled by the studio, refund done, photos link, 24h reminder → Telegram clients.

## Admin access

There is a single admin account. Create it (or change its email/password) with:

```bash
npm run admin:set -- --email owner@example.com --password "at least 10 characters"
```

Then sign in at http://localhost:3000/admin. Five wrong passwords lock login for 15 minutes per IP.

## Booking core

| Module | Responsibility |
|---|---|
| `shared/booking/settings.ts` | Admin-editable settings (prices, options, rules, Kaspi) with defaults and validation |
| `shared/booking/pricing.ts` | Price calculation — shared by the form (live total) and the server |
| `shared/booking/phone.ts` | `+7` phone normalization (client identity) |
| `server/booking/time.ts` | Studio time (`Asia/Almaty`) ↔ UTC |
| `server/booking/availability.ts` | Pure slot computation: working hours, exceptions, lead time, horizon |
| `server/booking/service.ts` | Create booking and every status transition (SPEC §4) |
| `server/booking/present.ts` | Public view of a booking for the status page and bot |

Public API:

| Endpoint | Purpose |
|---|---|
| `GET /api/booking-config` | Prices, options, rules for the booking form |
| `GET /api/availability?from=YYYY-MM-DD&days=N` | Hourly slots per day (`available: true/false`) |
| `POST /api/bookings` | Create a booking (requires both consents) |
| `GET /api/bookings/:token` | Booking status page data |
| `POST /api/bookings/:token/claim-payment` | «Я оплатил» |
| `POST /api/bookings/:token/cancel` | Client cancel (≥ 72h before) |

Scheduled tasks: `bookings:expire` (every minute) and `bookings:complete` (every 10 minutes).

## Database

- Schema: `server/db/schema.ts`
- After changing the schema: `npm run db:generate -- --name <change>` then `npm run db:migrate`
- Browse data: `npm run db:studio`

## Brand assets

Source files live in `references/` (logo, palette). Logos are copied to `public/`; palette colors are defined as Tailwind tokens in `app/assets/css/main.css`.
