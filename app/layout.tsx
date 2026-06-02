import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Chat',
  description: 'Chat against Azure Foundry deployments.',
  // This is a private portfolio showcase, not public content — keep it out of
  // search indexes. Emits <meta name="robots" content="noindex, nofollow">,
  // which pairs with public/robots.txt for crawler-level blocking.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <Providers>
          {children}
          <Toaster richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
