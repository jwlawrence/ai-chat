import { NextResponse } from 'next/server';
import { listSessions } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  const rows = await listSessions();
  return NextResponse.json(rows);
}
