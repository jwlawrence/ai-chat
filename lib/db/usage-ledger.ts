import { and, eq, gte, lt, sum } from 'drizzle-orm';
import type { ModelId } from '@/lib/ai/models';
import { estimateCostUSD, MODEL_PRICING } from '@/lib/ai/pricing';
import { db } from './client';
import { usageLedger } from './schema';

const MICRO_USD = 1_000_000;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfThisMonthUtc(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function firstOfNextMonthUtc(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

export interface RecordUsageInput {
  actorId: string;
  actorKind: 'user' | 'anonymous';
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  byok: boolean;
  /** Override the recorded day (UTC) — used to pin to the day preflight was checked against. */
  day?: string;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  if (!(input.modelId in MODEL_PRICING)) {
    throw new Error(
      `[usage-ledger] unknown modelId "${input.modelId}" — add it to MODEL_PRICING before recording usage`,
    );
  }
  const cost = estimateCostUSD(input.modelId as ModelId, {
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    tokensCached: input.tokensCached,
  });
  await db.insert(usageLedger).values({
    actorId: input.actorId,
    actorKind: input.actorKind,
    day: input.day ?? todayUtc(),
    modelId: input.modelId,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    tokensCached: input.tokensCached,
    costUsd: Math.round(cost * MICRO_USD),
    byok: input.byok ? 1 : 0,
  });
}

async function sumCostMicro(filter: ReturnType<typeof and>): Promise<number> {
  const rows = await db
    .select({ total: sum(usageLedger.costUsd).mapWith(Number) })
    .from(usageLedger)
    .where(filter);
  const total = rows[0]?.total ?? 0;
  if (!Number.isFinite(total)) {
    throw new Error(
      `[usage-ledger] sum aggregate returned non-finite value (${String(total)}) — DB driver or schema issue`,
    );
  }
  return total;
}

export async function sumActorSpendToday(actorId: string): Promise<number> {
  const micro = await sumCostMicro(
    and(eq(usageLedger.actorId, actorId), eq(usageLedger.day, todayUtc()), eq(usageLedger.byok, 0)),
  );
  return micro / MICRO_USD;
}

export async function sumGlobalSpendToday(): Promise<number> {
  const micro = await sumCostMicro(and(eq(usageLedger.day, todayUtc()), eq(usageLedger.byok, 0)));
  return micro / MICRO_USD;
}

export async function sumGlobalSpendThisMonth(): Promise<number> {
  const micro = await sumCostMicro(
    and(
      gte(usageLedger.day, firstOfThisMonthUtc()),
      lt(usageLedger.day, firstOfNextMonthUtc()),
      eq(usageLedger.byok, 0),
    ),
  );
  return micro / MICRO_USD;
}
