import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

const SITE_URL = 'https://ai-chat-by-josh.vercel.app';
const TITLE = 'AI Chat, a chat that responds with interactive UI';
const DESCRIPTION =
  'A portfolio piece by Joshua Lawrence. The model dynamically answers with interactive components, not plain text.';

export const metadata: Metadata = {
  // metadataBase makes the file-convention OG/Twitter images (app/opengraph-image
  // and app/twitter-image) resolve to absolute URLs in the rendered <head>, which
  // social crawlers require.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'AI Chat',
  authors: [{ name: 'Joshua Lawrence', url: 'https://linkedin.com/in/joshlawrence' }],
  alternates: { canonical: SITE_URL },
  // og:image / twitter:image are emitted automatically from the
  // app/opengraph-image.tsx and app/twitter-image.tsx route files.
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'AI Chat',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
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
      </body>
    </html>
  );
}
