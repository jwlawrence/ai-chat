import { ImageResponse } from 'next/og';
import { LOGO_DATA_URI } from '@/lib/brand/logo';

// Apple touch icon (also used by some social crawlers as the site icon).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* biome-ignore lint/performance/noImgElement: next/og renders to a static image */}
      {/* biome-ignore lint/a11y/useAltText: decorative mark inside generated image */}
      <img src={LOGO_DATA_URI} width={180} height={180} />
    </div>,
    { ...size },
  );
}
