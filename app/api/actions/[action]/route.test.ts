import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Helper: build a Request for the action route
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, contentType = 'application/json') {
  return new Request('http://localhost/api/actions/refreshData', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// refreshData — happy paths
// ---------------------------------------------------------------------------

describe('POST /api/actions/[action] — refreshData', () => {
  it('returns 200 { ok: true } for an empty body', async () => {
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ action: 'refreshData' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('returns 200 for a body with extra fields (z.object({}) strips unknowns by default)', async () => {
    const res = await POST(makeRequest({ extra: 'value', another: 123 }), {
      params: Promise.resolve({ action: 'refreshData' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// fetchWeather — happy paths and param validation
// ---------------------------------------------------------------------------

describe('POST /api/actions/[action] — fetchWeather', () => {
  it('returns 200 with a summary string for mode: "daily"', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/fetchWeather', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'daily' }),
      }),
      { params: Promise.resolve({ action: 'fetchWeather' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.summary).toBe('string');
    expect(json.mode).toBe('daily');
  });

  it('returns 200 with a summary starting with "7-day" for mode: "weekly"', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/fetchWeather', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'weekly' }),
      }),
      { params: Promise.resolve({ action: 'fetchWeather' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toMatch(/^7-day/);
    expect(json.mode).toBe('weekly');
  });

  it('returns 400 for mode: "invalid" (Zod rejects non-literal)', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/fetchWeather', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'invalid' }),
      }),
      { params: Promise.resolve({ action: 'fetchWeather' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid params');
  });

  it('returns 400 when mode is omitted (mode is now required)', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/fetchWeather', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ action: 'fetchWeather' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid params');
  });
});

// ---------------------------------------------------------------------------
// I3 — handler exceptions become 500 (not opaque crash)
// ---------------------------------------------------------------------------

describe('POST /api/actions/[action] — I3: handler exception returns 500', () => {
  it('returns 500 with { error: "handler failed" } when the handler throws', async () => {
    // Temporarily override the fetchWeather handler to throw.
    const { endpointHandlers } = await import('@/lib/json-render/endpoint-handlers');
    const original = endpointHandlers.get('fetchWeather');
    endpointHandlers.set('fetchWeather', () => {
      throw new Error('simulated handler crash');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(
        new Request('http://localhost/api/actions/fetchWeather', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'daily' }),
        }),
        { params: Promise.resolve({ action: 'fetchWeather' }) },
      );
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json).toEqual({ error: 'handler failed' });
    } finally {
      if (original) endpointHandlers.set('fetchWeather', original);
      else endpointHandlers.delete('fetchWeather');
      consoleSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Unknown / wrong-mode actions
// ---------------------------------------------------------------------------

describe('POST /api/actions/[action] — rejected actions', () => {
  it('returns 404 for an unregistered action name', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/unknownAction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ action: 'unknownAction' }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'unknown action' });
  });

  it('returns 404 for sendToModel (registered but mode is "model", not "endpoint")', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/sendToModel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Hi' }),
      }),
      { params: Promise.resolve({ action: 'sendToModel' }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'unknown action' });
  });

  it('returns 404 for setState (registered but mode is "local", not "endpoint")', async () => {
    const res = await POST(
      new Request('http://localhost/api/actions/setState', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ action: 'setState' }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: 'unknown action' });
  });
});
