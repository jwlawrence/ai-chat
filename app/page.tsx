import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTHOR_LINKEDIN_URL, AUTHOR_NAME } from '@/lib/brand/site';

// Social unfurlers (LinkedIn, Twitter/X, Slack, Discord, …) and search crawlers
// don't run client JS and follow 3xx redirects inconsistently. Serve them a real
// 200 at the root so the Open Graph tags in <head> (from app/layout.tsx) are
// readable, while humans continue straight to the chat. The model endpoint
// (/api/chat) stays gated by the Turnstile cookie check regardless of this.
const CRAWLER_UA =
  /bot|crawler|spider|facebookexternalhit|LinkedInBot|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|Embedly|Pinterest|Googlebot|bingbot|Applebot|redditbot/i;

export default async function Home() {
  const userAgent = (await headers()).get('user-agent') ?? '';

  if (!CRAWLER_UA.test(userAgent)) {
    redirect('/chat');
  }

  // Crawlers read <head> for the preview card; this body is a courtesy for any
  // human who reaches the root with a crawler-like agent.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="font-mono text-muted-foreground text-xs tracking-[0.3em]">AI CHAT</span>
        <h1 className="max-w-2xl text-balance font-semibold text-3xl text-foreground sm:text-4xl">
          A chat that responds with interactive UI
        </h1>
        <p className="max-w-xl text-balance text-muted-foreground text-sm">
          A portfolio piece by{' '}
          <a
            href={AUTHOR_LINKEDIN_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            {AUTHOR_NAME}
          </a>
          . The model dynamically answers with interactive components, not plain text.
        </p>
      </div>
      <a
        href="/chat"
        className="rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm"
      >
        Open the chat →
      </a>
    </main>
  );
}
