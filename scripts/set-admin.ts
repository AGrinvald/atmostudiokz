// Creates the single admin account, or updates its email/password (SPEC §8).
//
//   npm run admin:set -- --email owner@example.com --password "long password"
//
// Prefer ADMIN_PASSWORD=... in the environment over --password to keep it out of shell history.

import { parseArgs } from 'node:util'
import { setAdminCredentials } from '../server/admin/account'
import { createDb } from '../server/db'

const { values } = parseArgs({
  options: { email: { type: 'string' }, password: { type: 'string' } },
})
const email = values.email
const password = values.password ?? process.env.ADMIN_PASSWORD
if (!email || !password) {
  console.error('Usage: npm run admin:set -- --email <email> --password <password>  (or ADMIN_PASSWORD env)')
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const { db, close } = createDb(url)
try {
  const admin = await setAdminCredentials(db, email, password)
  console.log(`Admin set: ${admin.email} (id ${admin.id})`)
} finally {
  await close()
}
