import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/next';
import { Providers } from '@/components/providers';
import {
  AUTHOR_LINKEDIN_URL,
  AUTHOR_NAME,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/brand/site';
import './globals.css';

export const metadata: Metadata = {
  // metadataBase makes the file-convention OG/Twitter images (app/opengraph-image
  // and app/twitter-image) resolve to absolute URLs in the rendered <head>, which
  // social crawlers require.
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR_NAME, url: AUTHOR_LINKEDIN_URL }],
  alternates: { canonical: SITE_URL },
  // og:image / twitter:image are emitted automatically from the
  // app/opengraph-image.tsx and app/twitter-image.tsx route files.
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
        <Analytics />
      </body>
    </html>
  );
}
