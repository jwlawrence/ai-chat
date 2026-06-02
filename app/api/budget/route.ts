import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth';
import { CAPS } from '@/lib/budget/preflight';
import { dailyUsedFraction } from '@/lib/budget/usage-fraction';
import { sumActorSpendToday } from '@/lib/db/usage-ledger';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ usedFraction: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const spent = await sumActorSpendToday(userId);
  const usedFraction = dailyUsedFraction(spent, CAPS.userDailyUsd);
  return NextResponse.json({ usedFraction }, { headers: { 'Cache-Control': 'no-store' } });
}
