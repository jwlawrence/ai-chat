import { ImageResponse } from 'next/og';
import { LOGO_DATA_URI } from '@/lib/brand/logo';

// Favicon. Rendered to PNG (rather than served as raw SVG) so crawlers like
// LinkedInBot, which prefer raster icons, reliably pick it up via the emitted
// <link rel="icon"> tag.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* biome-ignore lint/performance/noImgElement: next/og renders to a static image */}
      {/* biome-ignore lint/a11y/useAltText: decorative mark inside generated image */}
      <img src={LOGO_DATA_URI} width={64} height={64} />
    </div>,
    { ...size },
  );
}
