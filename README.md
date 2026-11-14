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
```

Integration tests create and migrate a separate `atmo_test` database (override with `TEST_DATABASE_URL`).

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
