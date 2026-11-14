import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_BOOKING_SETTINGS } from '../../shared/booking/settings'
import { createBooking } from '../../server/booking/service'
import { setBookingSetting } from '../../server/booking/settings'
import { FUTURE_DATE, open, resetDatabase, testDb } from './helpers'

const { db } = testDb
const DATE = FUTURE_DATE
const HOUR = 14

test.beforeEach(() => resetDatabase())

const option = (page: Page, name: string, value: string | number) =>
  page.locator(`label:has(input[name="${name}"][value="${value}"])`)

async function fillBooking(page: Page, opts: { people?: number } = {}) {
  await option(page, 'date', DATE).click()
  await option(page, 'hour', HOUR).click()
  await option(page, 'sessionType', '55').click()
  await option(page, 'lighting', 'bright').click()
  for (let i = 1; i < (opts.people ?? 1); i++) await page.getByRole('button', { name: 'Больше' }).click()
  await page.getByLabel('Имя').fill('Анна')
  await page.getByLabel('Телефон').pressSequentially('87016667788')
  await page.locator('input[name="consentRules"]').check()
  await page.locator('input[name="consentPrivacy"]').check()
}

test('books a session, claims payment and cancels', async ({ page }) => {
  await open(page, '/book')
  await expect(page.getByRole('heading', { name: 'Запись в студию' })).toBeVisible()

  await fillBooking(page, { people: 7 })
  await expect(page.getByLabel('Телефон')).toHaveValue('+7 (701) 666-77-88')
  await expect(page.getByTestId('total')).toHaveText(/22\s000\s₸/)
  await page.screenshot({ path: test.info().outputPath('book-filled.png'), fullPage: true })

  await page.getByRole('button', { name: 'Перейти к оплате' }).click()

  await expect(page).toHaveURL(/\/booking\/[\w-]+$/)
  await expect(page.getByRole('heading', { name: 'Бронь A-1001' })).toBeVisible()
  await expect(page.getByTestId('status')).toHaveText('Ожидает оплаты')
  await expect(page.getByTestId('time-left')).toContainText(/Осталось (30|29):/)
  await expect(page.getByRole('link', { name: 'Оплатить в Kaspi' })).toHaveAttribute('href', 'https://kaspi.kz/pay/test')
  await page.screenshot({ path: test.info().outputPath('booking-awaiting.png'), fullPage: true })

  await page.getByRole('button', { name: 'Я оплатил' }).click()
  await expect(page.getByTestId('status')).toHaveText('Проверяем оплату')
  await expect(page.getByRole('button', { name: 'Я оплатил' })).toHaveCount(0)

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Отменить запись' }).click()
  await expect(page.getByTestId('status')).toHaveText('Запись отменена — возврат в обработке')
  await expect(page.getByRole('link', { name: 'Записаться снова' })).toBeVisible()
})

test('recalculates the total as people are added', async ({ page }) => {
  await open(page, '/book')
  await expect(page.getByTestId('total')).toHaveText('—')
  await option(page, 'sessionType', '30').click()
  await expect(page.getByTestId('total')).toHaveText(/12\s000\s₸/)
  for (let i = 1; i < 8; i++) await page.getByRole('button', { name: 'Больше' }).click()
  await expect(page.getByTestId('people')).toHaveText('8')
  await expect(page.getByTestId('total')).toHaveText(/15\s000\s₸/)
  await expect(page.getByRole('button', { name: 'Больше' })).toBeDisabled()
})

test('only the white background can be chosen; others are marked «скоро»', async ({ page }) => {
  await open(page, '/book')
  await expect(page.locator('input[name="background"][value="white"]')).toBeChecked()
  await expect(page.locator('input[name="background"][value="black"]')).toBeDisabled()
  await expect(page.locator('input[name="background"][value="red"]')).toBeDisabled()
  await expect(option(page, 'background', 'black')).toContainText('скоро')
})

test('asks for missing details before submitting', async ({ page }) => {
  await open(page, '/book')
  await page.getByRole('button', { name: 'Перейти к оплате' }).click()
  await expect(page.getByTestId('submit-error')).toHaveText('Выберите дату и время')

  await fillBooking(page)
  await page.locator('input[name="consentPrivacy"]').uncheck()
  await page.getByRole('button', { name: 'Перейти к оплате' }).click()
  await expect(page.getByTestId('submit-error')).toHaveText('Нужно согласие с правилами и на обработку данных')
  await expect(page).toHaveURL(/\/book$/)
})

test('tells the client when the hour was just taken and refreshes slots', async ({ page }) => {
  await open(page, '/book')
  await fillBooking(page)

  // Someone else books the same hour while the form is open.
  await createBooking(
    db,
    { date: DATE, hour: HOUR, sessionType: '30', lighting: 'dark', background: 'white', peopleCount: 1, name: 'Б', phone: '+77001112233' },
    { source: 'bot' },
  )

  await page.getByRole('button', { name: 'Перейти к оплате' }).click()
  await expect(page.getByTestId('submit-error')).toHaveText('Это время только что заняли. Выберите другое.')
  await expect(page.locator(`input[name="hour"][value="${HOUR}"]`)).toBeDisabled()
})

test('shows that booking is unavailable without a Kaspi link', async ({ page }) => {
  await setBookingSetting(db, 'payment', { ...DEFAULT_BOOKING_SETTINGS.payment })
  await open(page, '/book')
  await expect(page.getByText('Оплата временно недоступна')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Перейти к оплате' })).toHaveCount(0)
})

test('an unknown booking link shows «Бронь не найдена»', async ({ page }) => {
  await open(page, '/booking/does-not-exist')
  await expect(page.getByRole('heading', { name: 'Бронь не найдена' })).toBeVisible()
})
