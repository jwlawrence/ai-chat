import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ getUserId: vi.fn(async () => 'user-1') }));
vi.mock('@/lib/byok/validate', () => ({
  validateByokCredentials: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => vi.clearAllMocks());

async function call(body: unknown): Promise<Response> {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/byok/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

describe('POST /api/byok/validate', () => {
  it('401 when unauthenticated', async () => {
    const { getUserId } = await import('@/lib/auth');
    (getUserId as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await call({ key: 'k', baseUrl: 'https://x.example.com', deploymentName: 'd' });
    expect(res.status).toBe(401);
  });

  it('400 when body is not valid JSON', async () => {
    const res = await call('{not json');
    expect(res.status).toBe(400);
  });

  it('400 when schema fails (missing key)', async () => {
    const res = await call({ baseUrl: 'https://x.example.com', deploymentName: 'd' });
    expect(res.status).toBe(400);
  });

  it('422 with body when validate fails', async () => {
    const { validateByokCredentials } = await import('@/lib/byok/validate');
    (validateByokCredentials as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: 'HTTP 401',
    });
    const res = await call({ key: 'k', baseUrl: 'https://x.example.com', deploymentName: 'd' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'HTTP 401' });
  });

  it('200 with ok:true when validate succeeds', async () => {
    const res = await call({ key: 'k', baseUrl: 'https://x.example.com', deploymentName: 'd' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
