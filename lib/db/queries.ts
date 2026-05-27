import type { UIMessage } from 'ai';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './client';
import { chatSessions, messages, type NewDbMessage, type Session } from './schema';

export async function listSessions(userId: string | null): Promise<Session[]> {
  // Phase 4 will scope anonymous listing by anonymous_id cookie. Until then,
  // anonymous users get an empty list rather than leaking every other visitor's chats.
  if (userId === null) return [];
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt));
}

export async function getSession(id: string, userId: string | null): Promise<Session | null> {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, id),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createSession(input: {
  model: string;
  userId?: string | null;
}): Promise<Session> {
  const [row] = await db
    .insert(chatSessions)
    .values({ model: input.model, userId: input.userId ?? null })
    .returning();
  return row;
}

export async function renameSession(
  id: string,
  title: string,
  userId: string | null,
): Promise<void> {
  await db
    .update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(chatSessions.id, id),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    );
}

export async function touchSession(id: string, userId: string | null): Promise<void> {
  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(chatSessions.id, id),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    );
}

export async function addUsageToSession(
  id: string,
  userId: string | null,
  usage: { tokensIn: number; tokensOut: number; tokensCached: number },
): Promise<void> {
  await db
    .update(chatSessions)
    .set({
      tokensIn: sql`${chatSessions.tokensIn} + ${usage.tokensIn}`,
      tokensOut: sql`${chatSessions.tokensOut} + ${usage.tokensOut}`,
      tokensCached: sql`${chatSessions.tokensCached} + ${usage.tokensCached}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(chatSessions.id, id),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    );
}

export async function deleteSession(id: string, userId: string | null): Promise<void> {
  await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.id, id),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    );
}

export async function getMessages(sessionId: string, userId: string | null): Promise<UIMessage[]> {
  const owner = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    )
    .limit(1);
  if (owner.length === 0) return [];
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
  userId: string | null,
  toInsert: Array<Pick<UIMessage, 'role' | 'parts'>>,
): Promise<void> {
  if (toInsert.length === 0) return;
  const owner = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    )
    .limit(1);
  if (owner.length === 0) return;
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

export async function countMessages(sessionId: string, userId: string | null): Promise<number> {
  const owner = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    )
    .limit(1);
  if (owner.length === 0) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(messages)
    .where(eq(messages.sessionId, sessionId));
  return row?.value ?? 0;
}

// Deletes the `n` most-recently-created messages in the session. No-op if n <= 0.
export async function trimTrailingMessages(
  sessionId: string,
  userId: string | null,
  n: number,
): Promise<void> {
  if (n <= 0) return;
  const owner = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        userId !== null ? eq(chatSessions.userId, userId) : isNull(chatSessions.userId),
      ),
    )
    .limit(1);
  if (owner.length === 0) return;
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
