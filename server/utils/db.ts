import { createDb, type Db } from '../db'

let instance: Db | undefined

export function useDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    instance = createDb(url).db
  }
  return instance
}
