'use client';

import useSWR from 'swr';
import { jsonFetcher } from '@/lib/swr/fetcher';

export function useBudget() {
  return useSWR<{ usedFraction: number }>('/api/budget', jsonFetcher, {
    revalidateOnFocus: false,
    fallbackData: { usedFraction: 0 },
  });
}
