'use client';

import { ThemeProvider } from 'next-themes';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <SWRConfig value={{ revalidateOnFocus: false }}>{children}</SWRConfig>
    </ThemeProvider>
  );
}
