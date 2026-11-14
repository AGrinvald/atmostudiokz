import { expect, test } from '@playwright/test'
import { DEFAULT_BOOKING_SETTINGS } from '../../shared/booking/settings'
import { cancelByClient, claimPayment, confirmPayment, createBooking, type CreateBookingInput } from '../../server/booking/service'
import { setBookingSetting } from '../../server/booking/settings'
import { formatStudioDate } from '../../app/utils/format'
import { ADMIN, FUTURE_DATE, loginAsAdmin, open, resetDatabase, testDb } from './helpers'

const { db } = testDb

const bookingInput = (overrides: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  date: FUTURE_DATE,
  hour: 14,
  sessionType: '55',
  lighting: 'dark',
  background: 'white',
  peopleCount: 3,
  name: 'Анна',
  phone: '+77016667788',
  ...overrides,
})

test.beforeEach(() => resetDatabase())

test.describe('access', () => {
  test('admin pages and API require login', async ({ page, request }) => {
    await page.goto('/admin/settings')
    await expect(page).toHaveURL(/\/admin\/login\?redirect=(%2F|\/)admin(%2F|\/)settings$/)
    expect((await request.get('/api/admin/bookings')).status()).toBe(401)
  })

  test('rejects a wrong password, then logs in and out', async ({ page }) => {
    await open(page, '/admin/login')
    await page.getByLabel('Email').fill(ADMIN.email)
    await page.getByLabel('Пароль').fill('wrong-password')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль')

    await page.getByLabel('Пароль').fill(ADMIN.password)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/admin$/)

    await page.getByRole('button', { name: 'Выйти' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})

test.describe('bookings', () => {
  test('confirms a claimed payment from the «Требуют внимания» list', async ({ page }) => {
    const booking = await createBooking(db, bookingInput(), { source: 'site' })
    await claimPayment(db, booking.publicToken)

    await loginAsAdmin(page)
    const attention = page.getByTestId('attention')
    await expect(attention).toContainText('Анна')
    await expect(attention).toContainText('Проверить оплату')
    await page.screenshot({ path: test.info().outputPath('admin-bookings.png'), fullPage: true })
    await attention.getByRole('button', { name: '✅ Оплата получена' }).click()
    await expect(page.getByTestId('attention')).toHaveCount(0)

    // The client's status page reflects the decision.
    await open(page, `/booking/${booking.publicToken}`)
    await expect(page.getByTestId('status')).toHaveText('Запись подтверждена')
  })

  test('shows the day view and navigates between days', async ({ page }) => {
    await createBooking(db, bookingInput({ hour: 16, name: 'Борис', phone: '+77001112233' }), { source: 'bot' })
    await loginAsAdmin(page)
    await open(page, `/admin?date=${FUTURE_DATE}`)
    await expect(page.getByRole('heading', { name: formatStudioDate(FUTURE_DATE) })).toBeVisible()
    const row = page.getByTestId('booking-row')
    await expect(row).toContainText('16:00')
    await expect(row).toContainText('Борис')
    await expect(row).toContainText('Telegram')

    await page.getByRole('button', { name: 'Следующий день' }).click()
    await expect(page.getByText('На этот день записей нет')).toBeVisible()
  })

  test('moves a booking, cancels it with a refund and marks the refund done', async ({ page }) => {
    const booking = await createBooking(db, bookingInput(), { source: 'site' })
    await confirmPayment(db, booking.id)
    await loginAsAdmin(page)
    await open(page, `/admin/bookings/${booking.id}`)
    await expect(page.getByTestId('admin-status')).toHaveText('Подтверждена')

    await page.getByRole('button', { name: 'Перенести', exact: true }).click()
    await page.locator('label:has(input[name="admin-hour"][value="18"])').click()
    await page.getByRole('button', { name: 'Перенести' }).last().click()
    await expect(page.getByText(/, 18:00$/)).toBeVisible()

    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Отменить с возвратом' }).click()
    await expect(page.getByTestId('admin-status')).toHaveText('К возврату')
    await expect(page.getByText(/Верните 20\s000\s₸ в Kaspi/)).toBeVisible()

    await page.getByRole('button', { name: 'Возврат выполнен' }).click()
    await expect(page.getByTestId('admin-status')).toHaveText('Возвращена')
    await expect(page.getByTestId('history')).toContainText('Перенесена')
    await expect(page.getByTestId('history')).toContainText('Возврат выполнен')
  })

  test('attaches a photos link and offers WhatsApp for a site client', async ({ page }) => {
    const booking = await createBooking(db, bookingInput(), { source: 'site' })
    await confirmPayment(db, booking.id)
    await loginAsAdmin(page)
    await open(page, `/admin/bookings/${booking.id}`)

    await page.getByLabel('Ссылка на облако').fill('https://disk.yandex.kz/d/photos')
    await page.getByRole('button', { name: 'Сохранить ссылку' }).click()
    const whatsapp = page.getByRole('link', { name: 'Открыть WhatsApp' })
    await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/77016667788\?text=.*disk\.yandex\.kz/)

    await page.getByRole('button', { name: 'Отметить отправленным' }).click()
    await expect(page.getByText(/^Отправлено /)).toBeVisible()
  })

  test('creates a confirmed walk-in booking; occupied hours are disabled', async ({ page }) => {
    await createBooking(db, bookingInput({ hour: 12 }), { source: 'site' })
    await loginAsAdmin(page)
    await open(page, `/admin/bookings/new?date=${FUTURE_DATE}`)

    await expect(page.locator('input[name="admin-hour"][value="12"]')).toBeDisabled()
    await page.locator('label:has(input[name="admin-hour"][value="20"])').click()
    await page.locator('label:has(input[name="sessionType"][value="30"])').click()
    await page.getByLabel('Имя').fill('Гость')
    await page.getByLabel('Телефон').pressSequentially('7051234567')
    await page.getByLabel('Способ оплаты').selectOption('cash')
    await page.getByRole('button', { name: 'Создать запись' }).click()

    await expect(page).toHaveURL(/\/admin\/bookings\/\d+$/)
    await expect(page.getByTestId('admin-status')).toHaveText('Подтверждена')
    await expect(page.getByText('Наличные')).toBeVisible()
    await expect(page.getByText(/12\s000\s₸/)).toBeVisible()
  })
})

test.describe('clients', () => {
  test('lists, searches and saves notes', async ({ page }) => {
    const a = await createBooking(db, bookingInput(), { source: 'site' })
    await confirmPayment(db, a.id)
    await createBooking(db, bookingInput({ hour: 16, name: 'Борис', phone: '+77001112233' }), { source: 'site' })

    await loginAsAdmin(page)
    await open(page, '/admin/clients')
    await expect(page.getByTestId('client-row')).toHaveCount(2)
    await page.getByLabel('Поиск по имени или телефону').fill('борис')
    await expect(page.getByTestId('client-row')).toHaveCount(1)
    await expect(page.getByTestId('client-row')).toContainText('+7 700 111 22 33')

    await page.getByLabel('Поиск по имени или телефону').fill('')
    await page.getByRole('link', { name: 'Анна' }).click()
    await page.getByLabel('Заметки').fill('Любит тёмный свет')
    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Сохранено')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Заметки')).toHaveValue('Любит тёмный свет')
  })
})

