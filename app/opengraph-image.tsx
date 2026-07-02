import { ImageResponse } from 'next/og';
import { LOGO_DATA_URI } from '@/lib/brand/logo';
import { AUTHOR_NAME, SITE_URL } from '@/lib/brand/site';

export const alt = 'AI Chat, a chat that responds with interactive UI';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Branded 1200x630 card generated at build time. Dark canvas with the app's
// Bright Azure accent (#1E90FF) so the LinkedIn/Twitter preview reads as a
// polished portfolio piece rather than a bare link.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: '#09090b',
        backgroundImage:
          'radial-gradient(circle at 80% 15%, rgba(30,144,255,0.30), transparent 55%)',
        color: '#fafafa',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* biome-ignore lint/performance/noImgElement: next/og renders to a static image */}
        {/* biome-ignore lint/a11y/useAltText: decorative mark inside generated image */}
        <img src={LOGO_DATA_URI} width={64} height={64} />
        <div
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 5,
            color: '#a1a1aa',
          }}
        >
          AI CHAT
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            fontSize: 80,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 980,
          }}
        >
          A chat that responds with interactive UI
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            lineHeight: 1.35,
            color: '#d4d4d8',
            maxWidth: 900,
          }}
        >
          The model dynamically answers with interactive components, not plain text.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 600 }}>{AUTHOR_NAME}</div>
        <div style={{ display: 'flex', fontSize: 26, color: '#71717a' }}>
          {new URL(SITE_URL).host}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
