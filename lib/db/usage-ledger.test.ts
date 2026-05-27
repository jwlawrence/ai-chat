import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './client';
import { usageLedger } from './schema';
import {
  recordUsage,
  sumActorSpendToday,
  sumGlobalSpendThisMonth,
  sumGlobalSpendToday,
} from './usage-ledger';

const TEST_ACTOR = `test-actor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

afterEach(async () => {
  await db.delete(usageLedger).where(eq(usageLedger.actorId, TEST_ACTOR));
});

describe('usage-ledger', () => {
  it('records a row and reads it back at a plausible cost', async () => {
    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1000,
      tokensOut: 500,
      tokensCached: 200,
      byok: false,
    });
    const sum = await sumActorSpendToday(TEST_ACTOR);
    // Sanity bounds — would catch a pricing-table inversion or unit-of-storage bug.
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThan(0.01);
  });

  it('global aggregators see the newly recorded row (delta pattern)', async () => {
    const beforeDaily = await sumGlobalSpendToday();
    const beforeMonthly = await sumGlobalSpendThisMonth();

    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1000,
      tokensOut: 500,
      tokensCached: 0,
      byok: false,
    });

    const afterDaily = await sumGlobalSpendToday();
    const afterMonthly = await sumGlobalSpendThisMonth();
    // The delta should be positive — proves OUR row landed, not a coincidence of
    // pre-existing global data.
    expect(afterDaily).toBeGreaterThan(beforeDaily);
    expect(afterMonthly).toBeGreaterThan(beforeMonthly);
    // Monthly is always ≥ daily by definition.
    expect(afterMonthly).toBeGreaterThanOrEqual(afterDaily);
  });

  it('day filter excludes rows from prior days', async () => {
    const STALE_ACTOR = `stale-actor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await db.insert(usageLedger).values({
        actorId: STALE_ACTOR,
        actorKind: 'user',
        day: '2000-01-01',
        modelId: 'gpt-5.4-mini',
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        tokensCached: 0,
        costUsd: 100_000_000, // $100 — would dominate any aggregate
        byok: 0,
      });
      // Today's sum for this actor should be 0 despite the $100 row.
      expect(await sumActorSpendToday(STALE_ACTOR)).toBe(0);
    } finally {
      await db.delete(usageLedger).where(eq(usageLedger.actorId, STALE_ACTOR));
    }
  });

  it('records zero-cost row for a 0-token turn (model refusal)', async () => {
    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      byok: false,
    });
    // Cost is exactly 0 but the row exists — preserve the audit trail.
    const rows = await db.select().from(usageLedger).where(eq(usageLedger.actorId, TEST_ACTOR));
    expect(rows.length).toBeGreaterThan(0);
    expect(await sumActorSpendToday(TEST_ACTOR)).toBe(0);
  });

  it('excludes byok rows from BOTH actor and global aggregations', async () => {
    const beforeGlobal = await sumGlobalSpendToday();
    const beforeMonth = await sumGlobalSpendThisMonth();

    await recordUsage({
      actorId: TEST_ACTOR,
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 1_000_000,
      tokensOut: 0,
      tokensCached: 0,
      byok: true,
    });

    // Actor-scoped sum is byok-exclusion only via filter on actorId.
    expect(await sumActorSpendToday(TEST_ACTOR)).toBe(0);
    // Global aggregators must also exclude byok rows — this is the cap-protection
    // contract for Phase 5 BYOK users.
    expect(await sumGlobalSpendToday()).toBe(beforeGlobal);
    expect(await sumGlobalSpendThisMonth()).toBe(beforeMonth);
  });
});
