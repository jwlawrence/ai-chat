'use client';

import useSWR from 'swr';
import type { Session } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions() {
  return useSWR<Session[]>('/api/sessions', fetcher, {
    revalidateOnFocus: false,
    fallbackData: [],
  });
}
