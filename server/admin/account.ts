import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db'
import { adminUsers } from '../db/schema'
import { hashPassword, verifyPassword } from './password'

export const MIN_PASSWORD_LENGTH = 10

export interface AdminIdentity {
  id: number
  email: string
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * Sets the credentials of the single admin (SPEC §8): updates the existing admin,
 * or creates it on first run.
 */
export async function setAdminCredentials(db: Db, email: string, password: string): Promise<AdminIdentity> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  const values = { email: normalizeEmail(email), passwordHash: await hashPassword(password) }
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).orderBy(asc(adminUsers.id)).limit(1)
  const [admin] = existing
    ? await db.update(adminUsers).set(values).where(eq(adminUsers.id, existing.id)).returning()
    : await db.insert(adminUsers).values(values).returning()
  return { id: admin!.id, email: admin!.email }
}

export async function authenticateAdmin(db: Db, email: string, password: string): Promise<AdminIdentity | null> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalizeEmail(email)))
  // Hash anyway when the email is unknown, so response time doesn't reveal which emails exist.
  const ok = admin ? await verifyPassword(admin.passwordHash, password) : (await hashPassword(password), false)
  return ok && admin ? { id: admin.id, email: admin.email } : null
}
