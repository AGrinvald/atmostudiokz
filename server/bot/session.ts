import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { BACKGROUNDS, LIGHTINGS, SESSION_TYPES } from '../../shared/booking/settings'
import type { Db } from '../db'
import { botSessions } from '../db/schema'

const DRAFT_TTL_MS = 60 * 60_000

export const draftSchema = z.object({
  step: z.enum(['contact', 'name', 'confirm']),
  date: z.string(),
  hour: z.number().int(),
  sessionType: z.enum(SESSION_TYPES),
  lighting: z.enum(LIGHTINGS),
  background: z.enum(BACKGROUNDS),
  peopleCount: z.number().int(),
  phone: z.string().optional(),
  name: z.string().optional(),
  suggestedName: z.string().optional(),
})
export type Draft = z.infer<typeof draftSchema>

/** The chat's unfinished booking, or null if there is none or it's older than an hour. */
export async function getDraft(db: Db, chatId: number, now = new Date()): Promise<Draft | null> {
  const [row] = await db.select().from(botSessions).where(eq(botSessions.chatId, chatId))
  if (!row || now.getTime() - row.updatedAt.getTime() > DRAFT_TTL_MS) return null
  const parsed = draftSchema.safeParse(row.state)
  return parsed.success ? parsed.data : null
}

export async function saveDraft(db: Db, chatId: number, draft: Draft, now = new Date()): Promise<void> {
  await db
    .insert(botSessions)
    .values({ chatId, state: draft, updatedAt: now })
    .onConflictDoUpdate({ target: botSessions.chatId, set: { state: draft, updatedAt: now } })
}

export async function clearDraft(db: Db, chatId: number): Promise<void> {
  await db.delete(botSessions).where(eq(botSessions.chatId, chatId))
}
