# Running the site locally

How to start ATMO studio on your own computer and look at the site, the booking flow, the admin panel and (optionally) the Telegram bot. Commands are for PowerShell or Git Bash on Windows; they work the same on macOS/Linux.

## What you need (install once)

| Tool | Why | Check |
|---|---|---|
| [Git](https://git-scm.com/) | Get the code | `git --version` |
| [nvm for Windows](https://github.com/coreybutler/nvm-windows) + Node 24 | Runs the app (Nuxt 4 needs Node 22.22+ or 24.15+) | `node -v` → `v24.x` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Runs the PostgreSQL database | `docker --version` |

Install Node 24 with nvm:

```bash
nvm install 24.22.3 64
nvm use 24.22.3
```

## First time only

```bash
git clone https://github.com/AGrinvald/atmostudiokz.git
cd atmostudiokz
nvm use 24.22.3
npm install
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

Start **Docker Desktop** (from the Start menu) and wait until it says it's running, then:

```bash
npm run db:up                 # start PostgreSQL in Docker
npm run db:migrate            # create the tables
npm run db:seed -- --dev      # working hours 10:00–21:00 + a placeholder Kaspi link
npm run admin:set -- --email you@example.com --password "at least 10 characters"
```

> `--dev` sets a fake Kaspi link so online booking is enabled locally. Real hours and the real Kaspi link are set later in the admin panel.

## Every time

1. Start **Docker Desktop** and wait until it's running.
2. In the project folder:
   ```bash
   nvm use 24.22.3
   npm run db:up
   npm run dev
   ```
3. Wait for `Local: http://localhost:3000/` in the terminal (the first start takes ~20 seconds and shows a Nuxt loading screen in the browser).
4. Open **http://localhost:3000**.

Stop the server with `Ctrl+C`. The database keeps running in Docker; stop it with `docker compose stop` if you like (your data is kept).

## What to look at

| Address | What it is |
|---|---|
| http://localhost:3000 | Landing page |
| http://localhost:3000/book | Booking form — pick a date, time, options, people; the total updates live |
| `/booking/…` | Opens after booking: Kaspi payment steps, countdown, «Я оплатил», cancel |
| http://localhost:3000/admin | Admin panel — sign in with the email/password from `admin:set` |
| http://localhost:3000/rules, /privacy | Texts edited in Admin → Настройки → Тексты |
| http://localhost:3000/api/health | Should show `{ "ok": true }` — confirms the database connection |

### Try the whole flow

1. Go to **/book**, fill in the form and press «Перейти к оплате».
2. On the booking page press «Я оплатил».
3. Open **/admin** — the booking is under «Требуют внимания». Press «✅ Оплата получена».
4. Back on the booking page (it refreshes itself) the status becomes «Запись подтверждена».

The placeholder Kaspi link doesn't lead to a real payment — that's expected locally.

### Look at the phone layout

In Chrome/Edge press `F12`, then `Ctrl+Shift+M` (device toolbar) and pick a phone, e.g. "Pixel 7".

### See the data

```bash
npm run db:studio
```

Opens Drizzle Studio in the browser with all tables (bookings, clients, settings…).

## Telegram bot (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. In `.env` set:
   ```
   NUXT_TELEGRAM_BOT_TOKEN=<token from BotFather>
   NUXT_ADMIN_CHAT_LINK_SECRET=<any random word>
   ```
3. Keep `npm run dev` running and, in a **second terminal**, start the bot:
   ```bash
   npm run bot:dev
   ```
   It prints a `https://t.me/<your_bot>` link.
4. To receive admin alerts, send `/start <NUXT_ADMIN_CHAT_LINK_SECRET>` to the bot from your account (or from a group the bot is in).
5. Book from another Telegram account (or the same one) via «📅 Записаться».

Without a token the site works normally — Telegram messages are simply skipped.

## Running the tests

```bash
npm test                      # unit + integration (needs `npm run db:up`)
npx playwright install chromium   # first time only
npm run test:e2e              # browser tests, mobile + desktop
```

Tests use a separate `atmo_test` database, so your local data isn't touched.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node` says v16/v18, or Nuxt complains about the Node version | Run `nvm use 24.22.3` in that terminal |
| `npm run db:up` fails with *failed to connect to the docker API* | Docker Desktop isn't running — start it and wait |
| `/api/health` or the booking page shows an error, *ECONNREFUSED 5432* | The database isn't up: `npm run db:up` |
| *relation "bookings" does not exist* | Run `npm run db:migrate` |
| /book says «Оплата временно недоступна» | No Kaspi link yet: `npm run db:seed -- --dev`, or set it in Admin → Настройки → Kaspi |
| /book shows no dates | No working hours: `npm run db:seed -- --dev`, or set them in Admin → Настройки → Рабочие часы |
| *Another Nuxt dev server is already running* | Another `npm run dev` is open — stop it with `Ctrl+C` in its terminal (or close that terminal) |
| Port 3000 is busy for another reason | `npm run dev -- --port 3001` and open http://localhost:3001 |
| Can't sign in to /admin | Re-run `npm run admin:set -- --email … --password …`; after 5 wrong passwords wait 15 minutes |
| Changes in `.env` have no effect | Restart `npm run dev` (and `npm run bot:dev`) |
