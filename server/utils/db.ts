import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined

export function useDb() {
  if (!instance) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    instance = drizzle(postgres(url), { schema })
  }
  return instance
}
