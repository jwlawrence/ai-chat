'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

export function Providers({ children }: { children: ReactNode }) {
  return (
    // Honor the visitor's OS preference, falling back to dark. The primary
    // arrival is a cold link opened on someone else's laptop in unknown
    // lighting; forcing dark overrode a preference they already expressed.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SWRConfig value={{ revalidateOnFocus: false }}>{children}</SWRConfig>
    </ThemeProvider>
  );
}
