import { tool } from 'ai';
import { z } from 'zod';

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const MAX_RESULTS = 5;

type BraveResult = {
  title?: string;
  url?: string;
  description?: string;
};

type BraveResponse = {
  web?: { results?: BraveResult[] };
};

export const webSearch = tool({
  description:
    'Search the web for current information. Use this when the user asks about recent events, current facts, prices, news, or anything that may have changed since your knowledge cutoff. Do not call for general knowledge questions you can already answer.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The search query'),
  }),
  execute: async ({ query }) => {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      throw new Error('BRAVE_API_KEY is not set');
    }

    const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`Brave search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as BraveResponse;
    const results = (data.web?.results ?? []).slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }));

    return { query, results };
  },
});
