import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { validateByokCredentials } from '@/lib/byok/validate';

export const runtime = 'nodejs';

const Body = z.object({
  key: z.string().min(1),
  baseUrl: z.string().url(),
  deploymentName: z.string().min(1),
  apiVersion: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return new Response('Sign in required', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) return new Response('Bad request', { status: 400 });

  const r = await validateByokCredentials(parsed.data);
  return new Response(JSON.stringify(r), {
    status: r.ok ? 200 : 422,
    headers: { 'content-type': 'application/json' },
  });
}
