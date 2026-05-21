import { ACTION_REGISTRY } from '@/lib/json-render/catalog';
import { endpointHandlers } from '@/lib/json-render/endpoint-handlers';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await params;

  const def = ACTION_REGISTRY.get(action);
  if (!def || def.mode !== 'endpoint') {
    return Response.json({ error: 'unknown action' }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = def.params.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid params', issues: parsed.error.issues }, { status: 400 });
  }

  const handler = endpointHandlers.get(action);
  if (!handler) {
    return Response.json({ error: 'unknown action' }, { status: 404 });
  }

  try {
    return await handler(parsed.data);
  } catch (err) {
    console.error('[api/actions] handler threw', action, err);
    return Response.json({ error: 'handler failed' }, { status: 500 });
  }
}
