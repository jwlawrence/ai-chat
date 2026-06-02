'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useBudget() {
  return useSWR<{ usedFraction: number }>('/api/budget', fetcher, {
    revalidateOnFocus: false,
    fallbackData: { usedFraction: 0 },
  });
}
