import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { deleteSession, renameSession } from '@/lib/db/queries';

export const runtime = 'nodejs';

const PatchBody = z.object({ title: z.string().min(1).max(120) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }
  const userId = await getUserId();
  await renameSession(id, parsed.data.title, userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();
  await deleteSession(id, userId);
  return NextResponse.json({ ok: true });
}
