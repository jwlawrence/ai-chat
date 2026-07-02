'use client';

import useSWR from 'swr';
import type { Session } from '@/lib/db/schema';
import { jsonFetcher } from '@/lib/swr/fetcher';

export function useSessions() {
  return useSWR<Session[]>('/api/sessions', jsonFetcher, {
    revalidateOnFocus: false,
    fallbackData: [],
  });
}