test.describe('settings', () => {
  test('price and background changes show up on /book', async ({ page }) => {
    await loginAsAdmin(page)
    await open(page, '/admin/settings')

    const pricing = page.getByTestId('pricing')
    await pricing.locator('input[name="base30"]').fill('15000')
    await pricing.getByRole('button', { name: 'Сохранить' }).click()
    await expect(pricing.getByRole('status')).toHaveText('Сохранено')

    const options = page.getByTestId('options')
    await options.locator('input[name="background-black"]').check()
    await options.getByRole('button', { name: 'Сохранить' }).click()
    await expect(options.getByRole('status')).toHaveText('Сохранено')
    await page.screenshot({ path: test.info().outputPath('admin-settings.png'), fullPage: true })

    await open(page, '/book')
    await expect(page.locator('label:has(input[name="sessionType"][value="30"])')).toContainText(/15\s000\s₸/)
    await expect(page.locator('input[name="background"][value="black"]')).toBeEnabled()
    await expect(page.locator('input[name="background"][value="red"]')).toBeDisabled()
  })

  test('rejects invalid pricing', async ({ page }) => {
    await loginAsAdmin(page)
    await open(page, '/admin/settings')
    const pricing = page.getByTestId('pricing')
    await pricing.getByLabel('Человек без доплаты').fill('9')
    await pricing.getByLabel('Максимум человек').fill('8')
    await pricing.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByRole('alert')).toHaveText('Проверьте введённые данные')
  })

  test('closing a weekday and blocking a date remove them from /book', async ({ page }) => {
    await loginAsAdmin(page)
    await open(page, '/admin/settings')

    // Close the whole day of FUTURE_DATE via an exception.
    const exceptions = page.getByTestId('exceptions')
    await exceptions.locator('input[name="exceptionDate"]').fill(FUTURE_DATE)
    await exceptions.getByRole('button', { name: 'Добавить' }).click()
    await expect(exceptions.getByText('закрыто')).toBeVisible()

    await open(page, '/book')
    await expect(page.locator(`input[name="date"][value="${FUTURE_DATE}"]`)).toHaveCount(0)
  })

  test('the Kaspi link controls whether online booking is available', async ({ page }) => {
    await setBookingSetting(db, 'payment', { ...DEFAULT_BOOKING_SETTINGS.payment })
    await loginAsAdmin(page)
    await open(page, '/admin/settings')
    const payment = page.getByTestId('payment')
    await expect(payment).toContainText('онлайн-запись недоступна')
    await payment.locator('input[name="kaspiLink"]').fill('https://pay.kaspi.kz/pay/atmo')
    await payment.getByRole('button', { name: 'Сохранить' }).click()
    await expect(payment.getByRole('status')).toHaveText('Сохранено')

    await open(page, '/book')
    await expect(page.getByRole('button', { name: 'Перейти к оплате' })).toBeVisible()
  })

  test('legal texts appear on /rules', async ({ page }) => {
    await loginAsAdmin(page)
    await open(page, '/admin/settings')
    const legal = page.getByTestId('legal')
    await legal.getByLabel('Правила студии').fill('Приходите за 5 минут до начала.')
    await legal.getByRole('button', { name: 'Сохранить' }).click()
    await expect(legal.getByRole('status')).toHaveText('Сохранено')

    await open(page, '/rules')
    await expect(page.getByText('Приходите за 5 минут до начала.')).toBeVisible()
  })
})

test('a client cancellation shows up as a refund to make', async ({ page }) => {
  const booking = await createBooking(db, bookingInput(), { source: 'site' })
  await confirmPayment(db, booking.id)
  await cancelByClient(db, booking.publicToken)
  await loginAsAdmin(page)
  await expect(page.getByTestId('attention')).toContainText('К возврату')
  await page.getByTestId('attention').getByRole('button', { name: 'Возврат выполнен' }).click()
  await expect(page.getByTestId('attention')).toHaveCount(0)
})
