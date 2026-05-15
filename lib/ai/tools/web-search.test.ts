import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webSearch } from './web-search';

// AI SDK `tool({ execute })` returns a Tool whose execute lives at `.execute`.
// We call it directly with the input the SDK would pass at runtime.
const execute = webSearch.execute as (input: { query: string }) => Promise<unknown>;

const ORIGINAL_KEY = process.env.BRAVE_API_KEY;

beforeEach(() => {
  process.env.BRAVE_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.BRAVE_API_KEY = ORIGINAL_KEY;
});

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
  // Override .ok if explicitly false (Response.ok is derived from status, so 200 = true by default).
  const final = init.ok === false ? new Response(JSON.stringify(body), { status: 500 }) : response;
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(final);
}

describe('webSearch tool', () => {
  it('throws when BRAVE_API_KEY is missing', async () => {
    process.env.BRAVE_API_KEY = '';
    await expect(execute({ query: 'anything' })).rejects.toThrow(/BRAVE_API_KEY/);
  });

  it('sends a GET to the Brave endpoint with the query URL-encoded and the api key header', async () => {
    mockFetchOnce({ web: { results: [] } });
    await execute({ query: 'hello world & friends' });
    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain('https://api.search.brave.com/res/v1/web/search');
    expect(url).toContain(`q=${encodeURIComponent('hello world & friends')}`);
    expect(url).toContain('count=5');
    expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('test-key');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('maps the Brave response shape into { query, results: [{title, url, snippet}] }', async () => {
    mockFetchOnce({
      web: {
        results: [
          { title: 'Title A', url: 'https://a.example', description: 'snippet A' },
          { title: 'Title B', url: 'https://b.example', description: 'snippet B' },
        ],
      },
    });

    const result = (await execute({ query: 'q' })) as {
      query: string;
      results: { title: string; url: string; snippet: string }[];
    };

    expect(result.query).toBe('q');
    expect(result.results).toEqual([
      { title: 'Title A', url: 'https://a.example', snippet: 'snippet A' },
      { title: 'Title B', url: 'https://b.example', snippet: 'snippet B' },
    ]);
  });

  it('caps results at 5 even if Brave returns more', async () => {
    const tooMany = Array.from({ length: 10 }, (_, i) => ({
      title: `t${i}`,
      url: `https://${i}.example`,
      description: `s${i}`,
    }));
    mockFetchOnce({ web: { results: tooMany } });

    const result = (await execute({ query: 'q' })) as { results: unknown[] };
    expect(result.results).toHaveLength(5);
  });

  it('returns empty results when Brave omits the web block', async () => {
    mockFetchOnce({});
    const result = (await execute({ query: 'q' })) as { results: unknown[] };
    expect(result.results).toEqual([]);
  });

  it('fills missing fields with empty strings so callers never see undefined', async () => {
    mockFetchOnce({ web: { results: [{}] } });
    const result = (await execute({ query: 'q' })) as {
      results: { title: string; url: string; snippet: string }[];
    };
    expect(result.results[0]).toEqual({ title: '', url: '', snippet: '' });
  });

  it('throws with the status code when Brave returns a non-2xx response', async () => {
    mockFetchOnce({ error: 'nope' }, { ok: false, status: 500 });
    await expect(execute({ query: 'q' })).rejects.toThrow(/500/);
  });
});
