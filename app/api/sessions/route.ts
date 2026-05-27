import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth';
import { listSessions } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getUserId();
  const rows = await listSessions(userId);
  return NextResponse.json(rows);
}
