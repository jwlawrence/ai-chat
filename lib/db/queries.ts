import { asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UIMessage } from 'ai';
import { db } from './client';
import { messages, sessions, type NewDbMessage, type Session } from './schema';

export async function listSessions(): Promise<Session[]> {
  return db.select().from(sessions).orderBy(desc(sessions.updatedAt));
}

export async function getSession(id: string): Promise<Session | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: { model: string }): Promise<Session> {
  const [row] = await db.insert(sessions).values({ model: input.model }).returning();
  return row;
}

export async function renameSession(id: string, title: string): Promise<void> {
  await db.update(sessions).set({ title, updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function touchSession(id: string): Promise<void> {
  await db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function addUsageToSession(
  id: string,
  usage: { tokensIn: number; tokensOut: number; tokensCached: number },
): Promise<void> {
  await db
    .update(sessions)
    .set({
      tokensIn: sql`${sessions.tokensIn} + ${usage.tokensIn}`,
      tokensOut: sql`${sessions.tokensOut} + ${usage.tokensOut}`,
      tokensCached: sql`${sessions.tokensCached} + ${usage.tokensCached}`,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function getMessages(sessionId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage['role'],
    parts: r.parts as UIMessage['parts'],
  }));
}

export async function appendMessages(
  sessionId: string,
  toInsert: Array<Pick<UIMessage, 'role' | 'parts'>>,
): Promise<void> {
  if (toInsert.length === 0) return;
  // Stamp each row with a distinct createdAt offset by its array index.
  // Postgres's defaultNow() evaluates once per statement, so a batch insert
  // would otherwise give every row the same timestamp — and getMessages'
  // ORDER BY created_at ASC would then return user/assistant pairs in an
  // arbitrary (often reversed) order on reload.
  const baseTime = Date.now();
  const rows: NewDbMessage[] = toInsert.map((m, i) => ({
    sessionId,
    role: m.role,
    parts: m.parts as unknown as NewDbMessage['parts'],
    createdAt: new Date(baseTime + i),
  }));
  await db.insert(messages).values(rows);
}

export async function countMessages(sessionId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(messages)
    .where(eq(messages.sessionId, sessionId));
  return row?.value ?? 0;
}

// Deletes the `n` most-recently-created messages in the session. No-op if n <= 0.
export async function trimTrailingMessages(sessionId: string, n: number): Promise<void> {
  if (n <= 0) return;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(n);
  if (rows.length === 0) return;
  await db.delete(messages).where(
    inArray(
      messages.id,
      rows.map((r) => r.id),
    ),
  );
}
