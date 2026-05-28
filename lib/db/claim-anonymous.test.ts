// lib/db/claim-anonymous.test.ts

import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { claimAnonymousSessions } from './queries';
import { chatSessions, users } from './schema';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_ANON = `anon-claim-${SUFFIX}`;
const TEST_USER = `user-claim-${SUFFIX}`;
const OTHER_USER = `other-user-claim-${SUFFIX}`;

afterEach(async () => {
  // Tests insert chat_sessions referencing test users; clean up chat_sessions
  // BEFORE the users FK (CASCADE is on, but explicit cleanup is robust).
  await db.delete(chatSessions).where(eq(chatSessions.anonymousId, TEST_ANON));
  await db.delete(users).where(eq(users.id, TEST_USER));
  await db.delete(users).where(eq(users.id, OTHER_USER));
});

describe('claimAnonymousSessions', () => {
  it('attaches all matching anonymous sessions to a user', async () => {
    await db.insert(users).values({ id: TEST_USER, email: `${TEST_USER}@test.local` });
    // Two anonymous sessions for the same anonId.
    await db.insert(chatSessions).values([
      { anonymousId: TEST_ANON, model: 'gpt-5.4-mini' },
      { anonymousId: TEST_ANON, model: 'gpt-5.4' },
    ]);

    await claimAnonymousSessions({ anonymousId: TEST_ANON, userId: TEST_USER });

    const claimed = await db.select().from(chatSessions).where(eq(chatSessions.userId, TEST_USER));
    expect(claimed.length).toBe(2);
    for (const row of claimed) expect(row.anonymousId).toBe(TEST_ANON);
  });

  it('does NOT overwrite sessions already owned by a different user', async () => {
    await db.insert(users).values([
      { id: TEST_USER, email: `${TEST_USER}@test.local` },
      { id: OTHER_USER, email: `${OTHER_USER}@test.local` },
    ]);
    // Pre-owned by OTHER_USER but has matching anonymous_id.
    await db.insert(chatSessions).values({
      anonymousId: TEST_ANON,
      userId: OTHER_USER,
      model: 'gpt-5.4-mini',
    });

    await claimAnonymousSessions({ anonymousId: TEST_ANON, userId: TEST_USER });

    // Should still belong to OTHER_USER.
    const stillOther = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.anonymousId, TEST_ANON), eq(chatSessions.userId, OTHER_USER)));
    expect(stillOther.length).toBe(1);
    // And nothing new attached to TEST_USER.
    const nothingForTestUser = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, TEST_USER));
    expect(nothingForTestUser.length).toBe(0);
  });

  it('is a no-op when no sessions match the anonymousId', async () => {
    await db.insert(users).values({ id: TEST_USER, email: `${TEST_USER}@test.local` });
    await expect(
      claimAnonymousSessions({ anonymousId: TEST_ANON, userId: TEST_USER }),
    ).resolves.toBeUndefined();
    // Sanity: nothing was attached.
    const rows = await db.select().from(chatSessions).where(eq(chatSessions.userId, TEST_USER));
    expect(rows.length).toBe(0);
  });

  it('leaves unrelated anonymous sessions alone (only claims matching anonymousId)', async () => {
    const UNRELATED_ANON = `unrelated-anon-${SUFFIX}`;
    await db.insert(users).values({ id: TEST_USER, email: `${TEST_USER}@test.local` });
    await db.insert(chatSessions).values([
      { anonymousId: TEST_ANON, model: 'gpt-5.4-mini' },
      { anonymousId: UNRELATED_ANON, model: 'gpt-5.4-mini' },
    ]);

    try {
      await claimAnonymousSessions({ anonymousId: TEST_ANON, userId: TEST_USER });
      const unrelated = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.anonymousId, UNRELATED_ANON), isNull(chatSessions.userId)));
      expect(unrelated.length).toBe(1);
    } finally {
      await db.delete(chatSessions).where(eq(chatSessions.anonymousId, UNRELATED_ANON));
    }
  });
});
