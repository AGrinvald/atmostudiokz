# ATMO studio — Website, Booking & Telegram Bot

## 1. Overview

ATMO studio is a self-portrait photo studio in Almaty ("Студия автопортрета. Ты, свет и камера.").

- Address: Алматы, ул. Алатау 36, блок 1
- Phone: +7 777 609 03 17
- Instagram: https://www.instagram.com/atmo_studio_26/

We are building:

1. **Website** (Nuxt): landing page about the studio + online booking.
2. **Telegram bot**: booking, viewing/cancelling own bookings, studio info.
3. **Admin panel** (part of the website): clients, bookings, payments, settings.

Site and bot share one backend and one database, so availability is always consistent.

### Locale & time

- Language: Russian only in v1. All UI strings go through i18n (`@nuxtjs/i18n`) so Kazakh/English can be added later.
- Timezone: one fixed studio timezone, `Asia/Almaty` (UTC+5). All times are stored in UTC and displayed in studio time.
- Currency: тенге (₸), integers.

## 2. Tech stack & deployment

- **Nuxt 4** full-stack app: public site, admin panel, Nitro server API, Telegram bot webhook endpoint.
- **Telegram bot**: grammY, webhook mode, mounted as a Nitro route (e.g. `POST /api/telegram/webhook/<secret>`).
- **Database**: PostgreSQL + Drizzle ORM (migrations in repo).
- **Auth (admin)**: `nuxt-auth-utils` session cookie; password hashed.
- **Scheduled jobs**: Nitro scheduled tasks (or an in-process interval) for hold expiry and reminders.
- **Deploy**: Docker Compose on a single VPS (app + Postgres), Caddy for HTTPS, daily DB backups. VPS provider chosen at deploy time (a KZ host such as PS.kz is preferred so personal data stays in Kazakhstan).
- Secrets via env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_CHAT_LINK_SECRET`, `NUXT_SESSION_PASSWORD`, `PUBLIC_SITE_URL`.
- The domain and bot token are provided by the owner later.

## 3. Domain rules

### 3.1 Slots

- The schedule is a grid of **hourly slots** starting on the hour (10:00, 11:00, …).
- One studio = one resource → **at most one active booking per slot**.
- A booking always occupies **the whole hour**, regardless of session type:
  - **30-min session**: occupies the full hour (the remaining time is unused).
  - **55-min session**: occupies the full hour (5 min buffer to the next client).
- Session type is stored on the booking (for the admin and for pricing) but does not affect occupancy.
- No bookings starting on the half hour.
- Enforced at DB level: unique index on `slot_start` filtered to active statuses (`awaiting_payment`, `payment_claimed`, `confirmed`).
- The data model keeps a single implicit resource. Adding a `resource_id` later must not require rethinking slot logic.

### 3.2 Availability

A slot is bookable if all of these hold:

- it falls inside the weekly working hours for that weekday,
- it is not covered by a date exception (day off / blocked hours),
- it has no active booking,
- it is at least **2 hours** in the future (setting: `min_lead_hours`, default 2),
- it is within **30 days** from today (setting: `booking_horizon_days`, default 30).

### 3.3 Session types & pricing

| Session | Base price | Included people |
|---|---|---|
| 30 мин | 12 000 ₸ | up to 5 |
| 55 мин | 20 000 ₸ | up to 5 |

- Each person above 5 adds **+1 000 ₸**. Maximum **8** people.
- `price = base_price + max(0, people − included_people) × extra_person_price`
  - 30 мин: 12 000 – 15 000 ₸
  - 55 мин: 20 000 – 23 000 ₸
- All values are editable in admin settings: base price per type, included people (5), extra person price (1 000), max people (8).
- The **total is recalculated live** whenever the number of people changes (site form and bot step).
- The price is calculated on the server and **snapshotted on the booking** (later setting changes don't alter existing bookings).

### 3.4 Session options (included in price, same for both types)

- **Свет** (required, choose one): `тёмный` / `светлый`.
- **Фон** (required, choose one): `белый` / `чёрный` / `красный`.
  - Currently only **белый** is available. Чёрный and красный are shown disabled with the label «скоро».
  - Each background has an `enabled` flag in admin settings.

### 3.5 What the client gets (site copy)

> Безлимит фото в лёгкой обработке — цветные и чёрно-белые. Ссылка на облако придёт в мессенджер.

### 3.6 Clients

- A client is identified by **phone number**, normalized to E.164 (`+7XXXXXXXXXX`).
- Site bookings: the client enters name + phone.
- Bot bookings: the phone comes from Telegram "share contact". The client's `telegram_user_id` / `chat_id` is linked to the client record.
- A client booking on both the site and the bot is the same client (matched by phone).
- Website has no client accounts.

## 4. Booking lifecycle

### 4.1 Statuses

| Status | Meaning | Holds slot? |
|---|---|---|
| `awaiting_payment` | Created; client must pay and press «Я оплатил» | yes |
| `payment_claimed` | Client pressed «Я оплатил»; waiting for admin | yes |
| `confirmed` | Payment confirmed (or admin-created) | yes |
| `expired` | No «Я оплатил» within 30 min | no |
| `rejected` | Admin marked «Оплаты нет» | no |
| `cancelled_refund_pending` | Cancelled; refund owed | no |
| `refunded` | Admin performed refund in Kaspi | no |
| `cancelled` | Cancelled with no refund owed (e.g. admin cancels an unpaid booking) | no |
| `completed` | Session took place (set automatically after the slot ends) | — |

### 4.2 Payment flow (manual Kaspi, full price)

1. The client submits a booking. The server re-checks availability and creates the booking in `awaiting_payment`, with a human number like `A-1042` and `payment_deadline = now + 30 min`.
2. The client sees:
   - the amount,
   - the Kaspi payment link and QR (from admin settings),
   - the instruction: «Укажите номер брони A-1042 в комментарии к платежу».
3. The client presses **«Я оплатил»**. The booking moves to `payment_claimed`, and the deadline no longer applies (the slot is held until the admin decides).
4. The admin chat receives a message with the booking details and inline buttons **✅ Оплата получена** / **❌ Оплаты нет**. The same actions exist in the admin panel.
   - ✅: the booking moves to `confirmed`. The client is notified: bot message for bot clients; the status page shows it for site clients.
   - ❌: the booking moves to `rejected`, the slot is freed, and bot clients are notified.
5. A background job moves `awaiting_payment` bookings past their deadline to `expired`, freeing the slot.

If the Kaspi link/QR is not configured, the booking flow shows «Оплата временно недоступна» and cannot be submitted.

### 4.3 Cancellation & refunds

- **≥ 72 hours before the slot**:
  - The client can self-cancel:
    - in the bot: «Мои записи» → «Отменить»;
    - on the site: a cancel link on the booking status page, accessed by an unguessable token.
  - Outcome:
    - `confirmed` / `payment_claimed` bookings move to `cancelled_refund_pending`;
    - `awaiting_payment` bookings move to `cancelled`.
  - The admin is notified.
- **< 72 hours before**: clients can't cancel online and no refund is given. The UI shows «Отмена менее чем за 72 часа невозможна — свяжитесь со студией» with the phone number.
- **Admin** can cancel any booking at any time and chooses whether a refund is owed.
- Refunds are made **manually in Kaspi** by the admin, who then presses **«Возврат выполнен»**. The booking moves to `refunded`.
- No client-side rescheduling (cancel and book again). The **admin can move** a booking to another free slot.
- The cutoff is a setting (`cancel_cutoff_hours`, default 72).

### 4.4 Admin-created bookings

- The admin can create a booking for a phone or walk-in client from the panel.
- It skips the payment wait and is created directly as `confirmed`.
- Payment method is chosen: `kaspi` / `cash` / `on_site`.
- Admin bookings still cannot overlap an active booking.

### 4.5 Photo delivery

- After the session, the admin pastes the **cloud link** into the booking.
- **Bot clients**: the bot automatically sends the link to the client.
- **Site clients**: **no automatic sending**. The panel shows the link with a «Копировать» button and an «Открыть WhatsApp» shortcut (`wa.me/<phone>?text=…` with a prefilled message). The admin sends it manually.
- The booking records `photos_link` and `photos_sent_at` (for bot clients set automatically; for site clients the admin can mark «Отправлено»).

## 5. Notifications

- **Admin chat**: one Telegram chat (personal or group), linked once by sending `/start <ADMIN_CHAT_LINK_SECRET>` to the bot. Receives:
  - new booking (`awaiting_payment`),
  - «Я оплатил» (with ✅/❌ buttons),
  - client cancellation (with refund-pending note),
  - expired holds (optional, quiet).
- **Bot clients** receive:
  - booking created + payment instructions,
  - payment confirmed / rejected,
  - reminder **24 hours** before the session,
  - photo link.
- **Site clients**: no messages are sent. Their booking status page (bookmarkable link) shows the current status.
- No SMS, email or WhatsApp automation in v1.

## 6. Website

### 6.1 Pages

- `/`: one-page landing:
  1. Hero: logo, «Ты, свет и камера», CTA «Записаться».
  2. «Как это будет»: how a session works (steps).
  3. Lighting: gallery of the тёмный / светлый setups.
  4. Prices: 30 мин / 55 мин, people rules (до 5 человек, +1 000 ₸ за каждого следующего, максимум 8).
  5. «Что вы получите»: unlimited lightly retouched colour + B/W photos, cloud link to messenger.
  6. Rules / FAQ.
  7. Contacts: address, map (2GIS / Yandex embed), phone, Instagram, link to the Telegram bot.
- `/book`: booking flow (linkable from Instagram).
- `/booking/<token>`: booking status page with payment instructions, the «Я оплатил» button, and a cancel link (when allowed).
- `/rules`: «Правила студии» (text editable in admin).
- `/privacy`: «Политика конфиденциальности» (text editable in admin).

### 6.2 Booking form (`/book`)

Fields:

- date: calendar showing days with free slots,
- hour: free hourly slots for that date,
- session type: 30 мин / 55 мин,
- lighting: тёмный / светлый,
- background: белый (others disabled, «скоро»),
- number of people: 1–8, with the **total price recalculated live**,
- «Имя»: single field,
- phone: +7 mask,
- comment: optional,
- ☐ «Согласен с правилами студии» (required, links to `/rules`),
- ☐ «Согласен на обработку персональных данных» (required, links to `/privacy`).

On submit, the client is redirected to `/booking/<token>`.

If the slot was taken meanwhile, show a clear error and refresh the available slots.

### 6.3 Design

- **White theme**: white / off-white background, near-black text.
- **Primary buttons**: yellow background, black text.
- **Secondary buttons**: black background, white text.
- **Hover / highlights**: light yellow.
- Palette is taken from `references/colors.jpg`: three near-black greys, warm yellow, light yellow, off-white. The exact hex values are sampled at build time and defined as CSS tokens.
- Logo: `references/logo/dark.svg` on light backgrounds; `references/logo/white.svg` only on black sections.
- Photos: placeholders for now; the owner adds real photos later.
- Mobile-first: most traffic comes from Instagram.

## 7. Telegram bot

Main menu (reply keyboard):

- **Записаться**
- **Мои записи**
- **О студии**

### 7.1 Booking flow

1. `/start`: welcome message plus the menu.
2. «Записаться»: choose a date (inline calendar, only days with free slots).
3. Choose an hour (inline buttons with free slots).
4. Session type: 30 мин (12 000 ₸) / 55 мин (20 000 ₸).
5. Lighting: тёмный / светлый.
6. Background: белый (others shown as «скоро», not selectable).
7. Number of people: 1–8; the total price is shown and updated.
8. Share contact (request-contact button); on first use only, reused afterwards.
9. Confirm or enter name.
10. Summary + consent (links to rules and privacy) → «Подтвердить».
11. Booking created: the bot shows the amount, Kaspi link/QR, the booking number for the comment, and an **«Я оплатил»** button.
12. Status updates arrive as messages.

Availability is re-checked when the booking is created. If the slot was taken, the bot says so and returns to the hour selection.

### 7.2 Other menu items

- **Мои записи**: upcoming and recent bookings with their status. A «Отменить» button is shown when ≥ 72h remain. «Я оплатил» is shown for `awaiting_payment`.
- **О студии**: description, address with map link, phone, Instagram, website link.

### 7.3 Admin chat commands/actions

- `/start <secret>`: links this chat as the admin chat (replaces the previous one).
- Inline ✅ / ❌ on payment-claimed messages.

## 8. Admin panel (`/admin`)

- **Auth**: a single admin user (email + password), seeded via a CLI/env on first deploy. Session cookie, with login rate limiting.
- **Bookings**:
  - calendar/day view plus a list with status filters;
  - booking details;
  - actions:
    - confirm payment / reject,
    - cancel (with "refund owed" choice),
    - mark refunded,
    - move to another free slot,
    - attach photo link (auto-send for bot clients; copy / WhatsApp shortcut for site clients),
    - mark photos sent.
- **Create booking**: pick a slot, pick or create a client (phone, name), session, options, people (price auto-calculated, editable), payment method. Created as `confirmed`.
- **Clients**:
  - list with search by name/phone: name, phone, Telegram linked (yes/no), number of bookings, last visit;
  - client page: details, booking history, admin notes (free text).
- **Settings**:
  - weekly working hours (per weekday: open/closed, first and last slot start),
  - date exceptions (closed day / blocked specific hours, with a note),
  - prices (base per session type, included people, extra-person price, max people),
  - backgrounds (enable/disable), lighting options,
  - booking rules (`min_lead_hours`, `booking_horizon_days`, `payment_window_minutes` = 30, `cancel_cutoff_hours` = 72, `reminder_hours` = 24),
  - Kaspi payment link + QR image upload,
  - texts for «Правила студии» and «Политика конфиденциальности»,
  - admin chat status (linked chat, re-link instructions).

## 9. Data model (sketch)

- `admin_users`: id, email, password_hash, created_at
- `clients`: id, phone (unique, E.164), name, telegram_user_id (nullable, unique), telegram_chat_id, notes, created_at
- `bookings`:
  - id, number (`A-1042`, unique), public_token (unique), client_id
  - slot_start (timestamptz), session_type (`30` | `55`), lighting, background, people_count
  - price_total, price_breakdown (json snapshot)
  - status, source (`site` | `bot` | `admin`), payment_method (`kaspi` | `cash` | `on_site`)
  - payment_deadline, payment_claimed_at, confirmed_at, cancelled_at, refunded_at
  - comment, photos_link, photos_sent_at, reminder_sent_at
  - created_at, updated_at
  - Partial unique index: `(slot_start) WHERE status IN ('awaiting_payment','payment_claimed','confirmed')`
- `schedule_weekly`: weekday, is_open, first_slot_hour, last_slot_hour
- `schedule_exceptions`: id, date, all_day (bool), blocked_hours (int[]), note
- `settings`: key/value (json) covering prices, rules, backgrounds, Kaspi link/QR path, legal texts, admin_chat_id
- `booking_events`: id, booking_id, type, actor (`client` | `admin` | `system`), payload, created_at (audit trail)

## 10. Background jobs

- Every minute: expire `awaiting_payment` bookings past `payment_deadline`.
- Every 10 minutes:
  - send 24h reminders to bot clients for `confirmed` bookings (`reminder_sent_at` is null);
  - mark past `confirmed` bookings as `completed`.

## 11. Security & privacy

- Booking status/cancel links use long random tokens; the booking number alone grants nothing.
- Telegram webhook is protected by a secret path and the `X-Telegram-Bot-Api-Secret-Token` header.
- Bot inline actions (✅/❌) are accepted only from the linked admin chat.
- Rate limiting on booking creation and admin login; a honeypot field on the site form.
- Personal data (name, phone) is used only for bookings. A consent checkbox is required. Data is hosted on the VPS; a KZ hosting provider is preferred.

## 12. Out of scope (v1)

- Automatic payment confirmation (ApiPay.kz or similar). Payments go through one module interface so it can be added later.
- Multiple rooms/specialists.
- Paid extras, gift certificates, promo codes.
- SMS/WhatsApp/email automation.
- Client accounts on the website.
- Languages other than Russian.

## 13. Open items before launch

- Confirm with Kaspi (2323) whether a fiscal receipt (ККМ) is required for remote payments.
- Owner provides: domain, bot token (@BotFather), Kaspi payment link + QR, real photos, final rules/privacy text (starter text is drafted by us), working hours.

## 14. Acceptance criteria

- [ ] Two clients (site + bot) cannot book the same hour; the second gets a "slot taken" error.
- [ ] A 30-min booking at 14:00 makes the 14:00 slot unavailable everywhere; 13:00 and 15:00 remain free.
- [ ] Changing the people count from 5 to 7 updates the 55-min total from 20 000 to 22 000 ₸ live, on the site and in the bot; 9 people cannot be selected.
- [ ] Only the «белый» background is selectable; чёрный and красный appear as «скоро».
- [ ] A booking without «Я оплатил» within 30 minutes expires and its slot becomes free.
- [ ] «Я оплатил» triggers an admin chat message with working ✅/❌ buttons; ✅ confirms and notifies the bot client.
- [ ] A client can cancel ≥ 72h before (status becomes refund-pending, admin notified), and cannot cancel < 72h before.
- [ ] Admin can mark a refund done, move a booking, and create a confirmed booking with a payment method.
- [ ] Attaching a photo link auto-sends it to a bot client; for a site client nothing is sent and copy/WhatsApp actions are shown.
- [ ] Bot clients receive a reminder 24h before the session.
- [ ] Same phone on site and bot shows as one client in the admin panel with full history.
- [ ] Without a configured Kaspi link/QR, booking shows «Оплата временно недоступна».
