// The AI Chat brand mark: a white speech bubble carrying an azure "generative"
// sparkle, set on a Bright Azure (#1E90FF) app-icon tile. This is the single
// source of truth used to generate the favicon (app/icon.tsx), the Apple touch
// icon (app/apple-icon.tsx), and the badge on the OG card (app/opengraph-image).
//
// Keep public/logo.svg in sync with this markup — that file is the standalone
// copy meant for reuse outside the app (LinkedIn Featured thumbnail, slides, etc).
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="aichatTile" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3AA0FF"/>
      <stop offset="1" stop-color="#0E78E6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#aichatTile)"/>
  <path d="M22 42 L16 52 L33 42 Z" fill="#ffffff"/>
  <rect x="12" y="13" width="40" height="30" rx="10" fill="#ffffff"/>
  <path d="M32 17 C 33 24 35.5 26.5 43 27 C 35.5 27.5 33 30 32 37 C 31 30 28.5 27.5 21 27 C 28.5 26.5 31 24 32 17 Z" fill="#1E90FF"/>
</svg>`;

// URL-encoded data URI so it can be passed to `<img>` inside next/og's
// ImageResponse without relying on Buffer (keeps the routes runtime-agnostic).
export const LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`;
