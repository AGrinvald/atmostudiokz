import type { Page } from '@playwright/test'
import { setAdminCredentials } from '../../server/admin/account'
import { setBookingSetting } from '../../server/booking/settings'
import { addDays, toStudioParts } from '../../server/booking/time'
import { scheduleWeekly } from '../../server/db/schema'
import { createTestDb } from '../integration/db'

export const testDb = createTestDb()

export const ADMIN = { email: 'owner@atmo.kz', password: 'test-admin-password' }

/** A date far enough ahead that the 72h cancel cutoff doesn't apply. */
export const FUTURE_DATE = addDays(toStudioParts(new Date()).date, 5)

/** Empty database with working hours 10–21 every day, a Kaspi link and the admin account. */
export async function resetDatabase() {
  const { db, reset } = testDb
  await reset()
  await db.insert(scheduleWeekly).values(
    Array.from({ length: 7 }, (_, weekday) => ({ weekday, isOpen: true, firstSlotHour: 10, lastSlotHour: 21 })),
  )
  await setBookingSetting(db, 'payment', { kaspiLink: 'https://kaspi.kz/pay/test', kaspiQrUrl: null })
  await setAdminCredentials(db, ADMIN.email, ADMIN.password)
}

/** Navigates and waits until Vue has hydrated, so clicks reach the component state. */
export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => {
    const app = (document.querySelector('#__nuxt') as any)?.__vue_app__
    return app?.$nuxt && !app.$nuxt.isHydrating
  })
}

export async function loginAsAdmin(page: Page) {
  await open(page, '/admin/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Пароль').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await page.waitForURL(url => url.pathname === '/admin')
}
