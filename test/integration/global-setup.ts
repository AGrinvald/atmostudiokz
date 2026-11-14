import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { TEST_DATABASE_URL } from './db'

/** Creates the test database if needed and applies all migrations. Requires `npm run db:up`. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
  const exists = await admin`select 1 from pg_database where datname = ${dbName}`
  if (exists.length === 0) await admin.unsafe(`create database "${dbName}"`)
  await admin.end()

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  await migrate(drizzle(client), { migrationsFolder: 'server/db/migrations' })
  await client.end()
}
